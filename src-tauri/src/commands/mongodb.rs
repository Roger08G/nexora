use futures_util::TryStreamExt;
use mongodb::{
    bson::{doc, Bson, Document},
    options::ClientOptions,
    Client,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use tauri::State;
use uuid::Uuid;

use crate::{
    error::{AppError, CommandResult},
    limits::{MAX_JSON_DOCUMENT_BYTES, MAX_RESULT_BYTES, MAX_URL_BYTES},
    state::AppState,
};

const MAX_ACTIVE_CONNECTIONS: usize = 16;
const MAX_CONNECT_ATTEMPTS: usize = 4;
const MAX_DOCUMENTS: i64 = 200;
const MAX_INDEXES: usize = 1_000;
const MONGO_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MONGO_OPERATION_TIMEOUT: Duration = Duration::from_secs(30);
const MONGO_MAX_POOL_SIZE: u32 = 10;
const MAX_SAFE_JSON_INTEGER: i64 = 9_007_199_254_740_991;

static MONGO_OPERATIONS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(16);

async fn with_mongo_deadline<T: Send + 'static, E: From<AppError> + Send + 'static>(
    operation: impl std::future::Future<Output = Result<T, E>> + Send + 'static,
) -> Result<T, E> {
    mongo_deadline_after(operation, MONGO_OPERATION_TIMEOUT).await
}

async fn mongo_deadline_after<T: Send + 'static, E: From<AppError> + Send + 'static>(
    operation: impl std::future::Future<Output = Result<T, E>> + Send + 'static,
    deadline: Duration,
) -> Result<T, E> {
    let permit = MONGO_OPERATIONS.try_acquire().map_err(|_| {
        E::from(AppError::Conflict(
            "MongoDB alcanzó el límite de operaciones pendientes".into(),
        ))
    })?;
    // MongoDB futures are not cancellation-safe (driver RUST-937). Time out the
    // JoinHandle while the bounded worker retains its permit until completion.
    let worker = tauri::async_runtime::spawn(async move {
        let _permit = permit;
        operation.await
    });
    tokio::time::timeout(deadline, worker)
        .await
        .map_err(|_| E::from(AppError::Validation(
            "MongoDB superó el tiempo de espera; comprueba el estado antes de repetir una escritura".into(),
        )))?
        .map_err(|_| E::from(AppError::Internal("La operación MongoDB no pudo completarse".into())))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoConnectionInput {
    uri: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoConnectionOutput {
    connection_id: String,
    databases: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoFindInput {
    connection_id: String,
    database: String,
    collection: String,
    #[serde(default = "empty_document")]
    filter: String,
    projection: Option<String>,
    sort: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoFindOutput {
    documents: Vec<Value>,
    count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoIndexOutput {
    name: String,
    keys: Value,
    unique: bool,
    sparse: bool,
    expire_after_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoWriteInput {
    connection_id: String,
    database: String,
    collection: String,
    document: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoUpdateInput {
    connection_id: String,
    database: String,
    collection: String,
    filter: String,
    update: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDeleteInput {
    connection_id: String,
    database: String,
    collection: String,
    filter: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCreateCollectionInput {
    connection_id: String,
    database: String,
    collection: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoInsertOutput {
    inserted_id: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoUpdateOutput {
    matched_count: u64,
    modified_count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDeleteOutput {
    deleted_count: u64,
}

#[tauri::command]
pub async fn connect_mongodb(
    state: State<'_, AppState>,
    input: MongoConnectionInput,
) -> CommandResult<MongoConnectionOutput> {
    if state
        .mongo
        .lock()
        .map_err(|_| AppError::Internal("El estado de MongoDB está bloqueado".into()))?
        .len()
        >= MAX_ACTIVE_CONNECTIONS
    {
        return Err(AppError::Conflict(format!(
            "Nexora admite hasta {MAX_ACTIVE_CONNECTIONS} conexiones MongoDB activas"
        ))
        .into());
    }
    let attempts = state.mongo_connect_attempts.clone();
    let (client, databases) = with_mongo_deadline(async move {
        let _attempt = acquire_connect_attempt(&attempts)?;
        let uri = input.uri.trim();
        if uri.len() > MAX_URL_BYTES
            || !(uri.starts_with("mongodb://") || uri.starts_with("mongodb+srv://"))
        {
            return Err(AppError::Validation(
                "La URI debe comenzar por mongodb:// o mongodb+srv://".into(),
            )
            .into());
        }

        let mut options = ClientOptions::parse(uri).await.map_err(mongo_error)?;
        options.connect_timeout = Some(
            options
                .connect_timeout
                .unwrap_or(MONGO_CONNECT_TIMEOUT)
                .min(MONGO_CONNECT_TIMEOUT),
        );
        options.server_selection_timeout = Some(
            options
                .server_selection_timeout
                .unwrap_or(MONGO_CONNECT_TIMEOUT)
                .min(MONGO_CONNECT_TIMEOUT),
        );
        let max_pool_size = options
            .max_pool_size
            .unwrap_or(MONGO_MAX_POOL_SIZE)
            .clamp(1, MONGO_MAX_POOL_SIZE);
        options.max_pool_size = Some(max_pool_size);
        options.max_connecting = Some(options.max_connecting.unwrap_or(2).clamp(1, 2));
        options.min_pool_size = options.min_pool_size.map(|size| size.min(max_pool_size));
        let client = Client::with_options(options).map_err(mongo_error)?;
        client
            .database("admin")
            .run_command(doc! { "ping": 1 })
            .await
            .map_err(mongo_error)?;
        let mut databases = client.list_database_names().await.map_err(mongo_error)?;
        databases.sort_by_key(|name| name.to_lowercase());

        Ok::<_, crate::error::CommandError>((client, databases))
    })
    .await?;
    let connection_id = Uuid::new_v4().to_string();
    let mut connections = state
        .mongo
        .lock()
        .map_err(|_| AppError::Internal("El estado de MongoDB está bloqueado".into()))?;
    if connections.len() >= MAX_ACTIVE_CONNECTIONS {
        return Err(AppError::Conflict(format!(
            "Nexora admite hasta {MAX_ACTIVE_CONNECTIONS} conexiones MongoDB activas"
        ))
        .into());
    }
    connections.insert(connection_id.clone(), client);

    Ok(MongoConnectionOutput {
        connection_id,
        databases,
    })
}

#[tauri::command]
pub fn disconnect_mongodb(state: State<'_, AppState>, connection_id: String) -> CommandResult<()> {
    validate_connection_id(&connection_id)?;
    state
        .mongo
        .lock()
        .map_err(|_| AppError::Internal("El estado de MongoDB está bloqueado".into()))?
        .remove(&connection_id);
    Ok(())
}

#[tauri::command]
pub async fn list_mongodb_databases(
    state: State<'_, AppState>,
    connection_id: String,
) -> CommandResult<Vec<String>> {
    let client = mongo_client(&state, &connection_id)?;
    with_mongo_deadline(async move {
        let mut names = client.list_database_names().await.map_err(mongo_error)?;
        names.sort_by_key(|name| name.to_lowercase());
        Ok(names)
    })
    .await
}

#[tauri::command]
pub async fn list_mongodb_collections(
    state: State<'_, AppState>,
    connection_id: String,
    database: String,
) -> CommandResult<Vec<String>> {
    validate_namespace(&database, "base de datos")?;
    let client = mongo_client(&state, &connection_id)?;
    with_mongo_deadline(async move {
        let mut names = client
            .database(&database)
            .list_collection_names()
            .await
            .map_err(mongo_error)?;
        names.retain(|collection| !is_protected_collection(&database, collection));
        names.sort_by_key(|name| name.to_lowercase());
        Ok(names)
    })
    .await
}

#[tauri::command]
pub async fn list_mongodb_indexes(
    state: State<'_, AppState>,
    connection_id: String,
    database: String,
    collection: String,
) -> CommandResult<Vec<MongoIndexOutput>> {
    validate_namespace(&database, "base de datos")?;
    validate_namespace(&collection, "colección")?;
    validate_collection_access(&database, &collection)?;
    let client = mongo_client(&state, &connection_id)?;
    with_mongo_deadline(async move {
        let mut cursor = client
            .database(&database)
            .collection::<Document>(&collection)
            .list_indexes()
            .max_time(MONGO_OPERATION_TIMEOUT)
            .await
            .map_err(mongo_error)?;
        let mut indexes = Vec::new();
        while let Some(index) = cursor.try_next().await.map_err(mongo_error)? {
            if indexes.len() >= MAX_INDEXES {
                return Err(AppError::Validation(format!(
                    "La colección supera el límite de {MAX_INDEXES} índices"
                ))
                .into());
            }
            let options = index.options.as_ref();
            indexes.push(MongoIndexOutput {
                name: options
                    .and_then(|options| options.name.clone())
                    .unwrap_or_else(|| "Índice sin nombre".into()),
                keys: bson_to_json(Bson::Document(index.keys)),
                unique: options.and_then(|options| options.unique).unwrap_or(false),
                sparse: options.and_then(|options| options.sparse).unwrap_or(false),
                expire_after_seconds: options
                    .and_then(|options| options.expire_after)
                    .map(|duration| duration.as_secs()),
            });
        }
        indexes.sort_by_key(|index| index.name.to_lowercase());
        Ok(indexes)
    })
    .await
}

#[tauri::command]
pub async fn create_mongodb_collection(
    state: State<'_, AppState>,
    input: MongoCreateCollectionInput,
) -> CommandResult<()> {
    validate_namespace(&input.database, "base de datos")?;
    validate_namespace(&input.collection, "colección")?;
    validate_collection_access(&input.database, &input.collection)?;
    let client = mongo_client(&state, &input.connection_id)?;
    with_mongo_deadline(async move {
        client
            .database(&input.database)
            .create_collection(&input.collection)
            .await
            .map_err(mongo_error)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn find_mongodb(
    state: State<'_, AppState>,
    input: MongoFindInput,
) -> CommandResult<MongoFindOutput> {
    validate_namespace(&input.database, "base de datos")?;
    validate_namespace(&input.collection, "colección")?;
    validate_collection_access(&input.database, &input.collection)?;
    let client = mongo_client(&state, &input.connection_id)?;
    with_mongo_deadline(async move {
        let collection = client
            .database(&input.database)
            .collection::<Document>(&input.collection);
        let filter = parse_document(&input.filter, "filtro")?;
        let limit = input.limit.unwrap_or(20).clamp(1, MAX_DOCUMENTS);

        let mut action = collection
            .find(filter)
            .limit(limit)
            .max_time(MONGO_OPERATION_TIMEOUT);
        if let Some(projection) = parse_optional_document(input.projection, "proyección")? {
            action = action.projection(projection);
        }
        if let Some(sort) = parse_optional_document(input.sort, "ordenación")? {
            action = action.sort(sort);
        }

        let mut cursor = action.await.map_err(mongo_error)?;
        let mut documents = Vec::new();
        let mut result_bytes = 0_usize;
        while let Some(document) = cursor.try_next().await.map_err(mongo_error)? {
            let document = bson_to_json(Bson::Document(document));
            result_bytes = result_bytes.saturating_add(serde_json::to_vec(&document)?.len());
            if result_bytes > MAX_RESULT_BYTES {
                return Err(AppError::Validation(format!(
                    "El resultado MongoDB supera el límite de {} MiB",
                    MAX_RESULT_BYTES / 1024 / 1024
                ))
                .into());
            }
            documents.push(document);
        }
        let count = documents.len();
        Ok(MongoFindOutput { documents, count })
    })
    .await
}

#[tauri::command]
pub async fn insert_mongodb_document(
    state: State<'_, AppState>,
    input: MongoWriteInput,
) -> CommandResult<MongoInsertOutput> {
    validate_namespace(&input.database, "base de datos")?;
    validate_namespace(&input.collection, "colección")?;
    validate_collection_access(&input.database, &input.collection)?;
    let client = mongo_client(&state, &input.connection_id)?;
    with_mongo_deadline(async move {
        let document = parse_document(&input.document, "documento")?;
        let result = client
            .database(&input.database)
            .collection::<Document>(&input.collection)
            .insert_one(document)
            .await
            .map_err(mongo_error)?;
        Ok(MongoInsertOutput {
            inserted_id: bson_to_json(result.inserted_id),
        })
    })
    .await
}

#[tauri::command]
pub async fn update_mongodb_document(
    state: State<'_, AppState>,
    input: MongoUpdateInput,
) -> CommandResult<MongoUpdateOutput> {
    validate_namespace(&input.database, "base de datos")?;
    validate_namespace(&input.collection, "colección")?;
    validate_collection_access(&input.database, &input.collection)?;
    let client = mongo_client(&state, &input.connection_id)?;
    with_mongo_deadline(async move {
        let filter = parse_document(&input.filter, "filtro")?;
        let update = parse_document(&input.update, "actualización")?;
        if filter.is_empty() {
            return Err(AppError::Validation(
                "Una actualización requiere un filtro no vacío".into(),
            )
            .into());
        }
        let result = client
            .database(&input.database)
            .collection::<Document>(&input.collection)
            .update_one(filter, update)
            .await
            .map_err(mongo_error)?;
        Ok(MongoUpdateOutput {
            matched_count: result.matched_count,
            modified_count: result.modified_count,
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_mongodb_document(
    state: State<'_, AppState>,
    input: MongoDeleteInput,
) -> CommandResult<MongoDeleteOutput> {
    validate_namespace(&input.database, "base de datos")?;
    validate_namespace(&input.collection, "colección")?;
    validate_collection_access(&input.database, &input.collection)?;
    let client = mongo_client(&state, &input.connection_id)?;
    with_mongo_deadline(async move {
        let filter = parse_document(&input.filter, "filtro")?;
        if filter.is_empty() {
            return Err(
                AppError::Validation("Un borrado requiere un filtro no vacío".into()).into(),
            );
        }
        let result = client
            .database(&input.database)
            .collection::<Document>(&input.collection)
            .delete_one(filter)
            .await
            .map_err(mongo_error)?;
        Ok(MongoDeleteOutput {
            deleted_count: result.deleted_count,
        })
    })
    .await
}

fn mongo_client(state: &AppState, connection_id: &str) -> Result<Client, AppError> {
    validate_connection_id(connection_id)?;
    state
        .mongo
        .lock()
        .map_err(|_| AppError::Internal("El estado de MongoDB está bloqueado".into()))?
        .get(connection_id)
        .cloned()
        .ok_or_else(|| AppError::NotFound("La conexión MongoDB ya no está activa".into()))
}

struct ConnectAttempt<'a>(&'a AtomicUsize);

impl Drop for ConnectAttempt<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

fn acquire_connect_attempt(counter: &AtomicUsize) -> Result<ConnectAttempt<'_>, AppError> {
    counter
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            (current < MAX_CONNECT_ATTEMPTS).then_some(current + 1)
        })
        .map_err(|_| {
            AppError::Conflict(format!(
                "Nexora admite hasta {MAX_CONNECT_ATTEMPTS} conexiones MongoDB simultáneas"
            ))
        })?;
    Ok(ConnectAttempt(counter))
}

fn parse_document(value: &str, label: &str) -> Result<Document, AppError> {
    let value = if value.trim().is_empty() { "{}" } else { value };
    if value.len() > MAX_JSON_DOCUMENT_BYTES {
        return Err(AppError::Validation(format!(
            "El {label} supera el límite de {} MiB",
            MAX_JSON_DOCUMENT_BYTES / 1024 / 1024
        )));
    }
    serde_json::from_str(value)
        .map_err(|error| AppError::Validation(format!("JSON de {label} no válido: {error}")))
}

fn parse_optional_document(
    value: Option<String>,
    label: &str,
) -> Result<Option<Document>, AppError> {
    value
        .filter(|value| !value.trim().is_empty())
        .map(|value| parse_document(&value, label))
        .transpose()
}

fn validate_namespace(value: &str, label: &str) -> Result<(), AppError> {
    if value.trim().is_empty() || value.trim() != value || value.len() > 255 || value.contains('\0')
    {
        return Err(AppError::Validation(format!("Nombre de {label} no válido")));
    }
    Ok(())
}

fn validate_connection_id(connection_id: &str) -> Result<(), AppError> {
    let valid = !connection_id.is_empty()
        && connection_id.len() <= 80
        && connection_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
    if valid {
        Ok(())
    } else {
        Err(AppError::Validation(
            "Identificador de conexión MongoDB no válido".into(),
        ))
    }
}

fn validate_collection_access(database: &str, collection: &str) -> Result<(), AppError> {
    if is_protected_collection(database, collection) {
        Err(AppError::Validation(
            "MongoDB protege config.system.sessions y no permite operaciones directas".into(),
        ))
    } else {
        Ok(())
    }
}

fn is_protected_collection(database: &str, collection: &str) -> bool {
    database == "config" && collection == "system.sessions"
}

fn mongo_error(error: mongodb::error::Error) -> AppError {
    let message = error.to_string();
    if message.contains("Error code 13") || message.contains("Unauthorized") {
        AppError::Validation(
            "MongoDB rechazó la operación porque la conexión no tiene permisos".into(),
        )
    } else {
        AppError::Mongo(error)
    }
}

fn bson_to_json(value: Bson) -> Value {
    match value {
        Bson::Int64(integer)
            if !(-MAX_SAFE_JSON_INTEGER..=MAX_SAFE_JSON_INTEGER).contains(&integer) =>
        {
            // JSON numbers become JavaScript doubles in the WebView. Canonical
            // Extended JSON keeps large IDs exact and can be submitted unchanged
            // to the document editor/filter parser without changing their type.
            Bson::Int64(integer).into_canonical_extjson()
        }
        Bson::Document(document) => Value::Object(
            document
                .into_iter()
                .map(|(key, value)| (key, bson_to_json(value)))
                .collect(),
        ),
        Bson::Array(values) => Value::Array(values.into_iter().map(bson_to_json).collect()),
        other => other.into_relaxed_extjson(),
    }
}

fn empty_document() -> String {
    "{}".into()
}

#[cfg(test)]
mod tests {
    use super::{is_protected_collection, parse_document};

    #[test]
    fn parses_strict_json_filters() {
        let filter = parse_document(r#"{"role":"developer"}"#, "filtro").unwrap();
        assert_eq!(filter.get_str("role").unwrap(), "developer");
        assert!(parse_document("{ role: 'developer' }", "filtro").is_err());
    }

    #[test]
    fn identifies_the_protected_session_collection() {
        assert!(is_protected_collection("config", "system.sessions"));
        assert!(!is_protected_collection("app", "sessions"));
    }

    #[test]
    fn large_int64_values_round_trip_through_extended_json_without_precision_loss() {
        let original = mongodb::bson::doc! {
            "_id": i64::MAX,
            "nested": { "minimum": i64::MIN },
            "values": [9_007_199_254_740_993_i64, 42_i64],
        };
        let rendered = super::bson_to_json(mongodb::bson::Bson::Document(original.clone()));
        assert_eq!(rendered["_id"]["$numberLong"], i64::MAX.to_string());
        assert_eq!(
            rendered["nested"]["minimum"]["$numberLong"],
            i64::MIN.to_string()
        );
        assert_eq!(rendered["values"][0]["$numberLong"], "9007199254740993");
        assert_eq!(rendered["values"][1], 42);
        let reparsed = parse_document(&rendered.to_string(), "documento").unwrap();
        assert_eq!(reparsed.get_i64("_id").unwrap(), i64::MAX);
        assert_eq!(
            reparsed
                .get_document("nested")
                .unwrap()
                .get_i64("minimum")
                .unwrap(),
            i64::MIN
        );
        assert_eq!(
            reparsed.get_array("values").unwrap()[0],
            mongodb::bson::Bson::Int64(9_007_199_254_740_993)
        );
        for integer in [-super::MAX_SAFE_JSON_INTEGER, super::MAX_SAFE_JSON_INTEGER] {
            assert_eq!(
                super::bson_to_json(mongodb::bson::Bson::Int64(integer)),
                serde_json::json!(integer)
            );
        }
    }

    #[test]
    fn a_timed_out_mongodb_operation_finishes_safely_and_retains_its_attempt_until_done() {
        let attempts = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        tauri::async_runtime::block_on(async {
            let (started_tx, started_rx) = tokio::sync::oneshot::channel();
            let (finish_tx, finish_rx) = tokio::sync::oneshot::channel();
            let (done_tx, done_rx) = tokio::sync::oneshot::channel();
            let worker_attempts = attempts.clone();
            let result = super::mongo_deadline_after(
                async move {
                    let attempt = super::acquire_connect_attempt(&worker_attempts)?;
                    started_tx.send(()).unwrap();
                    finish_rx.await.unwrap();
                    drop(attempt);
                    done_tx.send(()).unwrap();
                    Ok::<_, crate::error::AppError>(())
                },
                std::time::Duration::from_millis(20),
            )
            .await;
            assert!(result.unwrap_err().to_string().contains("tiempo de espera"));
            started_rx.await.unwrap();
            assert_eq!(attempts.load(std::sync::atomic::Ordering::Acquire), 1);
            finish_tx.send(()).unwrap();
            done_rx.await.unwrap();
        });
        assert_eq!(attempts.load(std::sync::atomic::Ordering::Acquire), 0);
    }
}

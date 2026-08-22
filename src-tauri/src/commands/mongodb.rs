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
    let _attempt = acquire_connect_attempt(&state.mongo_connect_attempts)?;
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
    let mut names = client.list_database_names().await.map_err(mongo_error)?;
    names.sort_by_key(|name| name.to_lowercase());
    Ok(names)
}

#[tauri::command]
pub async fn list_mongodb_collections(
    state: State<'_, AppState>,
    connection_id: String,
    database: String,
) -> CommandResult<Vec<String>> {
    validate_namespace(&database, "base de datos")?;
    let client = mongo_client(&state, &connection_id)?;
    let mut names = client
        .database(&database)
        .list_collection_names()
        .await
        .map_err(mongo_error)?;
    names.retain(|collection| !is_protected_collection(&database, collection));
    names.sort_by_key(|name| name.to_lowercase());
    Ok(names)
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
    client
        .database(&input.database)
        .create_collection(&input.collection)
        .await
        .map_err(mongo_error)?;
    Ok(())
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
    let filter = parse_document(&input.filter, "filtro")?;
    let update = parse_document(&input.update, "actualización")?;
    if filter.is_empty() {
        return Err(
            AppError::Validation("Una actualización requiere un filtro no vacío".into()).into(),
        );
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
    let filter = parse_document(&input.filter, "filtro")?;
    if filter.is_empty() {
        return Err(AppError::Validation("Un borrado requiere un filtro no vacío".into()).into());
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
    value.into_relaxed_extjson()
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
}

use std::{collections::BTreeMap, path::PathBuf, time::Instant};

use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::State;
use tokio_postgres::{error::SqlState, types::Type, SimpleQueryMessage, SimpleQueryStream};

use crate::{
    commands::postgresql_runtime::{managed_client, MANAGED_DATABASE},
    error::{AppError, CommandResult},
    limits::{MAX_CSV_BYTES, MAX_RESULT_BYTES, MAX_SQL_BYTES},
    state::AppState,
    storage::write_text_atomic,
};

const DEFAULT_ROW_LIMIT: usize = 500;
const MAX_ROW_LIMIT: usize = 1_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresColumn {
    data_type: String,
    name: String,
    nullable: bool,
    primary_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresTable {
    columns: Vec<PostgresColumn>,
    kind: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresSchema {
    name: String,
    tables: Vec<PostgresTable>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresDatabase {
    name: String,
    schemas: Vec<PostgresSchema>,
    server_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresQueryResult {
    affected_rows: u64,
    columns: Vec<String>,
    duration_ms: f64,
    readonly: bool,
    rows: Vec<Value>,
    truncated: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresCsvInput {
    columns: Vec<String>,
    path: String,
    rows: Vec<Value>,
}

#[tauri::command]
pub async fn inspect_postgresql(
    state: State<'_, AppState>,
    connection_id: String,
) -> CommandResult<PostgresDatabase> {
    inspect_internal(&state, &connection_id)
        .await
        .map_err(Into::into)
}

pub(crate) async fn inspect_internal(
    state: &AppState,
    connection_id: &str,
) -> Result<PostgresDatabase, AppError> {
    let client = managed_client(state, connection_id).await?;
    let server_version: String = client.query_one("SHOW server_version", &[]).await?.get(0);
    let schema_rows = client
        .query(
            "SELECT nspname FROM pg_namespace \
             WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' \
             ORDER BY lower(nspname)",
            &[],
        )
        .await?;
    let table_rows = client
        .query(
            "SELECT table_schema, table_name, table_type \
             FROM information_schema.tables \
             WHERE table_schema NOT LIKE 'pg_%' AND table_schema <> 'information_schema' \
             ORDER BY lower(table_schema), lower(table_name)",
            &[],
        )
        .await?;
    let column_rows = client
        .query(
            "SELECT c.table_schema, c.table_name, c.column_name, c.data_type, \
                    c.is_nullable = 'YES' AS nullable, \
                    EXISTS ( \
                        SELECT 1 FROM information_schema.table_constraints tc \
                        JOIN information_schema.key_column_usage kcu \
                          ON tc.constraint_name = kcu.constraint_name \
                         AND tc.constraint_schema = kcu.constraint_schema \
                       WHERE tc.constraint_type = 'PRIMARY KEY' \
                         AND tc.table_schema = c.table_schema \
                         AND tc.table_name = c.table_name \
                         AND kcu.column_name = c.column_name \
                    ) AS primary_key \
             FROM information_schema.columns c \
             WHERE c.table_schema NOT LIKE 'pg_%' AND c.table_schema <> 'information_schema' \
             ORDER BY c.table_schema, c.table_name, c.ordinal_position",
            &[],
        )
        .await?;

    let mut columns: BTreeMap<(String, String), Vec<PostgresColumn>> = BTreeMap::new();
    for row in column_rows {
        columns
            .entry((row.get(0), row.get(1)))
            .or_default()
            .push(PostgresColumn {
                name: row.get(2),
                data_type: row.get(3),
                nullable: row.get(4),
                primary_key: row.get(5),
            });
    }

    let mut tables: BTreeMap<String, Vec<PostgresTable>> = BTreeMap::new();
    for row in table_rows {
        let schema: String = row.get(0);
        let name: String = row.get(1);
        tables
            .entry(schema.clone())
            .or_default()
            .push(PostgresTable {
                columns: columns.remove(&(schema, name.clone())).unwrap_or_default(),
                kind: row.get(2),
                name,
            });
    }

    let schemas = schema_rows
        .into_iter()
        .map(|row| {
            let name: String = row.get(0);
            PostgresSchema {
                tables: tables.remove(&name).unwrap_or_default(),
                name,
            }
        })
        .collect();

    Ok(PostgresDatabase {
        name: MANAGED_DATABASE.into(),
        schemas,
        server_version,
    })
}

#[tauri::command]
pub async fn execute_postgresql(
    state: State<'_, AppState>,
    connection_id: String,
    sql: String,
    allow_write: bool,
    row_limit: Option<usize>,
) -> CommandResult<PostgresQueryResult> {
    execute_internal(&state, &connection_id, &sql, allow_write, row_limit)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub fn export_postgresql_csv(input: PostgresCsvInput) -> CommandResult<()> {
    export_csv_internal(input).map_err(Into::into)
}

fn export_csv_internal(input: PostgresCsvInput) -> Result<(), AppError> {
    let path = PathBuf::from(input.path.trim());
    if input.path.len() > 32_768
        || !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("csv"))
    {
        return Err(AppError::Validation(
            "Selecciona una ruta absoluta con extensión .csv".into(),
        ));
    }
    if input.columns.is_empty()
        || input.columns.len() > 500
        || input
            .columns
            .iter()
            .any(|column| column.is_empty() || column.len() > 1_024)
        || input.rows.len() > MAX_ROW_LIMIT
    {
        return Err(AppError::Validation(
            "El resultado no se puede exportar como CSV".into(),
        ));
    }

    let mut csv = String::from("\u{feff}");
    append_csv_row(
        &mut csv,
        input
            .columns
            .iter()
            .map(|column| prevent_spreadsheet_formula(column)),
    )?;
    for row in &input.rows {
        let object = row.as_object().ok_or_else(|| {
            AppError::Validation("El resultado PostgreSQL contiene una fila no válida".into())
        })?;
        append_csv_row(
            &mut csv,
            input
                .columns
                .iter()
                .map(|column| csv_value(object.get(column))),
        )?;
    }
    write_text_atomic(&path, &csv, MAX_CSV_BYTES)?;
    Ok(())
}

fn append_csv_row(
    csv: &mut String,
    values: impl Iterator<Item = impl AsRef<str>>,
) -> Result<(), AppError> {
    for (index, value) in values.enumerate() {
        if index > 0 {
            csv.push(',');
        }
        csv.push_str(&escape_csv_cell(value.as_ref()));
        if csv.len() > MAX_CSV_BYTES {
            return Err(AppError::Validation(format!(
                "El CSV supera el límite de {} MiB",
                MAX_CSV_BYTES / 1024 / 1024
            )));
        }
    }
    csv.push_str("\r\n");
    if csv.len() > MAX_CSV_BYTES {
        return Err(AppError::Validation(format!(
            "El CSV supera el límite de {} MiB",
            MAX_CSV_BYTES / 1024 / 1024
        )));
    }
    Ok(())
}

fn csv_value(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(value)) => prevent_spreadsheet_formula(value),
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Number(value)) => value.to_string(),
        Some(value) => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn prevent_spreadsheet_formula(value: &str) -> String {
    if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.into()
    }
}

fn escape_csv_cell(value: &str) -> String {
    if value.contains([',', '"', '\r', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.into()
    }
}

pub(crate) async fn execute_internal(
    state: &AppState,
    connection_id: &str,
    sql: &str,
    allow_write: bool,
    row_limit: Option<usize>,
) -> Result<PostgresQueryResult, AppError> {
    let sql = sql.trim();
    if sql.is_empty() {
        return Err(AppError::Validation("Escribe una sentencia SQL".into()));
    }
    if sql.len() > MAX_SQL_BYTES {
        return Err(AppError::Validation(
            "La sentencia SQL es demasiado grande".into(),
        ));
    }
    if !allow_write && requires_confirmation(sql) {
        return Err(AppError::Validation(
            "La sentencia modificará PostgreSQL y requiere confirmación".into(),
        ));
    }
    let client = managed_client(state, connection_id).await?;
    let statement = client.prepare(sql).await.map_err(|error| {
        if error
            .as_db_error()
            .is_some_and(|error| error.message().contains("multiple commands"))
        {
            AppError::Validation("Ejecuta una sola sentencia SQL cada vez".into())
        } else {
            AppError::Postgres(error)
        }
    })?;
    let column_types: Vec<Type> = statement
        .columns()
        .iter()
        .map(|column| column.type_().clone())
        .collect();

    let started = Instant::now();
    let messages = if allow_write {
        client.simple_query_raw(sql).await?
    } else {
        client.batch_execute("BEGIN TRANSACTION READ ONLY").await?;
        match client.simple_query_raw(sql).await {
            Ok(messages) => messages,
            Err(error)
                if error
                    .as_db_error()
                    .is_some_and(|error| error.code() == &SqlState::READ_ONLY_SQL_TRANSACTION) =>
            {
                let _ = client.batch_execute("ROLLBACK").await;
                return Err(AppError::Validation(
                    "La sentencia modificará PostgreSQL y requiere confirmación".into(),
                ));
            }
            Err(error) => {
                let _ = client.batch_execute("ROLLBACK").await;
                return Err(error.into());
            }
        }
    };

    let row_limit = row_limit
        .unwrap_or(DEFAULT_ROW_LIMIT)
        .clamp(1, MAX_ROW_LIMIT);
    let result = collect_query(messages, &column_types, row_limit).await;
    if !allow_write {
        let rollback = client.batch_execute("ROLLBACK").await;
        if result.is_ok() {
            rollback?;
        }
    }
    let (affected_rows, columns, rows, truncated) = result.map_err(|error| match error {
        AppError::Postgres(error)
            if error
                .as_db_error()
                .is_some_and(|error| error.code() == &SqlState::READ_ONLY_SQL_TRANSACTION) =>
        {
            AppError::Validation(
                "La sentencia modificará PostgreSQL y requiere confirmación".into(),
            )
        }
        error => error,
    })?;

    Ok(PostgresQueryResult {
        affected_rows,
        columns,
        duration_ms: started.elapsed().as_secs_f64() * 1_000.0,
        readonly: !allow_write,
        rows,
        truncated,
    })
}

async fn collect_query(
    messages: SimpleQueryStream,
    column_types: &[Type],
    row_limit: usize,
) -> Result<(u64, Vec<String>, Vec<Value>, bool), AppError> {
    let mut messages = std::pin::pin!(messages);
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    let mut affected_rows: u64 = 0;
    let mut retained_bytes = 0_usize;
    let mut truncated = false;

    while let Some(message) = messages.as_mut().try_next().await? {
        match message {
            SimpleQueryMessage::Row(row) => {
                if columns.is_empty() {
                    columns = row
                        .columns()
                        .iter()
                        .map(|column| column.name().to_owned())
                        .collect();
                    retained_bytes = columns.iter().map(String::len).sum();
                }
                if rows.len() < row_limit {
                    let mut value = Map::new();
                    for (index, column) in columns.iter().enumerate() {
                        value.insert(
                            column.clone(),
                            postgres_text_value(row.get(index), column_types.get(index)),
                        );
                    }
                    let value = Value::Object(value);
                    let row_bytes = serde_json::to_vec(&value)?.len();
                    if retained_bytes.saturating_add(row_bytes) <= MAX_RESULT_BYTES {
                        retained_bytes = retained_bytes.saturating_add(row_bytes);
                        rows.push(value);
                    } else {
                        truncated = true;
                    }
                } else {
                    truncated = true;
                }
            }
            SimpleQueryMessage::CommandComplete(count) => {
                affected_rows = affected_rows.saturating_add(count);
            }
            _ => {}
        }
    }
    Ok((affected_rows, columns, rows, truncated))
}

fn postgres_text_value(value: Option<&str>, data_type: Option<&Type>) -> Value {
    let Some(value) = value else {
        return Value::Null;
    };
    match data_type {
        Some(&Type::BOOL) => Value::Bool(value == "t"),
        Some(&Type::INT2 | &Type::INT4 | &Type::INT8 | &Type::OID) => value
            .parse::<i64>()
            .map(Value::from)
            .unwrap_or_else(|_| Value::String(value.into())),
        Some(&Type::FLOAT4 | &Type::FLOAT8) => value
            .parse::<f64>()
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(value.into())),
        Some(&Type::JSON | &Type::JSONB) => {
            serde_json::from_str(value).unwrap_or_else(|_| Value::String(value.into()))
        }
        _ => Value::String(value.into()),
    }
}

fn requires_confirmation(sql: &str) -> bool {
    let keyword = first_sql_keyword(sql);
    matches!(
        keyword.as_deref(),
        Some(
            "ALTER"
                | "ANALYZE"
                | "CALL"
                | "CLUSTER"
                | "COMMENT"
                | "COPY"
                | "CREATE"
                | "DELETE"
                | "DO"
                | "DROP"
                | "GRANT"
                | "INSERT"
                | "LOCK"
                | "MERGE"
                | "REFRESH"
                | "REINDEX"
                | "REVOKE"
                | "SECURITY"
                | "TRUNCATE"
                | "UPDATE"
                | "VACUUM"
        )
    )
}

fn first_sql_keyword(sql: &str) -> Option<String> {
    let mut remaining = sql.trim_start();
    loop {
        if let Some(comment) = remaining.strip_prefix("--") {
            remaining = comment.split_once('\n')?.1.trim_start();
        } else if let Some(comment) = remaining.strip_prefix("/*") {
            remaining = comment.split_once("*/")?.1.trim_start();
        } else {
            break;
        }
    }
    let end = remaining
        .find(|character: char| !character.is_ascii_alphabetic())
        .unwrap_or(remaining.len());
    (end > 0).then(|| remaining[..end].to_ascii_uppercase())
}

#[cfg(test)]
mod tests {
    use super::{
        export_csv_internal, first_sql_keyword, requires_confirmation, PostgresCsvInput,
        DEFAULT_ROW_LIMIT, MAX_ROW_LIMIT,
    };

    #[test]
    fn query_limits_remain_bounded() {
        assert_eq!(DEFAULT_ROW_LIMIT.clamp(1, MAX_ROW_LIMIT), DEFAULT_ROW_LIMIT);
        assert_eq!(0_usize.clamp(1, MAX_ROW_LIMIT), 1);
        assert_eq!(10_000_usize.clamp(1, MAX_ROW_LIMIT), MAX_ROW_LIMIT);
    }

    #[test]
    fn identifies_writes_after_sql_comments() {
        assert_eq!(
            first_sql_keyword("-- test\n INSERT INTO users VALUES (1)"),
            Some("INSERT".into())
        );
        assert!(requires_confirmation(
            "/* migration */ CREATE TABLE users (id int)"
        ));
        assert!(!requires_confirmation(
            "WITH users AS (SELECT 1) SELECT * FROM users"
        ));
    }

    #[test]
    fn exports_utf8_csv_with_escaping_and_formula_protection() {
        let root = std::env::temp_dir().join(format!("nexora-csv-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("resultado.csv");
        export_csv_internal(PostgresCsvInput {
            columns: vec!["name".into(), "note".into(), "total".into()],
            path: path.to_string_lossy().into_owned(),
            rows: vec![serde_json::json!({
                "name": "Nexora",
                "note": "=1+1, \"quoted\"",
                "total": 42
            })],
        })
        .unwrap();
        let contents = std::fs::read_to_string(&path).unwrap();
        assert_eq!(
            contents,
            "\u{feff}name,note,total\r\nNexora,\"'=1+1, \"\"quoted\"\"\",42\r\n"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}

use std::{path::Path, time::Instant};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{types::ValueRef, Connection, OpenFlags};
use serde::Serialize;
use serde_json::{Map, Number, Value};

use crate::error::{AppError, CommandResult};

const DEFAULT_ROW_LIMIT: usize = 500;
const MAX_ROW_LIMIT: usize = 1_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteDatabase {
    path: String,
    name: String,
    tables: Vec<SqliteTable>,
}

#[derive(Debug, Serialize)]
pub struct SqliteTable {
    name: String,
    columns: Vec<SqliteColumn>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteColumn {
    name: String,
    data_type: String,
    nullable: bool,
    primary_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteQueryOutput {
    columns: Vec<String>,
    rows: Vec<Value>,
    affected_rows: usize,
    duration_ms: u64,
    readonly: bool,
    truncated: bool,
}

#[tauri::command]
pub async fn inspect_sqlite(path: String) -> CommandResult<SqliteDatabase> {
    tauri::async_runtime::spawn_blocking(move || inspect_database(&path))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn execute_sqlite(
    path: String,
    sql: String,
    allow_write: bool,
    row_limit: Option<usize>,
) -> CommandResult<SqliteQueryOutput> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_statement(&path, &sql, allow_write, row_limit)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

fn inspect_database(path: &str) -> Result<SqliteDatabase, AppError> {
    let path = canonical_file(path)?;
    let connection = open_readonly(&path)?;
    let mut statement = connection.prepare(
        "SELECT name FROM sqlite_schema \
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY lower(name)",
    )?;
    let names = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut tables = Vec::with_capacity(names.len());
    for name in names {
        let mut columns_statement = connection
            .prepare("SELECT name, type, [notnull], pk FROM pragma_table_info(?1) ORDER BY cid")?;
        let columns = columns_statement
            .query_map([&name], |row| {
                Ok(SqliteColumn {
                    name: row.get(0)?,
                    data_type: row.get::<_, String>(1)?,
                    nullable: row.get::<_, i64>(2)? == 0,
                    primary_key: row.get::<_, i64>(3)? > 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        tables.push(SqliteTable { name, columns });
    }

    Ok(SqliteDatabase {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("SQLite")
            .to_owned(),
        path: path.to_string_lossy().into_owned(),
        tables,
    })
}

fn execute_statement(
    path: &str,
    sql: &str,
    allow_write: bool,
    row_limit: Option<usize>,
) -> Result<SqliteQueryOutput, AppError> {
    if sql.trim().is_empty() {
        return Err(AppError::Validation("La consulta SQL está vacía".into()));
    }
    let path = canonical_file(path)?;
    let connection = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    let mut statement = connection.prepare(sql)?;
    let readonly = statement.readonly();
    if !readonly && !allow_write {
        return Err(AppError::Validation(
            "La consulta modifica la base de datos y requiere confirmación".into(),
        ));
    }

    let started = Instant::now();
    let (columns, rows, affected_rows, truncated) = if readonly && statement.column_count() > 0 {
        let columns = statement
            .column_names()
            .iter()
            .map(|name| (*name).to_owned())
            .collect::<Vec<_>>();
        let maximum = row_limit
            .unwrap_or(DEFAULT_ROW_LIMIT)
            .clamp(1, MAX_ROW_LIMIT);
        let mut query = statement.query([])?;
        let mut rows = Vec::new();
        let mut truncated = false;
        while let Some(row) = query.next()? {
            if rows.len() == maximum {
                truncated = true;
                break;
            }
            let mut object = Map::with_capacity(columns.len());
            for (index, name) in columns.iter().enumerate() {
                object.insert(name.clone(), sqlite_value(row.get_ref(index)?));
            }
            rows.push(Value::Object(object));
        }
        (columns, rows, 0, truncated)
    } else {
        let affected = statement.execute([])?;
        (Vec::new(), Vec::new(), affected, false)
    };

    Ok(SqliteQueryOutput {
        columns,
        rows,
        affected_rows,
        duration_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
        readonly,
        truncated,
    })
}

fn sqlite_value(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => Value::Number(value.into()),
        ValueRef::Real(value) => Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(value) => Value::String(String::from_utf8_lossy(value).into_owned()),
        ValueRef::Blob(value) => Value::Object(Map::from_iter([
            ("$blob".into(), Value::String(BASE64.encode(value))),
            ("bytes".into(), Value::Number(value.len().into())),
        ])),
    }
}

fn canonical_file(path: &str) -> Result<std::path::PathBuf, AppError> {
    let path = Path::new(path);
    if !path.is_file() {
        return Err(AppError::NotFound("El archivo SQLite no existe".into()));
    }
    Ok(path.canonicalize()?)
}

fn open_readonly(path: &Path) -> Result<Connection, AppError> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use super::{execute_statement, inspect_database};

    fn database() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("nexora-{}.sqlite", uuid::Uuid::new_v4()));
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\
                 INSERT INTO users (name) VALUES ('Ada'), ('Linus');",
            )
            .unwrap();
        path
    }

    #[test]
    fn inspects_schema_and_reads_rows() {
        let path = database();
        let database = inspect_database(path.to_str().unwrap()).unwrap();
        assert_eq!(database.tables[0].name, "users");
        let output = execute_statement(
            path.to_str().unwrap(),
            "SELECT id, name FROM users ORDER BY id",
            false,
            None,
        )
        .unwrap();
        assert_eq!(output.rows.len(), 2);
        assert!(output.readonly);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn requires_explicit_write_confirmation() {
        let path = database();
        let blocked = execute_statement(
            path.to_str().unwrap(),
            "DELETE FROM users WHERE id = 1",
            false,
            None,
        );
        assert!(blocked.is_err());
        let allowed = execute_statement(
            path.to_str().unwrap(),
            "DELETE FROM users WHERE id = 1",
            true,
            None,
        )
        .unwrap();
        assert_eq!(allowed.affected_rows, 1);
        std::fs::remove_file(path).unwrap();
    }
}

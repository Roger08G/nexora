use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::projects::{project_runtime_context, PROJECT_DIR},
    error::{AppError, CommandResult},
    limits::MAX_HISTORY_FILE_BYTES,
    state::AppState,
    storage::{ensure_directory, read_json, write_json_atomic},
};

const MAX_HISTORY_ENTRIES: usize = 500;
const MAX_ERROR_LENGTH: usize = 2_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntryInput {
    request_id: String,
    request_name: String,
    method: String,
    url: String,
    source: String,
    status: Option<u16>,
    #[serde(default)]
    status_text: String,
    duration_ms: Option<u64>,
    size_bytes: Option<usize>,
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    id: String,
    executed_at_ms: u64,
    request_id: String,
    request_name: String,
    method: String,
    url: String,
    source: String,
    status: Option<u16>,
    status_text: String,
    duration_ms: Option<u64>,
    size_bytes: Option<usize>,
    error: Option<String>,
}

#[tauri::command]
pub async fn list_history(
    state: State<'_, AppState>,
    project_root: String,
) -> CommandResult<Vec<HistoryEntry>> {
    let history_io = state.history_io.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock_history(&history_io)?;
        list_history_sync(&project_root)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn append_history(
    state: State<'_, AppState>,
    project_root: String,
    entry: HistoryEntryInput,
) -> CommandResult<HistoryEntry> {
    let history_io = state.history_io.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock_history(&history_io)?;
        append_history_sync(&project_root, entry)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_history_entry(
    state: State<'_, AppState>,
    project_root: String,
    entry_id: String,
) -> CommandResult<()> {
    let history_io = state.history_io.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock_history(&history_io)?;
        delete_history_entry_sync(&project_root, &entry_id)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>, project_root: String) -> CommandResult<()> {
    let history_io = state.history_io.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock_history(&history_io)?;
        clear_history_sync(&project_root)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

fn list_history_sync(project_root: &str) -> Result<Vec<HistoryEntry>, AppError> {
    let path = history_path(project_root)?;
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let mut entries: Vec<HistoryEntry> =
        read_json(&path, MAX_HISTORY_FILE_BYTES, "El historial HTTP")?;
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.executed_at_ms));
    Ok(entries)
}

fn lock_history(lock: &std::sync::Mutex<()>) -> Result<std::sync::MutexGuard<'_, ()>, AppError> {
    lock.lock()
        .map_err(|_| AppError::Internal("Bloqueo de historial no disponible".into()))
}

fn append_history_sync(
    project_root: &str,
    input: HistoryEntryInput,
) -> Result<HistoryEntry, AppError> {
    validate_input(&input)?;
    let entry = HistoryEntry {
        id: format!("history-{}", uuid::Uuid::new_v4()),
        executed_at_ms: now_ms(),
        request_id: input.request_id,
        request_name: input.request_name.trim().into(),
        method: input.method.trim().to_ascii_uppercase(),
        url: sanitized_url(&input.url),
        source: input.source,
        status: input.status,
        status_text: input.status_text.trim().into(),
        duration_ms: input.duration_ms,
        size_bytes: input.size_bytes,
        error: input.error.map(|error| error.trim().into()),
    };
    let path = history_path(project_root)?;
    let mut entries = list_history_sync(project_root)?;
    entries.insert(0, entry.clone());
    entries.truncate(MAX_HISTORY_ENTRIES);
    write_json_atomic(&path, &entries, MAX_HISTORY_FILE_BYTES)?;
    Ok(entry)
}

fn delete_history_entry_sync(project_root: &str, entry_id: &str) -> Result<(), AppError> {
    validate_id(entry_id)?;
    let path = history_path(project_root)?;
    let mut entries = list_history_sync(project_root)?;
    let previous_len = entries.len();
    entries.retain(|entry| entry.id != entry_id);
    if entries.len() == previous_len {
        return Err(AppError::NotFound(
            "La entrada de historial no existe".into(),
        ));
    }
    write_json_atomic(&path, &entries, MAX_HISTORY_FILE_BYTES)
}

fn clear_history_sync(project_root: &str) -> Result<(), AppError> {
    let path = history_path(project_root)?;
    if path.is_file() {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn history_path(project_root: &str) -> Result<PathBuf, AppError> {
    let (root, _) = project_runtime_context(project_root)?;
    let directory = root.join(PROJECT_DIR).join("runtime");
    ensure_directory(&directory)?;
    Ok(directory.join("http-history.json"))
}

fn validate_input(input: &HistoryEntryInput) -> Result<(), AppError> {
    validate_id(&input.request_id)?;
    if input.request_name.trim().is_empty() || input.request_name.chars().count() > 120 {
        return Err(AppError::Validation(
            "Nombre de petición no válido para el historial".into(),
        ));
    }
    if !matches!(
        input.method.trim().to_ascii_uppercase().as_str(),
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
    ) {
        return Err(AppError::Validation(
            "Método HTTP no válido para el historial".into(),
        ));
    }
    if input.url.trim().is_empty() || input.url.chars().count() > 8_192 {
        return Err(AppError::Validation(
            "URL no válida para el historial".into(),
        ));
    }
    if !matches!(input.source.as_str(), "api" | "monitor") {
        return Err(AppError::Validation(
            "Origen de historial no soportado".into(),
        ));
    }
    if input
        .error
        .as_ref()
        .is_some_and(|error| error.chars().count() > MAX_ERROR_LENGTH)
    {
        return Err(AppError::Validation(
            "El error de historial es demasiado largo".into(),
        ));
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<(), AppError> {
    let valid = !id.is_empty()
        && id.len() <= 80
        && id
            .bytes()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, b'-' | b'_'));
    if valid {
        Ok(())
    } else {
        Err(AppError::Validation(
            "Identificador de historial no válido".into(),
        ))
    }
}

fn sanitized_url(value: &str) -> String {
    let without_query = value.trim().split(['?', '#']).next().unwrap_or_default();
    if let Ok(mut url) = reqwest::Url::parse(without_query) {
        let _ = url.set_username("");
        let _ = url.set_password(None);
        return url.into();
    }
    without_query.into()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

#[cfg(test)]
mod tests {
    use super::{
        append_history_sync, clear_history_sync, delete_history_entry_sync, list_history_sync,
        sanitized_url, HistoryEntryInput,
    };

    fn project() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("nexora-history-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        crate::commands::projects::create_project_sync(root.to_str().unwrap(), "Historial")
            .unwrap();
        root
    }

    fn input() -> HistoryEntryInput {
        HistoryEntryInput {
            request_id: "request-health".into(),
            request_name: "Health".into(),
            method: "GET".into(),
            url: "http://localhost:3000/health".into(),
            source: "api".into(),
            status: Some(200),
            status_text: "OK".into(),
            duration_ms: Some(18),
            size_bytes: Some(12),
            error: None,
        }
    }

    #[test]
    fn persists_and_removes_local_history() {
        let root = project();
        let entry = append_history_sync(root.to_str().unwrap(), input()).unwrap();
        assert_eq!(list_history_sync(root.to_str().unwrap()).unwrap().len(), 1);
        delete_history_entry_sync(root.to_str().unwrap(), &entry.id).unwrap();
        assert!(list_history_sync(root.to_str().unwrap())
            .unwrap()
            .is_empty());
        append_history_sync(root.to_str().unwrap(), input()).unwrap();
        clear_history_sync(root.to_str().unwrap()).unwrap();
        assert!(list_history_sync(root.to_str().unwrap())
            .unwrap()
            .is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn strips_credentials_and_query_values_from_history_urls() {
        assert_eq!(
            sanitized_url("http://user:secret@localhost:3000/users?token=secret#private"),
            "http://localhost:3000/users"
        );
        assert_eq!(
            sanitized_url("{{baseUrl}}/users?token={{token}}"),
            "{{baseUrl}}/users"
        );
    }
}

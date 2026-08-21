use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::projects::{project_runtime_context, write_json_atomic, PROJECT_DIR},
    error::{AppError, CommandResult},
    state::AppState,
};

const MIN_INTERVAL_SECONDS: u64 = 10;
const MAX_INTERVAL_SECONDS: u64 = 86_400;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMonitor {
    id: String,
    name: String,
    request_id: String,
    request_name: String,
    interval_seconds: u64,
    enabled: bool,
    created_at_ms: u64,
    updated_at_ms: u64,
}

#[tauri::command]
pub async fn list_monitors(
    state: State<'_, AppState>,
    project_root: String,
) -> CommandResult<Vec<LocalMonitor>> {
    let monitor_io = state.monitor_io.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock_monitors(&monitor_io)?;
        list_monitors_sync(&project_root)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn save_monitor(
    state: State<'_, AppState>,
    project_root: String,
    monitor: LocalMonitor,
) -> CommandResult<LocalMonitor> {
    let monitor_io = state.monitor_io.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock_monitors(&monitor_io)?;
        save_monitor_sync(&project_root, monitor)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_monitor(
    state: State<'_, AppState>,
    project_root: String,
    monitor_id: String,
) -> CommandResult<()> {
    let monitor_io = state.monitor_io.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock_monitors(&monitor_io)?;
        delete_monitor_sync(&project_root, &monitor_id)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

fn list_monitors_sync(project_root: &str) -> Result<Vec<LocalMonitor>, AppError> {
    let directory = monitors_dir(project_root)?;
    let mut monitors = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if !entry.file_type()?.is_file()
            || entry.path().extension().and_then(|value| value.to_str()) != Some("json")
        {
            continue;
        }
        let monitor: LocalMonitor = serde_json::from_slice(&fs::read(entry.path())?)?;
        validate_monitor(&monitor)?;
        monitors.push(monitor);
    }
    monitors.sort_by_key(|monitor| monitor.name.to_lowercase());
    Ok(monitors)
}

fn lock_monitors(lock: &std::sync::Mutex<()>) -> Result<std::sync::MutexGuard<'_, ()>, AppError> {
    lock.lock()
        .map_err(|_| AppError::Internal("Bloqueo de monitores no disponible".into()))
}

fn save_monitor_sync(
    project_root: &str,
    mut monitor: LocalMonitor,
) -> Result<LocalMonitor, AppError> {
    monitor.name = monitor.name.trim().into();
    monitor.request_name = monitor.request_name.trim().into();
    let now = now_ms();
    let path = monitor_path(project_root, &monitor.id)?;
    monitor.created_at_ms = if path.is_file() {
        let existing: LocalMonitor = serde_json::from_slice(&fs::read(&path)?)?;
        existing.created_at_ms
    } else {
        now
    };
    monitor.updated_at_ms = now;
    validate_monitor(&monitor)?;
    write_json_atomic(&path, &monitor)?;
    Ok(monitor)
}

fn delete_monitor_sync(project_root: &str, monitor_id: &str) -> Result<(), AppError> {
    validate_id("monitor", monitor_id)?;
    let path = monitor_path(project_root, monitor_id)?;
    if !path.is_file() {
        return Err(AppError::NotFound("El monitor no existe".into()));
    }
    fs::remove_file(path)?;
    Ok(())
}

fn monitors_dir(project_root: &str) -> Result<PathBuf, AppError> {
    let (root, _) = project_runtime_context(project_root)?;
    let directory = root.join(PROJECT_DIR).join("monitors");
    fs::create_dir_all(&directory)?;
    Ok(directory)
}

fn monitor_path(project_root: &str, monitor_id: &str) -> Result<PathBuf, AppError> {
    validate_id("monitor", monitor_id)?;
    Ok(monitors_dir(project_root)?.join(format!("{monitor_id}.json")))
}

fn validate_monitor(monitor: &LocalMonitor) -> Result<(), AppError> {
    validate_id("monitor", &monitor.id)?;
    validate_id("petición", &monitor.request_id)?;
    if monitor.name.is_empty() || monitor.name.chars().count() > 100 {
        return Err(AppError::Validation(
            "El nombre del monitor debe tener entre 1 y 100 caracteres".into(),
        ));
    }
    if monitor.request_name.is_empty() || monitor.request_name.chars().count() > 120 {
        return Err(AppError::Validation(
            "Nombre de petición no válido para el monitor".into(),
        ));
    }
    if !(MIN_INTERVAL_SECONDS..=MAX_INTERVAL_SECONDS).contains(&monitor.interval_seconds) {
        return Err(AppError::Validation(format!(
            "El intervalo debe estar entre {MIN_INTERVAL_SECONDS} y {MAX_INTERVAL_SECONDS} segundos"
        )));
    }
    Ok(())
}

fn validate_id(label: &str, id: &str) -> Result<(), AppError> {
    let valid = !id.is_empty()
        && id.len() <= 80
        && id
            .bytes()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, b'-' | b'_'));
    if valid {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "Identificador de {label} no válido"
        )))
    }
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
    use super::{delete_monitor_sync, list_monitors_sync, save_monitor_sync, LocalMonitor};

    #[test]
    fn persists_git_friendly_monitor_definitions() {
        let root = std::env::temp_dir().join(format!("nexora-monitor-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        crate::commands::projects::create_project_sync(root.to_str().unwrap(), "Monitores")
            .unwrap();
        let monitor = LocalMonitor {
            id: "monitor-health".into(),
            name: "Health local".into(),
            request_id: "request-health".into(),
            request_name: "Health".into(),
            interval_seconds: 30,
            enabled: true,
            created_at_ms: 0,
            updated_at_ms: 0,
        };
        let saved = save_monitor_sync(root.to_str().unwrap(), monitor).unwrap();
        assert!(root.join(".nexora/monitors/monitor-health.json").is_file());
        assert!(saved.created_at_ms > 0);
        assert_eq!(list_monitors_sync(root.to_str().unwrap()).unwrap().len(), 1);
        delete_monitor_sync(root.to_str().unwrap(), "monitor-health").unwrap();
        assert!(list_monitors_sync(root.to_str().unwrap())
            .unwrap()
            .is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}

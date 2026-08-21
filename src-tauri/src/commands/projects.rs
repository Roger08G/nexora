use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, CommandResult};

const LEGACY_SCHEMA_VERSION: u32 = 1;
const SCHEMA_VERSION: u32 = 2;
pub(crate) const PROJECT_DIR: &str = ".nexora";
const FOLDERS_DIR: &str = "folders";
const MONITORS_DIR: &str = "monitors";
const REQUESTS_DIR: &str = "requests";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectManifest {
    #[serde(default)]
    id: String,
    schema_version: u32,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    id: String,
    root: String,
    name: String,
    schema_version: u32,
    project_bytes: u64,
    project_file_count: u64,
    request_count: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueItem {
    pub id: String,
    pub enabled: bool,
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    pub id: String,
    pub collection_id: String,
    pub collection_name: String,
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub params: Vec<KeyValueItem>,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestFolder {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub async fn create_project(root: String, name: String) -> CommandResult<ProjectSummary> {
    tauri::async_runtime::spawn_blocking(move || create_project_sync(&root, &name))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn open_project(root: String) -> CommandResult<ProjectSummary> {
    tauri::async_runtime::spawn_blocking(move || open_project_sync(&root))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn list_requests(project_root: String) -> CommandResult<Vec<SavedRequest>> {
    tauri::async_runtime::spawn_blocking(move || list_requests_sync(&project_root))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn list_request_folders(project_root: String) -> CommandResult<Vec<RequestFolder>> {
    tauri::async_runtime::spawn_blocking(move || list_request_folders_sync(&project_root))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn create_request_folder(
    project_root: String,
    name: String,
) -> CommandResult<RequestFolder> {
    tauri::async_runtime::spawn_blocking(move || create_request_folder_sync(&project_root, &name))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn save_request(
    project_root: String,
    request: SavedRequest,
) -> CommandResult<SavedRequest> {
    tauri::async_runtime::spawn_blocking(move || save_request_sync(&project_root, request))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_request(
    project_root: String,
    collection_id: String,
    request_id: String,
) -> CommandResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        delete_request_sync(&project_root, &collection_id, &request_id)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
    .map_err(Into::into)
}

pub(crate) fn create_project_sync(root: &str, name: &str) -> Result<ProjectSummary, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::Validation(
            "El nombre del proyecto debe tener entre 1 y 80 caracteres".into(),
        ));
    }

    let root = canonical_directory(root)?;
    let project_dir = root.join(PROJECT_DIR);
    if project_dir.exists() {
        return Err(AppError::Conflict(
            "La carpeta ya contiene un proyecto Nexora".into(),
        ));
    }
    for directory in [FOLDERS_DIR, MONITORS_DIR, REQUESTS_DIR] {
        if root.join(directory).exists() {
            return Err(AppError::Conflict(format!(
                "La ruta reservada {directory}/ ya existe en la carpeta del proyecto"
            )));
        }
    }

    fs::create_dir(&project_dir)?;
    fs::create_dir(root.join(REQUESTS_DIR))?;
    fs::create_dir(root.join(FOLDERS_DIR))?;
    fs::create_dir(root.join(MONITORS_DIR))?;
    let manifest = ProjectManifest {
        id: uuid::Uuid::new_v4().to_string(),
        schema_version: SCHEMA_VERSION,
        name: name.to_owned(),
    };
    write_json_atomic(&project_dir.join("project.json"), &manifest)?;
    write_json_atomic(
        &root.join(FOLDERS_DIR).join("general.json"),
        &RequestFolder {
            id: "general".into(),
            name: "General".into(),
        },
    )?;
    ensure_runtime_ignored(&root)?;

    summary(&root, manifest)
}

fn open_project_sync(root: &str) -> Result<ProjectSummary, AppError> {
    let (root, manifest) = validated_project(root)?;
    ensure_request_folders(&root)?;
    fs::create_dir_all(root.join(MONITORS_DIR))?;
    ensure_runtime_ignored(&root)?;
    summary(&root, manifest)
}

fn list_requests_sync(project_root: &str) -> Result<Vec<SavedRequest>, AppError> {
    let root = validated_project_root(project_root)?;
    let mut requests = list_requests_from_root(&root)?;
    requests.sort_by(|left, right| {
        left.collection_name
            .to_lowercase()
            .cmp(&right.collection_name.to_lowercase())
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(requests)
}

fn list_request_folders_sync(project_root: &str) -> Result<Vec<RequestFolder>, AppError> {
    let root = validated_project_root(project_root)?;
    ensure_request_folders(&root)?;
    let mut folders = Vec::new();
    for entry in fs::read_dir(folders_dir(&root))? {
        let entry = entry?;
        if !entry.file_type()?.is_file()
            || entry.path().extension().and_then(|value| value.to_str()) != Some("json")
        {
            continue;
        }
        let folder: RequestFolder = serde_json::from_slice(&fs::read(entry.path())?)?;
        validate_request_folder(&folder)?;
        folders.push(folder);
    }
    folders.sort_by_key(|folder| folder.name.to_lowercase());
    Ok(folders)
}

fn create_request_folder_sync(project_root: &str, name: &str) -> Result<RequestFolder, AppError> {
    let root = validated_project_root(project_root)?;
    ensure_request_folders(&root)?;
    let name = validated_folder_name(name)?;
    let normalized_name = name.to_lowercase();
    if list_request_folders_sync(project_root)?
        .iter()
        .any(|folder| folder.name.to_lowercase() == normalized_name)
    {
        return Err(AppError::Conflict(
            "Ya existe una carpeta con ese nombre".into(),
        ));
    }
    let folder = RequestFolder {
        id: format!("folder-{}", uuid::Uuid::new_v4()),
        name,
    };
    write_request_folder(&root, &folder)?;
    Ok(folder)
}

fn save_request_sync(
    project_root: &str,
    mut request: SavedRequest,
) -> Result<SavedRequest, AppError> {
    let root = validated_project_root(project_root)?;
    request.name = request.name.trim().to_owned();
    request.collection_name = request.collection_name.trim().to_owned();
    request.method = request.method.to_uppercase();
    validate_request(&request)?;

    let folder = ensure_request_folder(&root, &request.collection_id, &request.collection_name)?;
    request.collection_name = folder.name;

    let directory = requests_dir(&root).join(&request.collection_id);
    fs::create_dir_all(&directory)?;
    let path = directory.join(format!("{}.json", request.id));
    write_json_atomic(&path, &request)?;
    Ok(request)
}

fn delete_request_sync(
    project_root: &str,
    collection_id: &str,
    request_id: &str,
) -> Result<(), AppError> {
    let root = validated_project_root(project_root)?;
    validate_slug("carpeta", collection_id)?;
    validate_slug("petición", request_id)?;
    let path = requests_dir(&root)
        .join(collection_id)
        .join(format!("{request_id}.json"));
    if !path.is_file() {
        return Err(AppError::NotFound("La petición no existe".into()));
    }
    fs::remove_file(path)?;
    Ok(())
}

fn ensure_request_folders(root: &Path) -> Result<(), AppError> {
    fs::create_dir_all(requests_dir(root))?;
    fs::create_dir_all(folders_dir(root))?;
    let requests = list_requests_from_root(root)?;
    for request in requests {
        ensure_request_folder(root, &request.collection_id, &request.collection_name)?;
    }
    if fs::read_dir(folders_dir(root))?.next().is_none() {
        write_request_folder(
            root,
            &RequestFolder {
                id: "general".into(),
                name: "General".into(),
            },
        )?;
    }
    Ok(())
}

fn list_requests_from_root(root: &Path) -> Result<Vec<SavedRequest>, AppError> {
    let directory = requests_dir(root);
    fs::create_dir_all(&directory)?;
    let mut requests = Vec::new();
    for folder in fs::read_dir(directory)? {
        let folder = folder?;
        if !folder.file_type()?.is_dir() {
            continue;
        }
        for entry in fs::read_dir(folder.path())? {
            let entry = entry?;
            if !entry.file_type()?.is_file()
                || entry.path().extension().and_then(|value| value.to_str()) != Some("json")
            {
                continue;
            }
            let request: SavedRequest = serde_json::from_slice(&fs::read(entry.path())?)?;
            validate_request(&request)?;
            requests.push(request);
        }
    }
    Ok(requests)
}

fn ensure_request_folder(
    root: &Path,
    id: &str,
    fallback_name: &str,
) -> Result<RequestFolder, AppError> {
    validate_slug("carpeta", id)?;
    let path = folders_dir(root).join(format!("{id}.json"));
    if path.is_file() {
        let folder: RequestFolder = serde_json::from_slice(&fs::read(path)?)?;
        validate_request_folder(&folder)?;
        return Ok(folder);
    }
    let folder = RequestFolder {
        id: id.into(),
        name: validated_folder_name(fallback_name)?,
    };
    write_request_folder(root, &folder)?;
    Ok(folder)
}

fn write_request_folder(root: &Path, folder: &RequestFolder) -> Result<(), AppError> {
    validate_request_folder(folder)?;
    fs::create_dir_all(folders_dir(root))?;
    write_json_atomic(
        &folders_dir(root).join(format!("{}.json", folder.id)),
        folder,
    )
}

fn validate_request_folder(folder: &RequestFolder) -> Result<(), AppError> {
    validate_slug("carpeta", &folder.id)?;
    validated_folder_name(&folder.name).map(|_| ())
}

fn validated_folder_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::Validation(
            "El nombre de la carpeta debe tener entre 1 y 80 caracteres".into(),
        ));
    }
    Ok(name.into())
}

fn validate_request(request: &SavedRequest) -> Result<(), AppError> {
    validate_slug("colección", &request.collection_id)?;
    validate_slug("petición", &request.id)?;
    if request.collection_name.is_empty() || request.collection_name.chars().count() > 80 {
        return Err(AppError::Validation("Nombre de colección no válido".into()));
    }
    if request.name.is_empty() || request.name.chars().count() > 120 {
        return Err(AppError::Validation("Nombre de petición no válido".into()));
    }
    if !matches!(
        request.method.as_str(),
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
    ) {
        return Err(AppError::Validation("Método HTTP no soportado".into()));
    }
    if request.url.trim().is_empty() || request.url.chars().count() > 8_192 {
        return Err(AppError::Validation("URL no válida".into()));
    }
    if let Ok(url) = reqwest::Url::parse(&request.url) {
        if !url.username().is_empty() || url.password().is_some() {
            return Err(AppError::Validation(
                "No guardes credenciales dentro de la URL; utiliza variables {{nombre}}".into(),
            ));
        }
    }
    for header in &request.headers {
        if header.enabled
            && is_sensitive_key(&header.key)
            && !header.value.trim().is_empty()
            && !contains_variable(&header.value)
        {
            return Err(AppError::Validation(format!(
                "El header {} parece contener un secreto. Usa una variable como {{{{token}}}}",
                header.key
            )));
        }
    }
    for parameter in &request.params {
        if parameter.enabled
            && is_sensitive_key(&parameter.key)
            && !parameter.value.trim().is_empty()
            && !contains_variable(&parameter.value)
        {
            return Err(AppError::Validation(format!(
                "El parámetro {} parece contener un secreto. Usa una variable de sesión",
                parameter.key
            )));
        }
    }
    if let Ok(body) = serde_json::from_str::<serde_json::Value>(&request.body) {
        if contains_plain_json_secret(&body) {
            return Err(AppError::Validation(
                "El body parece contener un secreto directo. Sustitúyelo por una variable {{nombre}}"
                    .into(),
            ));
        }
    }
    Ok(())
}

fn is_sensitive_key(key: &str) -> bool {
    matches!(
        key.trim().to_ascii_lowercase().as_str(),
        "authorization"
            | "proxy-authorization"
            | "api-key"
            | "apikey"
            | "x-api-key"
            | "cookie"
            | "password"
            | "token"
            | "secret"
    )
}

fn contains_variable(value: &str) -> bool {
    value.contains("{{") && value.contains("}}")
}

fn contains_plain_json_secret(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Object(object) => object.iter().any(|(key, value)| {
            (is_sensitive_key(key)
                && !value.is_null()
                && !value.as_str().is_some_and(contains_variable))
                || contains_plain_json_secret(value)
        }),
        serde_json::Value::Array(values) => values.iter().any(contains_plain_json_secret),
        _ => false,
    }
}

fn validate_slug(label: &str, value: &str) -> Result<(), AppError> {
    let valid = !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, b'-' | b'_'));
    if valid {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "El identificador de {label} solo puede contener letras, números, guiones y guiones bajos"
        )))
    }
}

fn validated_project_root(root: &str) -> Result<PathBuf, AppError> {
    validated_project(root).map(|(root, _)| root)
}

fn validated_project(root: &str) -> Result<(PathBuf, ProjectManifest), AppError> {
    let root = canonical_directory(root)?;
    let mut manifest = read_manifest(&root)?;
    if !matches!(
        manifest.schema_version,
        LEGACY_SCHEMA_VERSION | SCHEMA_VERSION
    ) {
        return Err(AppError::Validation(format!(
            "Versión de proyecto no soportada: {}",
            manifest.schema_version
        )));
    }

    migrate_legacy_project_content(&root)?;

    let mut manifest_changed = false;
    if manifest.schema_version == LEGACY_SCHEMA_VERSION {
        manifest.schema_version = SCHEMA_VERSION;
        manifest_changed = true;
    }
    if manifest.id.is_empty() {
        manifest.id = uuid::Uuid::new_v4().to_string();
        manifest_changed = true;
    }
    if manifest_changed {
        write_json_atomic(&root.join(PROJECT_DIR).join("project.json"), &manifest)?;
    }
    Ok((root, manifest))
}

fn migrate_legacy_project_content(root: &Path) -> Result<(), AppError> {
    let legacy_root = root.join(PROJECT_DIR);
    for directory in [FOLDERS_DIR, MONITORS_DIR, REQUESTS_DIR] {
        let source = legacy_root.join(directory);
        if source.exists() {
            ensure_migration_compatible(&source, &root.join(directory))?;
        }
    }
    for directory in [FOLDERS_DIR, MONITORS_DIR, REQUESTS_DIR] {
        let source = legacy_root.join(directory);
        if source.exists() {
            merge_legacy_directory(&source, &root.join(directory))?;
        }
    }
    Ok(())
}

fn ensure_migration_compatible(source: &Path, destination: &Path) -> Result<(), AppError> {
    let source_type = fs::symlink_metadata(source)?.file_type();
    if source_type.is_symlink() || !source_type.is_dir() {
        return Err(AppError::Validation(format!(
            "La ruta heredada {} no es una carpeta",
            source.display()
        )));
    }
    if !destination.exists() {
        return Ok(());
    }
    let destination_type = fs::symlink_metadata(destination)?.file_type();
    if destination_type.is_symlink() || !destination_type.is_dir() {
        return Err(migration_conflict(source, destination));
    }

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            ensure_migration_compatible(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            if destination_path.exists() {
                let destination_type = fs::symlink_metadata(&destination_path)?.file_type();
                if destination_type.is_symlink()
                    || !destination_type.is_file()
                    || fs::read(&source_path)? != fs::read(&destination_path)?
                {
                    return Err(migration_conflict(&source_path, &destination_path));
                }
            }
        } else {
            return Err(AppError::Validation(format!(
                "La migración no admite enlaces ni archivos especiales: {}",
                source_path.display()
            )));
        }
    }
    Ok(())
}

fn merge_legacy_directory(source: &Path, destination: &Path) -> Result<(), AppError> {
    if !destination.exists() {
        fs::rename(source, destination)?;
        return Ok(());
    }

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            merge_legacy_directory(&source_path, &destination_path)?;
        } else if destination_path.exists() {
            fs::remove_file(source_path)?;
        } else {
            fs::rename(source_path, destination_path)?;
        }
    }
    fs::remove_dir(source)?;
    Ok(())
}

fn migration_conflict(source: &Path, destination: &Path) -> AppError {
    AppError::Conflict(format!(
        "No se puede migrar {} porque {} ya existe con otro contenido",
        source.display(),
        destination.display()
    ))
}

pub(crate) fn project_runtime_context(root: &str) -> Result<(PathBuf, String), AppError> {
    let (root, manifest) = validated_project(root)?;
    ensure_runtime_ignored(&root)?;
    Ok((root, manifest.id))
}

fn read_manifest(root: &Path) -> Result<ProjectManifest, AppError> {
    let path = root.join(PROJECT_DIR).join("project.json");
    if !path.is_file() {
        return Err(AppError::NotFound(
            "La carpeta no contiene .nexora/project.json".into(),
        ));
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn canonical_directory(root: &str) -> Result<PathBuf, AppError> {
    let root = Path::new(root);
    if !root.is_dir() {
        return Err(AppError::NotFound(
            "La carpeta del proyecto no existe".into(),
        ));
    }
    Ok(root.canonicalize()?)
}

fn requests_dir(root: &Path) -> PathBuf {
    root.join(REQUESTS_DIR)
}

fn folders_dir(root: &Path) -> PathBuf {
    root.join(FOLDERS_DIR)
}

fn summary(root: &Path, manifest: ProjectManifest) -> Result<ProjectSummary, AppError> {
    let metrics = project_metrics(root)?;
    Ok(ProjectSummary {
        id: manifest.id,
        root: root.to_string_lossy().into_owned(),
        name: manifest.name,
        schema_version: manifest.schema_version,
        project_bytes: metrics.bytes,
        project_file_count: metrics.files,
        request_count: metrics.requests,
    })
}

#[derive(Default)]
struct ProjectMetrics {
    bytes: u64,
    files: u64,
    requests: u64,
}

fn project_metrics(root: &Path) -> Result<ProjectMetrics, AppError> {
    let mut metrics = ProjectMetrics::default();
    collect_metrics(&root.join(PROJECT_DIR), false, &mut metrics)?;
    for directory in [FOLDERS_DIR, MONITORS_DIR] {
        let path = root.join(directory);
        if path.is_dir() {
            collect_metrics(&path, false, &mut metrics)?;
        }
    }
    let requests = root.join(REQUESTS_DIR);
    if requests.is_dir() {
        collect_metrics(&requests, true, &mut metrics)?;
    }
    Ok(metrics)
}

fn collect_metrics(
    directory: &Path,
    inside_requests: bool,
    metrics: &mut ProjectMetrics,
) -> Result<(), AppError> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let path = entry.path();
        let is_requests = inside_requests || entry.file_name() == "requests";
        if file_type.is_dir() {
            collect_metrics(&path, is_requests, metrics)?;
        } else if file_type.is_file() {
            metrics.files = metrics.files.saturating_add(1);
            metrics.bytes = metrics.bytes.saturating_add(entry.metadata()?.len());
            if is_requests
                && path
                    .extension()
                    .is_some_and(|extension| extension == "json")
            {
                metrics.requests = metrics.requests.saturating_add(1);
            }
        }
    }
    Ok(())
}

fn ensure_runtime_ignored(root: &Path) -> Result<(), AppError> {
    let path = root.join(PROJECT_DIR).join(".gitignore");
    let mut contents = if path.is_file() {
        fs::read_to_string(&path)?
    } else {
        String::new()
    };
    if contents.lines().any(|line| line.trim() == "runtime/") {
        return Ok(());
    }
    if !contents.is_empty() && !contents.ends_with('\n') {
        contents.push('\n');
    }
    contents.push_str("runtime/\n");
    fs::write(path, contents)?;
    Ok(())
}

pub(crate) fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    let temporary = path.with_extension("json.tmp");
    let mut contents = serde_json::to_string_pretty(value)?;
    contents.push('\n');
    fs::write(&temporary, contents)?;
    if path.exists() {
        let backup = path.with_extension("json.bak");
        if backup.exists() {
            fs::remove_file(&backup)?;
        }
        fs::rename(path, &backup)?;
        if let Err(error) = fs::rename(&temporary, path) {
            let _ = fs::rename(&backup, path);
            return Err(error.into());
        }
        fs::remove_file(backup)?;
    } else {
        fs::rename(temporary, path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        create_project_sync, create_request_folder_sync, delete_request_sync,
        list_request_folders_sync, list_requests_sync, open_project_sync, save_request_sync,
        ProjectManifest, SavedRequest,
    };

    fn temporary_directory() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("nexora-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).expect("temporary directory");
        path
    }

    #[test]
    fn creates_and_reopens_git_friendly_project() {
        let root = temporary_directory();
        let project = create_project_sync(root.to_str().unwrap(), "Prueba").unwrap();
        assert_eq!(project.name, "Prueba");
        assert!(project.project_bytes > 0);
        assert!(project.project_file_count >= 2);
        assert_eq!(project.request_count, 0);
        assert!(root.join(".nexora/project.json").is_file());
        assert!(root.join("requests").is_dir());
        assert!(root.join("folders/general.json").is_file());
        assert!(root.join("monitors").is_dir());
        assert!(!root.join(".nexora/requests").exists());
        assert_eq!(
            std::fs::read_to_string(root.join(".nexora/.gitignore")).unwrap(),
            "runtime/\n"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn persists_empty_folders_independently_from_requests() {
        let root = temporary_directory();
        create_project_sync(root.to_str().unwrap(), "Prueba").unwrap();
        let folder = create_request_folder_sync(root.to_str().unwrap(), "Usuarios").unwrap();
        let folders = list_request_folders_sync(root.to_str().unwrap()).unwrap();
        assert!(folders.iter().any(|candidate| candidate.id == folder.id));
        assert!(root
            .join("folders")
            .join(format!("{}.json", folder.id))
            .is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn saves_each_request_as_its_own_json_file() {
        let root = temporary_directory();
        create_project_sync(root.to_str().unwrap(), "Prueba").unwrap();
        let request = SavedRequest {
            id: "health".into(),
            collection_id: "system".into(),
            collection_name: "Sistema".into(),
            name: "Health check".into(),
            method: "get".into(),
            url: "http://localhost:3000/health".into(),
            params: vec![],
            headers: vec![],
            body: String::new(),
        };
        save_request_sync(root.to_str().unwrap(), request).unwrap();
        assert!(root.join("requests/system/health.json").is_file());
        assert_eq!(list_requests_sync(root.to_str().unwrap()).unwrap().len(), 1);
        assert!(list_request_folders_sync(root.to_str().unwrap())
            .unwrap()
            .iter()
            .any(|folder| folder.id == "system"));
        assert_eq!(
            open_project_sync(root.to_str().unwrap())
                .unwrap()
                .request_count,
            1
        );
        delete_request_sync(root.to_str().unwrap(), "system", "health").unwrap();
        assert!(list_requests_sync(root.to_str().unwrap())
            .unwrap()
            .is_empty());
        assert!(list_request_folders_sync(root.to_str().unwrap())
            .unwrap()
            .iter()
            .any(|folder| folder.id == "system"));
        assert_eq!(
            open_project_sync(root.to_str().unwrap())
                .unwrap()
                .request_count,
            0
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn migrates_legacy_hidden_content_without_losing_data() {
        let root = temporary_directory();
        create_project_sync(root.to_str().unwrap(), "Proyecto heredado").unwrap();

        let project_dir = root.join(".nexora");
        std::fs::rename(root.join("folders"), project_dir.join("folders")).unwrap();
        std::fs::rename(root.join("requests"), project_dir.join("requests")).unwrap();
        std::fs::rename(root.join("monitors"), project_dir.join("monitors")).unwrap();
        let mut manifest: ProjectManifest =
            serde_json::from_slice(&std::fs::read(project_dir.join("project.json")).unwrap())
                .unwrap();
        manifest.schema_version = 1;
        super::write_json_atomic(&project_dir.join("project.json"), &manifest).unwrap();

        std::fs::create_dir_all(project_dir.join("requests/system")).unwrap();
        std::fs::write(
            project_dir.join("requests/system/health.json"),
            r#"{
  "id": "health",
  "collectionId": "system",
  "collectionName": "Sistema",
  "name": "Health",
  "method": "GET",
  "url": "http://localhost:3000/health",
  "params": [],
  "headers": [],
  "body": ""
}
"#,
        )
        .unwrap();

        let project = open_project_sync(root.to_str().unwrap()).unwrap();
        assert_eq!(project.schema_version, 2);
        assert_eq!(project.request_count, 1);
        assert!(root.join("requests/system/health.json").is_file());
        assert!(root.join("folders/general.json").is_file());
        assert!(root.join("monitors").is_dir());
        assert!(!project_dir.join("requests").exists());
        assert!(!project_dir.join("folders").exists());
        assert!(!project_dir.join("monitors").exists());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_to_overwrite_visible_content_during_migration() {
        let root = temporary_directory();
        create_project_sync(root.to_str().unwrap(), "Proyecto con conflicto").unwrap();

        let project_dir = root.join(".nexora");
        std::fs::rename(root.join("folders"), project_dir.join("folders")).unwrap();
        std::fs::create_dir(root.join("folders")).unwrap();
        std::fs::write(root.join("folders/general.json"), "contenido distinto\n").unwrap();

        let error = open_project_sync(root.to_str().unwrap()).unwrap_err();
        assert!(error.to_string().contains("No se puede migrar"));
        assert!(project_dir.join("folders/general.json").is_file());
        assert_eq!(
            std::fs::read_to_string(root.join("folders/general.json")).unwrap(),
            "contenido distinto\n"
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_to_persist_direct_secrets() {
        let root = temporary_directory();
        create_project_sync(root.to_str().unwrap(), "Prueba").unwrap();
        let mut request = SavedRequest {
            id: "private".into(),
            collection_id: "system".into(),
            collection_name: "Sistema".into(),
            name: "Privada".into(),
            method: "GET".into(),
            url: "http://localhost:3000/private".into(),
            params: vec![],
            headers: vec![super::KeyValueItem {
                id: "auth".into(),
                enabled: true,
                key: "Authorization".into(),
                value: "Bearer real-secret".into(),
            }],
            body: String::new(),
        };
        assert!(save_request_sync(root.to_str().unwrap(), request.clone()).is_err());
        request.headers[0].value = "Bearer {{token}}".into();
        assert!(save_request_sync(root.to_str().unwrap(), request).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }
}

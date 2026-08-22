use std::{
    fs,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use keyring::Entry;
use mongodb::{bson::doc, Client};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::{
    commands::{
        local_runtime::{process_loopback_ports, process_owns_loopback_port, wait_for_closed_port},
        projects::project_runtime_context,
    },
    error::{AppError, CommandResult},
    state::AppState,
};

const MANAGED_USERNAME: &str = "nexora_local";
const KEYRING_SERVICE: &str = "Nexora Managed MongoDB";
const PREFERRED_MONGODB_VERSION: &str = "8.3.8";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

pub struct ManagedMongoRuntime {
    child: Option<Child>,
    pub connection_id: String,
    pub data_path: PathBuf,
    pub process_id: u32,
    pub port: u16,
    pub project_root: PathBuf,
    pub version: String,
}

impl ManagedMongoRuntime {
    fn is_running(&mut self) -> bool {
        self.child.as_mut().map_or_else(
            || process_owns_loopback_port(self.process_id, self.port),
            |child| child.try_wait().ok().flatten().is_none(),
        )
    }

    fn stop(mut self) {
        if let Some(mut child) = self.child.take() {
            let started = Instant::now();
            while started.elapsed() < SHUTDOWN_TIMEOUT {
                match child.try_wait() {
                    Ok(Some(_)) => return,
                    Ok(None) => thread::sleep(Duration::from_millis(100)),
                    Err(_) => break,
                }
            }
            let _ = child.kill();
            let _ = child.wait();
        } else {
            wait_for_closed_port(self.port, SHUTDOWN_TIMEOUT);
        }
    }
}

impl Drop for ManagedMongoRuntime {
    fn drop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            if child.try_wait().ok().flatten().is_none() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMongoStatus {
    available: bool,
    active: bool,
    connection_id: Option<String>,
    data_path: Option<String>,
    port: Option<u16>,
    project_root: Option<String>,
    runtime_path: Option<String>,
    version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMongoConnection {
    connection_id: String,
    databases: Vec<String>,
    data_path: String,
    port: u16,
    version: String,
}

#[tauri::command]
pub fn managed_mongodb_status(state: State<'_, AppState>) -> CommandResult<ManagedMongoStatus> {
    let executable = find_mongod();
    let mut runtime = state
        .managed_mongo
        .lock()
        .map_err(|_| AppError::Internal("El supervisor MongoDB está bloqueado".into()))?;
    let active = runtime
        .as_mut()
        .is_some_and(ManagedMongoRuntime::is_running);
    if !active {
        runtime.take();
    }

    Ok(ManagedMongoStatus {
        available: executable.is_ok(),
        active,
        connection_id: runtime
            .as_ref()
            .map(|runtime| runtime.connection_id.clone()),
        data_path: runtime
            .as_ref()
            .map(|runtime| runtime.data_path.to_string_lossy().into_owned()),
        port: runtime.as_ref().map(|runtime| runtime.port),
        project_root: runtime
            .as_ref()
            .map(|runtime| runtime.project_root.to_string_lossy().into_owned()),
        runtime_path: executable
            .as_ref()
            .ok()
            .map(|(path, _)| path.to_string_lossy().into_owned()),
        version: runtime
            .as_ref()
            .map(|runtime| runtime.version.clone())
            .or_else(|| executable.ok().map(|(_, version)| version)),
    })
}

#[tauri::command]
pub async fn start_managed_mongodb(
    state: State<'_, AppState>,
    project_root: String,
) -> CommandResult<ManagedMongoConnection> {
    start_managed_internal(&state, &project_root)
        .await
        .map_err(Into::into)
}

async fn start_managed_internal(
    state: &AppState,
    project_root: &str,
) -> Result<ManagedMongoConnection, AppError> {
    let (project_root, project_id) = project_runtime_context(project_root)?;

    if let Some(connection) = active_connection(state, &project_root).await? {
        return Ok(connection);
    }
    stop_managed_internal(state).await?;

    let (executable, version) = find_mongod()?;
    let runtime_root = project_root.join(".nexora/runtime/mongodb");
    let data_path = runtime_root.join("data");
    let log_path = runtime_root.join("logs/mongod.log");
    let initialized = data_path.join("WiredTiger").is_file();
    fs::create_dir_all(&data_path)?;
    if let Some(log_directory) = log_path.parent() {
        fs::create_dir_all(log_directory)?;
    }

    let password = project_password(&project_id, initialized)?;
    if initialized {
        if let Some((process, client, databases)) =
            recover_existing_mongod(&project_root, &data_path, &version, &password).await?
        {
            return install_managed_connection(state, process, client, databases);
        }
    }
    let process = tauri::async_runtime::spawn_blocking({
        let executable = executable.clone();
        let version = version.clone();
        let data_path = data_path.clone();
        let log_path = log_path.clone();
        let project_root = project_root.clone();
        move || spawn_mongod(&executable, &project_root, &data_path, &log_path, &version)
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))??;

    let port = process.port;
    if !initialized {
        bootstrap_user(port, &password).await?;
    }
    let client = authenticated_client(port, &password).await?;
    client
        .database("admin")
        .run_command(doc! { "ping": 1 })
        .await
        .map_err(AppError::from)?;
    let mut databases = client.list_database_names().await.map_err(AppError::from)?;
    databases.sort_by_key(|name| name.to_lowercase());

    install_managed_connection(state, process, client, databases)
}

fn install_managed_connection(
    state: &AppState,
    process: ManagedMongoRuntime,
    client: Client,
    databases: Vec<String>,
) -> Result<ManagedMongoConnection, AppError> {
    let connection_id = process.connection_id.clone();
    let data_path = process.data_path.clone();
    let port = process.port;
    let version = process.version.clone();
    state
        .mongo
        .lock()
        .map_err(|_| AppError::Internal("El estado de MongoDB está bloqueado".into()))?
        .insert(connection_id.clone(), client);
    *state
        .managed_mongo
        .lock()
        .map_err(|_| AppError::Internal("El supervisor MongoDB está bloqueado".into()))? =
        Some(process);

    Ok(ManagedMongoConnection {
        connection_id,
        databases,
        data_path: data_path.to_string_lossy().into_owned(),
        port,
        version,
    })
}

async fn recover_existing_mongod(
    project_root: &Path,
    data_path: &Path,
    version: &str,
    password: &str,
) -> Result<Option<(ManagedMongoRuntime, Client, Vec<String>)>, AppError> {
    let Some(process_id) = mongo_lock_process_id(data_path) else {
        return Ok(None);
    };

    let ports = process_loopback_ports(process_id);
    for port in &ports {
        let Ok(client) = authenticated_client(*port, password).await else {
            continue;
        };
        if client
            .database("admin")
            .run_command(doc! { "ping": 1 })
            .await
            .is_err()
        {
            continue;
        }
        let mut databases = client.list_database_names().await.map_err(AppError::from)?;
        databases.sort_by_key(|name| name.to_lowercase());
        return Ok(Some((
            ManagedMongoRuntime {
                child: None,
                connection_id: Uuid::new_v4().to_string(),
                data_path: data_path.to_owned(),
                process_id,
                port: *port,
                project_root: project_root.to_owned(),
                version: version.to_owned(),
            },
            client,
            databases,
        )));
    }

    if !ports.is_empty() {
        return Err(AppError::Credential(
            "MongoDB ya está activo, pero Nexora no pudo recuperar su sesión local".into(),
        ));
    }

    Ok(None)
}

fn mongo_lock_process_id(data_path: &Path) -> Option<u32> {
    fs::read_to_string(data_path.join("mongod.lock"))
        .ok()?
        .trim()
        .parse()
        .ok()
}

#[tauri::command]
pub async fn stop_managed_mongodb(state: State<'_, AppState>) -> CommandResult<()> {
    stop_managed_internal(&state).await.map_err(Into::into)
}

async fn active_connection(
    state: &AppState,
    project_root: &Path,
) -> Result<Option<ManagedMongoConnection>, AppError> {
    let snapshot = {
        let mut runtime = state
            .managed_mongo
            .lock()
            .map_err(|_| AppError::Internal("El supervisor MongoDB está bloqueado".into()))?;
        runtime.as_mut().and_then(|runtime| {
            (runtime.project_root == project_root && runtime.is_running()).then(|| {
                (
                    runtime.connection_id.clone(),
                    runtime.data_path.clone(),
                    runtime.port,
                    runtime.version.clone(),
                )
            })
        })
    };
    let Some((connection_id, data_path, port, version)) = snapshot else {
        return Ok(None);
    };
    let client = state
        .mongo
        .lock()
        .map_err(|_| AppError::Internal("El estado de MongoDB está bloqueado".into()))?
        .get(&connection_id)
        .cloned();
    let Some(client) = client else {
        return Ok(None);
    };
    let mut databases = client.list_database_names().await?;
    databases.sort_by_key(|name| name.to_lowercase());
    Ok(Some(ManagedMongoConnection {
        connection_id,
        databases,
        data_path: data_path.to_string_lossy().into_owned(),
        port,
        version,
    }))
}

async fn stop_managed_internal(state: &AppState) -> Result<(), AppError> {
    let runtime = state
        .managed_mongo
        .lock()
        .map_err(|_| AppError::Internal("El supervisor MongoDB está bloqueado".into()))?
        .take();
    let Some(runtime) = runtime else {
        return Ok(());
    };
    let client = state
        .mongo
        .lock()
        .map_err(|_| AppError::Internal("El estado de MongoDB está bloqueado".into()))?
        .remove(&runtime.connection_id);
    if let Some(client) = client {
        let _ = client
            .database("admin")
            .run_command(doc! { "shutdown": 1, "force": true })
            .await;
    }
    tauri::async_runtime::spawn_blocking(move || runtime.stop())
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(())
}

fn find_mongod() -> Result<(PathBuf, String), AppError> {
    if let Some(path) = std::env::var_os("NEXORA_MONGOD_PATH") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok((path, "custom".into()));
        }
    }
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| AppError::NotFound("LOCALAPPDATA no está disponible".into()))?;
    let path = PathBuf::from(local_app_data)
        .join("Nexora/runtimes/mongodb")
        .join(PREFERRED_MONGODB_VERSION)
        .join("mongod.exe");
    if !path.is_file() {
        return Err(AppError::NotFound(format!(
            "No se encontró el runtime MongoDB {} en {}",
            PREFERRED_MONGODB_VERSION,
            path.display()
        )));
    }
    Ok((path, PREFERRED_MONGODB_VERSION.into()))
}

fn project_password(project_id: &str, initialized: bool) -> Result<String, AppError> {
    let entry = Entry::new(KEYRING_SERVICE, project_id)
        .map_err(|error| AppError::Credential(error.to_string()))?;
    match entry.get_password() {
        Ok(password) => Ok(password),
        Err(keyring::Error::NoEntry) if initialized => Err(AppError::Credential(
            "Falta la credencial de este MongoDB local en Windows Credential Manager".into(),
        )),
        Err(keyring::Error::NoEntry) => {
            let password = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
            entry
                .set_password(&password)
                .map_err(|error| AppError::Credential(error.to_string()))?;
            Ok(password)
        }
        Err(error) => Err(AppError::Credential(error.to_string())),
    }
}

fn spawn_mongod(
    executable: &Path,
    project_root: &Path,
    data_path: &Path,
    log_path: &Path,
    version: &str,
) -> Result<ManagedMongoRuntime, AppError> {
    let port = free_loopback_port()?;
    let mut command = Command::new(executable);
    command
        .arg("--dbpath")
        .arg(data_path)
        .arg("--bind_ip")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--auth")
        .arg("--logpath")
        .arg(log_path)
        .arg("--logappend")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let child = command.spawn()?;
    let process_id = child.id();
    let mut runtime = ManagedMongoRuntime {
        child: Some(child),
        connection_id: Uuid::new_v4().to_string(),
        data_path: data_path.to_owned(),
        process_id,
        port,
        project_root: project_root.to_owned(),
        version: version.to_owned(),
    };
    wait_until_ready(&mut runtime, log_path)?;
    Ok(runtime)
}

fn wait_until_ready(runtime: &mut ManagedMongoRuntime, log_path: &Path) -> Result<(), AppError> {
    let started = Instant::now();
    while started.elapsed() < STARTUP_TIMEOUT {
        if !runtime.is_running() {
            return Err(AppError::Internal(format!(
                "mongod terminó durante el arranque. {}",
                startup_error(runtime, log_path)
            )));
        }
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", runtime.port)
                .parse()
                .map_err(|error| AppError::Internal(format!("Puerto local no válido: {error}")))?,
            Duration::from_millis(200),
        )
        .is_ok()
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err(AppError::Internal(format!(
        "MongoDB no estuvo listo en {} segundos. {}",
        STARTUP_TIMEOUT.as_secs(),
        startup_error(runtime, log_path)
    )))
}

fn free_loopback_port() -> Result<u16, AppError> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

async fn bootstrap_user(port: u16, password: &str) -> Result<(), AppError> {
    let client = Client::with_uri_str(format!(
        "mongodb://127.0.0.1:{port}/?directConnection=true&serverSelectionTimeoutMS=5000"
    ))
    .await?;
    client
        .database("admin")
        .run_command(doc! {
            "createUser": MANAGED_USERNAME,
            "pwd": password,
            "roles": [{ "role": "root", "db": "admin" }]
        })
        .await?;
    Ok(())
}

async fn authenticated_client(port: u16, password: &str) -> Result<Client, AppError> {
    Ok(Client::with_uri_str(format!(
        "mongodb://{MANAGED_USERNAME}:{password}@127.0.0.1:{port}/?authSource=admin&directConnection=true&serverSelectionTimeoutMS=5000&connectTimeoutMS=3000"
    ))
    .await?)
}

fn startup_error(runtime: &ManagedMongoRuntime, path: &Path) -> String {
    if mongo_lock_process_id(&runtime.data_path).is_some_and(|process_id| {
        process_id != runtime.process_id && !process_loopback_ports(process_id).is_empty()
    }) {
        return "Ya existe un MongoDB activo para este proyecto".into();
    }
    let Ok(contents) = fs::read_to_string(path) else {
        return "No se pudo leer el diagnóstico de MongoDB".into();
    };
    let message = contents
        .lines()
        .rev()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .find(|entry| matches!(entry["s"].as_str(), Some("E" | "F")))
        .and_then(|entry| entry["msg"].as_str().map(str::to_owned))
        .unwrap_or_else(|| "MongoDB no pudo completar el arranque".into());
    message.chars().take(180).collect()
}

#[cfg(test)]
mod tests {
    use std::{fs, net::TcpStream};

    use mongodb::bson::{doc, Document};

    use super::{
        find_mongod, free_loopback_port, start_managed_internal, stop_managed_internal,
        KEYRING_SERVICE,
    };
    use crate::{commands::projects::create_project_sync, error::AppError, state::AppState};

    #[test]
    #[ignore = "requires the optional Nexora MongoDB runtime"]
    fn finds_the_installed_managed_runtime() {
        let (path, version) = find_mongod().expect("managed mongod runtime");
        assert!(path.is_file());
        assert_eq!(version, "8.3.8");
    }

    #[test]
    fn allocates_a_loopback_port() {
        assert_ne!(free_loopback_port().unwrap(), 0);
    }

    #[test]
    #[ignore = "requires mongod and Windows Credential Manager"]
    fn runs_an_authenticated_project_database_end_to_end() {
        let root = std::env::temp_dir().join(format!(
            "nexora-managed-mongodb-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir(&root).expect("temporary project directory");
        create_project_sync(root.to_str().unwrap(), "MongoDB runtime test")
            .expect("Nexora project");
        let manifest: serde_json::Value = serde_json::from_slice(
            &fs::read(root.join(".nexora/project.json")).expect("project manifest"),
        )
        .expect("valid project manifest");
        let project_id = manifest["id"].as_str().expect("project id").to_owned();
        let first_state = AppState::new().expect("first application state");
        let first_connection = tauri::async_runtime::block_on(start_managed_internal(
            &first_state,
            root.to_str().unwrap(),
        ))
        .expect("first managed MongoDB start");
        let orphan = first_state
            .managed_mongo
            .lock()
            .expect("first MongoDB runtime lock")
            .take()
            .expect("first MongoDB runtime");
        std::mem::forget(orphan);
        drop(first_state);

        let state = AppState::new().expect("restarted application state");

        let result = tauri::async_runtime::block_on(async {
            let connection = start_managed_internal(&state, root.to_str().unwrap()).await?;
            assert_eq!(connection.port, first_connection.port);
            let client = state
                .mongo
                .lock()
                .map_err(|_| AppError::Internal("MongoDB test state lock".into()))?
                .get(&connection.connection_id)
                .cloned()
                .ok_or_else(|| AppError::NotFound("MongoDB test connection".into()))?;
            let database = client.database("nexora_runtime_test");
            database.create_collection("documents").await?;
            let collection = database.collection::<Document>("documents");
            collection
                .insert_one(doc! { "name": "managed", "working": true, "rank": 1 })
                .await?;
            collection
                .insert_one(doc! { "name": "temporary", "working": true, "rank": 2 })
                .await?;
            let databases = client.list_database_names().await?;
            let collections = database.list_collection_names().await?;
            let update = collection
                .update_one(
                    doc! { "name": "managed" },
                    doc! { "$set": { "working": false, "updated": true } },
                )
                .await?;
            let updated = collection
                .find_one(doc! { "name": "managed" })
                .await?
                .ok_or_else(|| AppError::NotFound("MongoDB test document".into()))?;
            let deleted = collection.delete_one(doc! { "name": "temporary" }).await?;
            let remaining = collection.count_documents(doc! {}).await?;
            stop_managed_internal(&state).await?;
            Ok::<_, AppError>((
                connection.port,
                databases,
                collections,
                update,
                updated,
                deleted,
                remaining,
            ))
        });

        let _ = tauri::async_runtime::block_on(stop_managed_internal(&state));
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &project_id) {
            let _ = entry.delete_credential();
        }
        fs::remove_dir_all(&root).expect("remove temporary project");

        let (port, databases, collections, update, updated, deleted, remaining) =
            result.expect("managed MongoDB lifecycle");
        assert!(databases.iter().any(|name| name == "nexora_runtime_test"));
        assert!(collections.iter().any(|name| name == "documents"));
        assert_eq!(update.matched_count, 1);
        assert_eq!(update.modified_count, 1);
        assert_eq!(updated.get_bool("working"), Ok(false));
        assert_eq!(updated.get_bool("updated"), Ok(true));
        assert_eq!(deleted.deleted_count, 1);
        assert_eq!(remaining, 1);
        assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
    }
}

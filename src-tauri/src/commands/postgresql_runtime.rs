use std::{
    fs::{self, OpenOptions},
    io::Write,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use keyring::Entry;
use serde::Serialize;
use tauri::State;
use tokio_postgres::{Client, Config, NoTls};
use uuid::Uuid;

use crate::{
    commands::{
        local_runtime::{process_owns_loopback_port, wait_for_closed_port},
        projects::project_runtime_context,
    },
    error::{AppError, CommandResult},
    limits::MAX_SMALL_FILE_BYTES,
    state::AppState,
    storage::{ensure_directory, read_tail, read_text},
};

pub(crate) const MANAGED_DATABASE: &str = "nexora";
pub(crate) const MANAGED_USERNAME: &str = "nexora_local";
const KEYRING_SERVICE: &str = "Nexora Managed PostgreSQL";
const PREFERRED_POSTGRESQL_VERSION: &str = "18.6";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);

pub struct ManagedPostgresRuntime {
    child: Option<Child>,
    pub connection_id: String,
    pub data_path: PathBuf,
    pub database: String,
    pg_ctl_path: PathBuf,
    pub port: u16,
    pub process_id: u32,
    pub project_id: String,
    pub project_root: PathBuf,
    pub version: String,
}

impl ManagedPostgresRuntime {
    fn is_running(&mut self) -> bool {
        self.child.as_mut().map_or_else(
            || process_owns_loopback_port(self.process_id, self.port),
            |child| child.try_wait().ok().flatten().is_none(),
        )
    }

    fn shutdown(&mut self) {
        let mut child = self.child.take();
        let child_is_running = child
            .as_mut()
            .is_some_and(|child| child.try_wait().ok().flatten().is_none());
        if child_is_running || process_owns_loopback_port(self.process_id, self.port) {
            let _ = pg_ctl_stop(&self.pg_ctl_path, &self.data_path);
        }
        let Some(mut child) = child else {
            wait_for_closed_port(self.port, SHUTDOWN_TIMEOUT);
            return;
        };
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
    }

    fn stop(mut self) {
        self.shutdown();
    }
}

impl Drop for ManagedPostgresRuntime {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedPostgresStatus {
    available: bool,
    active: bool,
    connection_id: Option<String>,
    data_path: Option<String>,
    database: Option<String>,
    port: Option<u16>,
    project_root: Option<String>,
    runtime_path: Option<String>,
    username: Option<String>,
    version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedPostgresConnection {
    connection_id: String,
    data_path: String,
    database: String,
    port: u16,
    username: String,
    version: String,
}

#[tauri::command]
pub fn managed_postgresql_status(
    state: State<'_, AppState>,
) -> CommandResult<ManagedPostgresStatus> {
    let distribution = find_postgresql_distribution();
    let mut runtime = state
        .managed_postgres
        .lock()
        .map_err(|_| AppError::Internal("El supervisor PostgreSQL está bloqueado".into()))?;
    let active = runtime
        .as_mut()
        .is_some_and(ManagedPostgresRuntime::is_running);
    if !active {
        runtime.take();
    }

    Ok(ManagedPostgresStatus {
        available: distribution.is_ok(),
        active,
        connection_id: runtime
            .as_ref()
            .map(|runtime| runtime.connection_id.clone()),
        data_path: runtime
            .as_ref()
            .map(|runtime| runtime.data_path.to_string_lossy().into_owned()),
        database: runtime.as_ref().map(|runtime| runtime.database.clone()),
        port: runtime.as_ref().map(|runtime| runtime.port),
        project_root: runtime
            .as_ref()
            .map(|runtime| runtime.project_root.to_string_lossy().into_owned()),
        runtime_path: distribution
            .as_ref()
            .ok()
            .map(|runtime| runtime.postgres.to_string_lossy().into_owned()),
        username: runtime.as_ref().map(|_| MANAGED_USERNAME.into()),
        version: runtime
            .as_ref()
            .map(|runtime| runtime.version.clone())
            .or_else(|| distribution.ok().map(|runtime| runtime.version)),
    })
}

#[tauri::command]
pub async fn start_managed_postgresql(
    state: State<'_, AppState>,
    project_root: String,
) -> CommandResult<ManagedPostgresConnection> {
    start_managed_internal(&state, &project_root)
        .await
        .map_err(Into::into)
}

pub(crate) async fn start_managed_internal(
    state: &AppState,
    project_root: &str,
) -> Result<ManagedPostgresConnection, AppError> {
    let (project_root, project_id) = project_runtime_context(project_root)?;

    if let Some(connection) = active_connection(state, &project_root).await? {
        return Ok(connection);
    }
    stop_managed_internal(state).await?;

    let distribution = find_postgresql_distribution()?;
    let runtime_root = project_root.join(".nexora/runtime/postgresql");
    let data_path = runtime_root.join("data");
    let log_path = runtime_root.join("logs/postgresql.log");
    let initialized = data_path.join("PG_VERSION").is_file();
    ensure_directory(&runtime_root)?;
    ensure_directory(&data_path)?;
    if let Some(log_directory) = log_path.parent() {
        ensure_directory(log_directory)?;
    }

    let password = project_password(&project_id, initialized)?;
    if !initialized {
        initialize_cluster(&distribution.initdb, &runtime_root, &data_path, &password)?;
    } else if let Some(process) = recover_existing_postgres(
        &distribution,
        &project_root,
        &project_id,
        &data_path,
        &password,
    )
    .await?
    {
        let connection = connection_from_runtime(&process);
        *state
            .managed_postgres
            .lock()
            .map_err(|_| AppError::Internal("El supervisor PostgreSQL está bloqueado".into()))? =
            Some(process);
        return Ok(connection);
    }

    let mut process = spawn_postgres(
        &distribution,
        &project_root,
        &project_id,
        &data_path,
        &log_path,
    )?;
    if let Err(error) = wait_for_authenticated_server(process.port, &password).await {
        process.shutdown();
        return Err(error);
    }
    ensure_managed_database(process.port, &password).await?;
    let client = connect_client(process.port, &password, MANAGED_DATABASE).await?;
    client.simple_query("SELECT 1").await?;

    let connection = connection_from_runtime(&process);
    *state
        .managed_postgres
        .lock()
        .map_err(|_| AppError::Internal("El supervisor PostgreSQL está bloqueado".into()))? =
        Some(process);
    Ok(connection)
}

async fn recover_existing_postgres(
    distribution: &PostgresDistribution,
    project_root: &Path,
    project_id: &str,
    data_path: &Path,
    password: &str,
) -> Result<Option<ManagedPostgresRuntime>, AppError> {
    let Some((process_id, port)) = postmaster_process(data_path) else {
        return Ok(None);
    };
    if !process_owns_loopback_port(process_id, port) {
        return Ok(None);
    }
    let client = connect_client(port, password, "postgres")
        .await
        .map_err(|_| {
            AppError::Credential(
                "PostgreSQL ya está activo, pero Nexora no pudo recuperar su sesión local".into(),
            )
        })?;
    client.simple_query("SELECT 1").await.map_err(|_| {
        AppError::Credential(
            "PostgreSQL ya está activo, pero Nexora no pudo recuperar su sesión local".into(),
        )
    })?;
    ensure_managed_database(port, password).await?;

    Ok(Some(ManagedPostgresRuntime {
        child: None,
        connection_id: Uuid::new_v4().to_string(),
        data_path: data_path.to_owned(),
        database: MANAGED_DATABASE.into(),
        pg_ctl_path: distribution.pg_ctl.clone(),
        port,
        process_id,
        project_id: project_id.into(),
        project_root: project_root.to_owned(),
        version: distribution.version.clone(),
    }))
}

fn postmaster_process(data_path: &Path) -> Option<(u32, u16)> {
    let contents = read_text(
        &data_path.join("postmaster.pid"),
        MAX_SMALL_FILE_BYTES,
        "El bloqueo de PostgreSQL",
    )
    .ok()?;
    let mut lines = contents.lines();
    let process_id = lines.next()?.trim().parse().ok()?;
    let port = lines.nth(2)?.trim().parse().ok()?;
    Some((process_id, port))
}

#[tauri::command]
pub async fn stop_managed_postgresql(state: State<'_, AppState>) -> CommandResult<()> {
    stop_managed_internal(&state).await.map_err(Into::into)
}

pub(crate) async fn stop_managed_internal(state: &AppState) -> Result<(), AppError> {
    let runtime = state
        .managed_postgres
        .lock()
        .map_err(|_| AppError::Internal("El supervisor PostgreSQL está bloqueado".into()))?
        .take();
    let Some(runtime) = runtime else {
        return Ok(());
    };
    tauri::async_runtime::spawn_blocking(move || runtime.stop())
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(())
}

async fn active_connection(
    state: &AppState,
    project_root: &Path,
) -> Result<Option<ManagedPostgresConnection>, AppError> {
    let snapshot = {
        let mut runtime = state
            .managed_postgres
            .lock()
            .map_err(|_| AppError::Internal("El supervisor PostgreSQL está bloqueado".into()))?;
        runtime.as_mut().and_then(|runtime| {
            (runtime.project_root == project_root && runtime.is_running()).then(|| {
                (
                    runtime.connection_id.clone(),
                    runtime.data_path.clone(),
                    runtime.database.clone(),
                    runtime.port,
                    runtime.project_id.clone(),
                    runtime.version.clone(),
                )
            })
        })
    };
    let Some((connection_id, data_path, database, port, project_id, version)) = snapshot else {
        return Ok(None);
    };
    let password = stored_project_password(&project_id)?;
    let client = connect_client(port, &password, &database).await?;
    client.simple_query("SELECT 1").await?;
    Ok(Some(ManagedPostgresConnection {
        connection_id,
        data_path: data_path.to_string_lossy().into_owned(),
        database,
        port,
        username: MANAGED_USERNAME.into(),
        version,
    }))
}

pub(crate) async fn managed_client(
    state: &AppState,
    connection_id: &str,
) -> Result<Client, AppError> {
    let snapshot = {
        let mut runtime = state
            .managed_postgres
            .lock()
            .map_err(|_| AppError::Internal("El supervisor PostgreSQL está bloqueado".into()))?;
        let runtime = runtime.as_mut().ok_or_else(|| {
            AppError::NotFound("La conexión PostgreSQL local ya no está activa".into())
        })?;
        if runtime.connection_id != connection_id || !runtime.is_running() {
            return Err(AppError::NotFound(
                "La conexión PostgreSQL local ya no está activa".into(),
            ));
        }
        (
            runtime.port,
            runtime.project_id.clone(),
            runtime.database.clone(),
        )
    };
    let password = stored_project_password(&snapshot.1)?;
    connect_client(snapshot.0, &password, &snapshot.2).await
}

#[derive(Clone)]
struct PostgresDistribution {
    initdb: PathBuf,
    pg_ctl: PathBuf,
    postgres: PathBuf,
    version: String,
}

struct SensitiveFile(PathBuf);

impl Drop for SensitiveFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn find_postgresql_distribution() -> Result<PostgresDistribution, AppError> {
    if let Some(home) = std::env::var_os("NEXORA_POSTGRESQL_HOME") {
        let home = PathBuf::from(home);
        if let Ok(distribution) = distribution_at(&home, "custom") {
            return Ok(distribution);
        }
    }
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| AppError::NotFound("LOCALAPPDATA no está disponible".into()))?;
    let home = PathBuf::from(local_app_data)
        .join("Nexora/runtimes/postgresql")
        .join(PREFERRED_POSTGRESQL_VERSION)
        .join("pgsql");
    distribution_at(&home, PREFERRED_POSTGRESQL_VERSION)
}

fn distribution_at(home: &Path, version: &str) -> Result<PostgresDistribution, AppError> {
    let bin = home.join("bin");
    let distribution = PostgresDistribution {
        initdb: bin.join("initdb.exe"),
        pg_ctl: bin.join("pg_ctl.exe"),
        postgres: bin.join("postgres.exe"),
        version: version.into(),
    };
    if [
        &distribution.initdb,
        &distribution.pg_ctl,
        &distribution.postgres,
    ]
    .iter()
    .all(|path| path.is_file())
    {
        Ok(distribution)
    } else {
        Err(AppError::NotFound(format!(
            "No se encontró PostgreSQL {} en {}",
            version,
            home.display()
        )))
    }
}

fn initialize_cluster(
    initdb: &Path,
    runtime_root: &Path,
    data_path: &Path,
    password: &str,
) -> Result<(), AppError> {
    let password_file = runtime_root.join(format!(".initdb-password-{}.tmp", Uuid::new_v4()));
    let mut password_output = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&password_file)?;
    let password_cleanup = SensitiveFile(password_file.clone());
    password_output.write_all(password.as_bytes())?;
    password_output.sync_all()?;
    drop(password_output);
    let output = hidden_command(initdb)
        .arg("--pgdata")
        .arg(external_process_path(data_path))
        .arg("--username")
        .arg(MANAGED_USERNAME)
        .arg("--pwfile")
        .arg(&password_file)
        .arg("--auth-host=scram-sha-256")
        .arg("--auth-local=scram-sha-256")
        .arg("--encoding=UTF8")
        .arg("--no-locale")
        .stdin(Stdio::null())
        .output();
    drop(password_cleanup);
    let output = output?;
    if !output.status.success() {
        return Err(AppError::Internal(format!(
            "No se pudo inicializar PostgreSQL: {}",
            output_message(&output)
        )));
    }
    Ok(())
}

fn spawn_postgres(
    distribution: &PostgresDistribution,
    project_root: &Path,
    project_id: &str,
    data_path: &Path,
    log_path: &Path,
) -> Result<ManagedPostgresRuntime, AppError> {
    let port = free_loopback_port()?;
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;
    let stderr = log.try_clone()?;
    let child = hidden_command(&distribution.postgres)
        .arg("-D")
        .arg(external_process_path(data_path))
        .arg("-h")
        .arg("127.0.0.1")
        .arg("-p")
        .arg(port.to_string())
        .arg("-c")
        .arg("max_connections=20")
        .arg("-c")
        .arg("shared_buffers=64MB")
        .arg("-c")
        .arg("statement_timeout=30000")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(stderr))
        .spawn()?;
    let process_id = child.id();
    let mut runtime = ManagedPostgresRuntime {
        child: Some(child),
        connection_id: Uuid::new_v4().to_string(),
        data_path: data_path.to_owned(),
        database: MANAGED_DATABASE.into(),
        pg_ctl_path: distribution.pg_ctl.clone(),
        port,
        process_id,
        project_id: project_id.into(),
        project_root: project_root.to_owned(),
        version: distribution.version.clone(),
    };
    wait_until_port_ready(&mut runtime, log_path)?;
    Ok(runtime)
}

fn wait_until_port_ready(
    runtime: &mut ManagedPostgresRuntime,
    log_path: &Path,
) -> Result<(), AppError> {
    let started = Instant::now();
    while started.elapsed() < STARTUP_TIMEOUT {
        if !runtime.is_running() {
            return Err(AppError::Internal(format!(
                "PostgreSQL terminó durante el arranque. {}",
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
        "PostgreSQL no estuvo listo en {} segundos. {}",
        STARTUP_TIMEOUT.as_secs(),
        startup_error(runtime, log_path)
    )))
}

async fn wait_for_authenticated_server(port: u16, password: &str) -> Result<(), AppError> {
    let started = Instant::now();
    let mut last_error = None;
    while started.elapsed() < STARTUP_TIMEOUT {
        match connect_client(port, password, "postgres").await {
            Ok(client) => {
                client.simple_query("SELECT 1").await?;
                return Ok(());
            }
            Err(error) => last_error = Some(error.to_string()),
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
    Err(AppError::Internal(format!(
        "PostgreSQL no aceptó la conexión local: {}",
        last_error.unwrap_or_else(|| "tiempo de espera agotado".into())
    )))
}

async fn ensure_managed_database(port: u16, password: &str) -> Result<(), AppError> {
    let client = connect_client(port, password, "postgres").await?;
    let exists = client
        .query_opt(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            &[&MANAGED_DATABASE],
        )
        .await?
        .is_some();
    if !exists {
        client
            .simple_query("CREATE DATABASE nexora ENCODING 'UTF8'")
            .await?;
    }
    Ok(())
}

async fn connect_client(port: u16, password: &str, database: &str) -> Result<Client, AppError> {
    let mut config = Config::new();
    config
        .host("127.0.0.1")
        .port(port)
        .user(MANAGED_USERNAME)
        .password(password)
        .dbname(database)
        .connect_timeout(Duration::from_secs(3));
    let (client, connection) = config.connect(NoTls).await?;
    tauri::async_runtime::spawn(async move {
        let _ = connection.await;
    });
    Ok(client)
}

fn project_password(project_id: &str, initialized: bool) -> Result<String, AppError> {
    let entry = credential_entry(project_id)?;
    match entry.get_password() {
        Ok(password) => Ok(password),
        Err(keyring::Error::NoEntry) if initialized => Err(AppError::Credential(
            "Falta la credencial de este PostgreSQL local en Windows Credential Manager".into(),
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

fn stored_project_password(project_id: &str) -> Result<String, AppError> {
    credential_entry(project_id)?
        .get_password()
        .map_err(|error| AppError::Credential(error.to_string()))
}

fn credential_entry(project_id: &str) -> Result<Entry, AppError> {
    Entry::new(KEYRING_SERVICE, project_id).map_err(|error| AppError::Credential(error.to_string()))
}

fn connection_from_runtime(runtime: &ManagedPostgresRuntime) -> ManagedPostgresConnection {
    ManagedPostgresConnection {
        connection_id: runtime.connection_id.clone(),
        data_path: runtime.data_path.to_string_lossy().into_owned(),
        database: runtime.database.clone(),
        port: runtime.port,
        username: MANAGED_USERNAME.into(),
        version: runtime.version.clone(),
    }
}

fn pg_ctl_stop(pg_ctl: &Path, data_path: &Path) -> Result<(), AppError> {
    let output = hidden_command(pg_ctl)
        .arg("stop")
        .arg("-D")
        .arg(external_process_path(data_path))
        .arg("--mode=fast")
        .arg("--wait")
        .arg(format!("--timeout={}", SHUTDOWN_TIMEOUT.as_secs()))
        .stdin(Stdio::null())
        .output()?;
    if output.status.success() {
        Ok(())
    } else {
        Err(AppError::Internal(output_message(&output)))
    }
}

fn hidden_command(executable: &Path) -> Command {
    let mut command = Command::new(external_process_path(executable));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

fn external_process_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let value = path.to_string_lossy();
        let normalized = if let Some(value) = value.strip_prefix(r"\\?\UNC\") {
            PathBuf::from(format!(r"\\{value}"))
        } else if let Some(value) = value.strip_prefix(r"\\?\") {
            PathBuf::from(value)
        } else {
            path.to_owned()
        };
        return windows_short_path(&normalized).unwrap_or(normalized);
    }
    #[allow(unreachable_code)]
    path.to_owned()
}

#[cfg(windows)]
fn windows_short_path(path: &Path) -> Option<PathBuf> {
    use std::{
        ffi::OsString,
        os::windows::ffi::{OsStrExt, OsStringExt},
    };
    use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;

    let source: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let required = unsafe { GetShortPathNameW(source.as_ptr(), std::ptr::null_mut(), 0) };
    if required == 0 {
        return None;
    }
    let mut destination = vec![0_u16; required as usize + 1];
    let written = unsafe {
        GetShortPathNameW(
            source.as_ptr(),
            destination.as_mut_ptr(),
            destination.len() as u32,
        )
    };
    if written == 0 {
        return None;
    }
    destination.truncate(written as usize);
    Some(PathBuf::from(OsString::from_wide(&destination)))
}

fn output_message(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    if stderr.is_empty() {
        String::from_utf8_lossy(&output.stdout).trim().to_owned()
    } else {
        stderr
    }
}

fn free_loopback_port() -> Result<u16, AppError> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn startup_error(runtime: &ManagedPostgresRuntime, path: &Path) -> String {
    if postmaster_process(&runtime.data_path).is_some_and(|(process_id, port)| {
        process_id != runtime.process_id && process_owns_loopback_port(process_id, port)
    }) {
        return "Ya existe un PostgreSQL activo para este proyecto".into();
    }
    let Ok(contents) = read_tail(path, 64 * 1024) else {
        return "No se pudo leer el diagnóstico de PostgreSQL".into();
    };
    let message = contents
        .lines()
        .rev()
        .find(|line| line.contains("FATAL:") || line.contains("ERROR:"))
        .unwrap_or("PostgreSQL no pudo completar el arranque");
    message.chars().take(180).collect()
}

#[cfg(test)]
mod tests {
    use std::{fs, net::TcpStream};

    use super::{
        external_process_path, find_postgresql_distribution, free_loopback_port,
        start_managed_internal, stop_managed_internal, KEYRING_SERVICE,
    };
    use crate::{commands::projects::create_project_sync, error::AppError, state::AppState};

    #[test]
    #[ignore = "requires the optional Nexora PostgreSQL runtime"]
    fn finds_the_installed_managed_runtime() {
        let runtime = find_postgresql_distribution().expect("managed PostgreSQL runtime");
        assert!(runtime.postgres.is_file());
        assert_eq!(runtime.version, "18.6");
    }

    #[test]
    fn allocates_a_loopback_port() {
        assert_ne!(free_loopback_port().unwrap(), 0);
    }

    #[test]
    #[cfg(windows)]
    fn normalizes_windows_verbatim_paths_for_postgresql() {
        let path = std::path::Path::new(r"\\?\C:\projects\nexora");
        assert_eq!(
            external_process_path(path),
            std::path::PathBuf::from(r"C:\projects\nexora")
        );
    }

    #[test]
    #[ignore = "requires PostgreSQL and Windows Credential Manager"]
    fn runs_managed_postgresql_end_to_end() {
        let root = std::env::temp_dir().join(format!(
            "nexora-managed-postgresql-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir(&root).expect("temporary project directory");
        create_project_sync(root.to_str().unwrap(), "PostgreSQL runtime test")
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
        .expect("first managed PostgreSQL start");
        let orphan = first_state
            .managed_postgres
            .lock()
            .expect("first PostgreSQL runtime lock")
            .take()
            .expect("first PostgreSQL runtime");
        std::mem::forget(orphan);
        drop(first_state);

        let state = AppState::new().expect("restarted application state");

        let result = tauri::async_runtime::block_on(async {
            let connection = start_managed_internal(&state, root.to_str().unwrap()).await?;
            assert_eq!(connection.port, first_connection.port);
            let blocked = crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "CREATE TABLE runtime_test (id integer PRIMARY KEY, name text NOT NULL, working boolean NOT NULL)",
                false,
                None,
            )
            .await;
            assert!(matches!(blocked, Err(AppError::Validation(_))));
            crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "CREATE TABLE runtime_test (id integer PRIMARY KEY, name text NOT NULL, working boolean NOT NULL)",
                true,
                None,
            )
            .await?;
            crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "INSERT INTO runtime_test VALUES (1, 'first', true), (2, 'second', true)",
                true,
                None,
            )
            .await?;
            let blocked_update = crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "UPDATE runtime_test SET working = false WHERE id = 1",
                false,
                None,
            )
            .await;
            assert!(matches!(blocked_update, Err(AppError::Validation(_))));
            crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "UPDATE runtime_test SET name = 'updated', working = false WHERE id = 1",
                true,
                None,
            )
            .await?;
            let database =
                crate::commands::postgresql::inspect_internal(&state, &connection.connection_id)
                    .await?;
            let database = serde_json::to_value(database)?;
            let query = crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "SELECT id, name, working FROM runtime_test ORDER BY id",
                false,
                Some(1),
            )
            .await?;
            let query = serde_json::to_value(query)?;
            let blocked_delete = crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "DELETE FROM runtime_test WHERE id = 2",
                false,
                None,
            )
            .await;
            assert!(matches!(blocked_delete, Err(AppError::Validation(_))));
            let deleted = crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "DELETE FROM runtime_test WHERE id = 2",
                true,
                None,
            )
            .await?;
            let deleted = serde_json::to_value(deleted)?;
            let remaining = crate::commands::postgresql::execute_internal(
                &state,
                &connection.connection_id,
                "SELECT count(*) AS total FROM runtime_test",
                false,
                None,
            )
            .await?;
            let remaining = serde_json::to_value(remaining)?;
            stop_managed_internal(&state).await?;
            Ok::<_, AppError>((connection.port, database, query, deleted, remaining))
        });

        let _ = tauri::async_runtime::block_on(stop_managed_internal(&state));
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &project_id) {
            let _ = entry.delete_credential();
        }
        fs::remove_dir_all(&root).expect("remove temporary project");

        let (port, database, query, deleted, remaining) =
            result.expect("managed PostgreSQL lifecycle");
        assert_eq!(database["schemas"][0]["name"], "public");
        assert_eq!(database["schemas"][0]["tables"][0]["name"], "runtime_test");
        assert_eq!(
            database["schemas"][0]["tables"][0]["columns"][0]["name"],
            "id"
        );
        assert_eq!(
            database["schemas"][0]["tables"][0]["columns"][0]["primaryKey"],
            true
        );
        assert_eq!(query["rows"][0]["name"], "updated");
        assert_eq!(query["rows"][0]["working"], false);
        assert_eq!(query["truncated"], true);
        assert_eq!(deleted["affectedRows"], 1);
        assert_eq!(remaining["rows"][0]["total"], 1);
        assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
    }
}

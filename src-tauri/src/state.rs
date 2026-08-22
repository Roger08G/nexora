use std::{
    collections::HashMap,
    sync::{atomic::AtomicUsize, Arc, Mutex},
    time::Duration,
};

use mongodb::Client as MongoClient;
use reqwest::Client as HttpClient;

use crate::commands::mongodb_runtime::ManagedMongoRuntime;
use crate::commands::postgresql_runtime::ManagedPostgresRuntime;
use crate::error::AppError;

pub struct AppState {
    pub http: HttpClient,
    pub history_io: Arc<Mutex<()>>,
    pub monitor_io: Arc<Mutex<()>>,
    pub project_io: Arc<Mutex<()>>,
    pub mongo: Mutex<HashMap<String, MongoClient>>,
    pub mongo_connect_attempts: AtomicUsize,
    pub managed_mongo: Mutex<Option<ManagedMongoRuntime>>,
    pub managed_mongo_lifecycle: tokio::sync::Mutex<()>,
    pub managed_postgres: Mutex<Option<ManagedPostgresRuntime>>,
    pub managed_postgres_lifecycle: tokio::sync::Mutex<()>,
}

impl AppState {
    pub fn new() -> Result<Self, AppError> {
        let http = HttpClient::builder()
            .connect_timeout(Duration::from_secs(10))
            .pool_idle_timeout(Duration::from_secs(60))
            .pool_max_idle_per_host(4)
            .redirect(reqwest::redirect::Policy::limited(10))
            .tcp_keepalive(Duration::from_secs(30))
            .user_agent(concat!("Nexora/", env!("CARGO_PKG_VERSION")))
            .build()?;

        Ok(Self {
            http,
            history_io: Arc::new(Mutex::new(())),
            monitor_io: Arc::new(Mutex::new(())),
            project_io: Arc::new(Mutex::new(())),
            mongo: Mutex::new(HashMap::new()),
            mongo_connect_attempts: AtomicUsize::new(0),
            managed_mongo: Mutex::new(None),
            managed_mongo_lifecycle: tokio::sync::Mutex::new(()),
            managed_postgres: Mutex::new(None),
            managed_postgres_lifecycle: tokio::sync::Mutex::new(()),
        })
    }
}

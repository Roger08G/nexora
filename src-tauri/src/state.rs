use std::{collections::HashMap, sync::Mutex};

use mongodb::Client as MongoClient;
use reqwest::Client as HttpClient;

use crate::commands::mongodb_runtime::ManagedMongoRuntime;
use crate::commands::postgresql_runtime::ManagedPostgresRuntime;
use crate::error::AppError;

pub struct AppState {
    pub http: HttpClient,
    pub mongo: Mutex<HashMap<String, MongoClient>>,
    pub managed_mongo: Mutex<Option<ManagedMongoRuntime>>,
    pub managed_postgres: Mutex<Option<ManagedPostgresRuntime>>,
}

impl AppState {
    pub fn new() -> Result<Self, AppError> {
        let http = HttpClient::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(concat!("Nexora/", env!("CARGO_PKG_VERSION")))
            .build()?;

        Ok(Self {
            http,
            mongo: Mutex::new(HashMap::new()),
            managed_mongo: Mutex::new(None),
            managed_postgres: Mutex::new(None),
        })
    }
}

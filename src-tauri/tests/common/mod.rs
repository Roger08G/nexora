#![allow(dead_code)]

use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY},
    webview::InvokeRequest,
    App, WebviewWindow,
};

pub struct TestApp {
    _app: App<MockRuntime>,
    webview: WebviewWindow<MockRuntime>,
}

impl TestApp {
    pub fn new() -> Self {
        let app = nexora_lib::build_app(mock_builder(), mock_context(noop_assets()))
            .expect("aplicación Tauri de prueba");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview Tauri de prueba");
        Self { _app: app, webview }
    }

    pub fn invoke(&self, command: &str, arguments: Value) -> Result<Value, Value> {
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: command.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: if cfg!(any(windows, target_os = "android")) {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .expect("URL IPC"),
                body: InvokeBody::Json(arguments),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
        .map(|body| body.deserialize::<Value>().expect("respuesta IPC JSON"))
    }

    pub fn ok(&self, command: &str, arguments: Value) -> Value {
        self.invoke(command, arguments)
            .unwrap_or_else(|error| panic!("{command} devolvió un error inesperado: {error}"))
    }

    pub fn error(&self, command: &str, arguments: Value, expected_code: &str) -> Value {
        let error = self
            .invoke(command, arguments)
            .unwrap_err_or_else(|value| panic!("{command} debía fallar, respondió: {value}"));
        assert_eq!(error["code"], expected_code, "error IPC de {command}");
        assert!(
            error["message"]
                .as_str()
                .is_some_and(|message| !message.is_empty()),
            "{command} debe devolver un mensaje útil"
        );
        error
    }
}

trait ResultTestExt<T, E> {
    fn unwrap_err_or_else(self, on_ok: impl FnOnce(T) -> E) -> E;
}

impl<T, E> ResultTestExt<T, E> for Result<T, E> {
    fn unwrap_err_or_else(self, on_ok: impl FnOnce(T) -> E) -> E {
        match self {
            Ok(value) => on_ok(value),
            Err(error) => error,
        }
    }
}

pub struct TempDirectory {
    path: PathBuf,
}

impl TempDirectory {
    pub fn new(label: &str) -> Self {
        let path = std::env::temp_dir().join(format!("nexora-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).expect("directorio temporal");
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn string(&self) -> String {
        self.path.to_string_lossy().into_owned()
    }
}

impl Drop for TempDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

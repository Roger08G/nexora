mod commands;
mod error;
mod state;

use commands::{http, mongodb, mongodb_runtime, postgresql, postgresql_runtime, projects};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState::new().expect("failed to initialize Nexora services");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            projects::create_project,
            projects::open_project,
            projects::list_requests,
            projects::list_request_folders,
            projects::create_request_folder,
            projects::save_request,
            projects::delete_request,
            http::execute_http,
            mongodb::connect_mongodb,
            mongodb::disconnect_mongodb,
            mongodb_runtime::managed_mongodb_status,
            mongodb_runtime::start_managed_mongodb,
            mongodb_runtime::stop_managed_mongodb,
            mongodb::list_mongodb_databases,
            mongodb::list_mongodb_collections,
            mongodb::create_mongodb_collection,
            mongodb::find_mongodb,
            mongodb::insert_mongodb_document,
            mongodb::update_mongodb_document,
            mongodb::delete_mongodb_document,
            postgresql_runtime::managed_postgresql_status,
            postgresql_runtime::start_managed_postgresql,
            postgresql_runtime::stop_managed_postgresql,
            postgresql::inspect_postgresql,
            postgresql::execute_postgresql,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Nexora");
}

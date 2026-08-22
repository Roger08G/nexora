mod commands;
mod error;
mod limits;
mod state;
mod storage;

use commands::{
    history, http, mongodb, mongodb_runtime, monitors, postgresql, postgresql_runtime, projects,
};
use state::AppState;

pub fn build_app<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    context: tauri::Context<R>,
) -> tauri::Result<tauri::App<R>> {
    let state = AppState::new().map_err(|error| {
        tauri::Error::Setup((Box::new(error) as Box<dyn std::error::Error>).into())
    })?;

    builder
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
            history::list_history,
            history::append_history,
            history::delete_history_entry,
            history::clear_history,
            monitors::list_monitors,
            monitors::save_monitor,
            monitors::delete_monitor,
            mongodb::connect_mongodb,
            mongodb::disconnect_mongodb,
            mongodb_runtime::managed_mongodb_status,
            mongodb_runtime::start_managed_mongodb,
            mongodb_runtime::stop_managed_mongodb,
            mongodb::list_mongodb_databases,
            mongodb::list_mongodb_collections,
            mongodb::list_mongodb_indexes,
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
            postgresql::export_postgresql_csv,
        ])
        .build(context)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    build_app(builder, tauri::generate_context!())
        .expect("failed to initialize Nexora")
        .run(|_, _| {});
}

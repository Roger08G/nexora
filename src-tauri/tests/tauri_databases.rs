mod common;

use common::{TempDirectory, TestApp};
use serde_json::{json, Value};

const CONNECTION_ID: &str = "00000000-0000-4000-8000-000000000000";

#[test]
fn mongodb_command_surface_validates_inputs_before_driver_access() {
    let app = TestApp::new();

    app.error(
        "connect_mongodb",
        json!({ "input": { "uri": "file:///tmp/mongo" } }),
        "validation_error",
    );
    app.ok(
        "disconnect_mongodb",
        json!({ "connectionId": CONNECTION_ID }),
    );
    app.error(
        "list_mongodb_databases",
        json!({ "connectionId": CONNECTION_ID }),
        "not_found",
    );
    app.error(
        "list_mongodb_collections",
        json!({ "connectionId": CONNECTION_ID, "database": "nexora_test" }),
        "not_found",
    );
    app.error(
        "list_mongodb_indexes",
        json!({
            "collection": "users",
            "connectionId": CONNECTION_ID,
            "database": "nexora_test"
        }),
        "not_found",
    );
    app.error(
        "create_mongodb_collection",
        json!({
            "input": {
                "collection": "users",
                "connectionId": CONNECTION_ID,
                "database": "nexora_test"
            }
        }),
        "not_found",
    );

    for (command, input) in [
        (
            "find_mongodb",
            json!({
                "collection": "users",
                "connectionId": CONNECTION_ID,
                "database": "nexora_test",
                "filter": "{}",
                "limit": 20,
                "projection": null,
                "sort": null
            }),
        ),
        (
            "insert_mongodb_document",
            json!({
                "collection": "users",
                "connectionId": CONNECTION_ID,
                "database": "nexora_test",
                "document": "{\"name\":\"Nexora\"}"
            }),
        ),
        (
            "update_mongodb_document",
            json!({
                "collection": "users",
                "connectionId": CONNECTION_ID,
                "database": "nexora_test",
                "filter": "{\"name\":\"Nexora\"}",
                "update": "{\"$set\":{\"active\":true}}"
            }),
        ),
        (
            "delete_mongodb_document",
            json!({
                "collection": "users",
                "connectionId": CONNECTION_ID,
                "database": "nexora_test",
                "filter": "{\"name\":\"Nexora\"}"
            }),
        ),
    ] {
        app.error(command, json!({ "input": input }), "not_found");
    }

    app.error(
        "find_mongodb",
        json!({
            "input": {
                "collection": "system.sessions",
                "connectionId": CONNECTION_ID,
                "database": "config",
                "filter": "{}",
                "limit": 20,
                "projection": null,
                "sort": null
            }
        }),
        "validation_error",
    );
}

#[test]
fn postgresql_commands_and_csv_export_round_trip_through_tauri_ipc() {
    let app = TestApp::new();
    app.error(
        "inspect_postgresql",
        json!({ "connectionId": CONNECTION_ID }),
        "not_found",
    );
    app.error(
        "execute_postgresql",
        json!({
            "allowWrite": false,
            "connectionId": CONNECTION_ID,
            "rowLimit": 20,
            "sql": ""
        }),
        "validation_error",
    );
    app.error(
        "execute_postgresql",
        json!({
            "allowWrite": false,
            "connectionId": CONNECTION_ID,
            "rowLimit": 20,
            "sql": "SELECT 1"
        }),
        "not_found",
    );

    let directory = TempDirectory::new("ipc-csv");
    let path = directory.path().join("resultado.csv");
    app.ok(
        "export_postgresql_csv",
        json!({
            "input": {
                "columns": ["name", "formula", "metadata"],
                "path": path.to_string_lossy(),
                "rows": [{
                    "formula": "=1+1",
                    "metadata": { "local": true },
                    "name": "Nexora"
                }]
            }
        }),
    );
    let csv = std::fs::read_to_string(path).unwrap();
    assert!(csv.starts_with('\u{feff}'));
    assert!(csv.contains("Nexora,'=1+1"));
    assert!(csv.contains("\"{\"\"local\"\":true}\""));
}

#[test]
fn database_commands_reject_malformed_ipc_payloads() {
    let app = TestApp::new();
    let error = app
        .invoke("find_mongodb", json!({ "input": Value::Null }))
        .unwrap_err();
    assert!(error.is_string() || error.is_object());
}

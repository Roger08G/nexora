mod common;

use common::{TempDirectory, TestApp};
use serde_json::json;

#[test]
fn project_requests_history_and_monitors_round_trip_through_tauri_ipc() {
    let app = TestApp::new();
    let project = TempDirectory::new("ipc-project");
    let root = project.string();

    let created = app.ok(
        "create_project",
        json!({ "name": "Backend QA", "root": root }),
    );
    assert_eq!(created["name"], "Backend QA");
    assert_eq!(created["schemaVersion"], 2);

    let folders = app.ok("list_request_folders", json!({ "projectRoot": root }));
    assert_eq!(folders.as_array().unwrap().len(), 1);
    assert_eq!(folders[0]["id"], "general");

    let folder = app.ok(
        "create_request_folder",
        json!({ "name": "Usuarios", "projectRoot": root }),
    );
    let folder_id = folder["id"].as_str().unwrap();
    let request = json!({
        "body": "{\n    \"enabled\": true\n}",
        "collectionId": folder_id,
        "collectionName": "Usuarios",
        "headers": [{
            "enabled": true,
            "id": "authorization",
            "key": "Authorization",
            "value": "Bearer {{token}}"
        }],
        "id": "request-users",
        "method": "get",
        "name": "Listar usuarios",
        "params": [{
            "enabled": true,
            "id": "limit",
            "key": "limit",
            "value": "20"
        }],
        "url": "{{baseUrl}}/users"
    });
    let saved = app.ok(
        "save_request",
        json!({ "projectRoot": root, "request": request }),
    );
    assert_eq!(saved["method"], "GET");
    assert_eq!(saved["collectionName"], "Usuarios");

    let requests = app.ok("list_requests", json!({ "projectRoot": root }));
    assert_eq!(requests.as_array().unwrap().len(), 1);
    let opened = app.ok("open_project", json!({ "root": root }));
    assert_eq!(opened["requestCount"], 1);

    app.error(
        "save_request",
        json!({
            "projectRoot": root,
            "request": {
                "body": "",
                "collectionId": folder_id,
                "collectionName": "Usuarios",
                "headers": [{
                    "enabled": true,
                    "id": "secret",
                    "key": "Authorization",
                    "value": "Bearer secreto-plano"
                }],
                "id": "request-secret",
                "method": "GET",
                "name": "No persistir secretos",
                "params": [],
                "url": "http://127.0.0.1/users"
            }
        }),
        "validation_error",
    );

    let history = app.ok(
        "append_history",
        json!({
            "entry": {
                "durationMs": 14,
                "error": null,
                "method": "GET",
                "requestId": "request-users",
                "requestName": "Listar usuarios",
                "sizeBytes": 42,
                "source": "api",
                "status": 200,
                "statusText": "OK",
                "url": "http://usuario:clave@127.0.0.1/users?token=secreto"
            },
            "projectRoot": root
        }),
    );
    assert_eq!(history["url"], "http://127.0.0.1/users");
    let history_id = history["id"].as_str().unwrap();
    assert_eq!(
        app.ok("list_history", json!({ "projectRoot": root }))
            .as_array()
            .unwrap()
            .len(),
        1
    );
    app.ok(
        "delete_history_entry",
        json!({ "entryId": history_id, "projectRoot": root }),
    );
    app.ok("clear_history", json!({ "projectRoot": root }));

    let monitor = app.ok(
        "save_monitor",
        json!({
            "monitor": {
                "createdAtMs": 0,
                "enabled": true,
                "id": "monitor-users",
                "intervalSeconds": 10,
                "name": "Salud de usuarios",
                "requestId": "request-users",
                "requestName": "Listar usuarios",
                "updatedAtMs": 0
            },
            "projectRoot": root
        }),
    );
    assert!(monitor["createdAtMs"].as_u64().unwrap() > 0);
    assert_eq!(
        app.ok("list_monitors", json!({ "projectRoot": root }))
            .as_array()
            .unwrap()
            .len(),
        1
    );
    app.ok(
        "delete_monitor",
        json!({ "monitorId": "monitor-users", "projectRoot": root }),
    );

    app.ok(
        "delete_request",
        json!({
            "collectionId": folder_id,
            "projectRoot": root,
            "requestId": "request-users"
        }),
    );
    assert!(app
        .ok("list_requests", json!({ "projectRoot": root }))
        .as_array()
        .unwrap()
        .is_empty());
}

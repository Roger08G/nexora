mod common;

use common::{TempDirectory, TestApp};
use serde_json::{json, Value};

fn start_postgresql(app: &TestApp, project: &TempDirectory) -> Value {
    app.invoke(
        "start_managed_postgresql",
        json!({ "projectRoot": project.string() }),
    )
    .unwrap_or_else(|error| {
        use std::io::{Read, Seek, SeekFrom};

        // Only startup diagnostics from this empty, disposable test project;
        // never enumerate host paths, environment values or keyring secrets.
        let path = project
            .path()
            .join(".nexora/runtime/postgresql/logs/postgresql.log");
        let diagnostic = (|| -> std::io::Result<String> {
            let mut file = std::fs::File::open(path)?;
            let length = file.metadata()?.len().min(4096);
            file.seek(SeekFrom::End(-(length as i64)))?;
            let mut bytes = Vec::new();
            file.take(length).read_to_end(&mut bytes)?;
            Ok(String::from_utf8_lossy(&bytes).into_owned())
        })();
        panic!("start_managed_postgresql: {error}; test startup log (max 4 KiB): {diagnostic:?}");
    })
}

struct CredentialCleanup {
    project_id: String,
    service: &'static str,
}

impl CredentialCleanup {
    fn new(project: &TempDirectory, service: &'static str) -> Self {
        let manifest: Value = serde_json::from_slice(
            &std::fs::read(project.path().join(".nexora/project.json")).unwrap(),
        )
        .unwrap();
        Self {
            project_id: manifest["id"].as_str().unwrap().into(),
            service,
        }
    }
}

impl Drop for CredentialCleanup {
    fn drop(&mut self) {
        if let Ok(entry) = keyring::Entry::new(self.service, &self.project_id) {
            let _ = entry.delete_credential();
        }
    }
}

#[test]
#[ignore = "requires the bundled MongoDB runtime and Windows Credential Manager"]
fn managed_mongodb_crud_runs_end_to_end_through_tauri_ipc() {
    let app = TestApp::new();
    let project = TempDirectory::new("managed-mongodb-ipc");
    let root = project.string();
    app.ok(
        "create_project",
        json!({ "name": "MongoDB IPC E2E", "root": root }),
    );
    let _credential = CredentialCleanup::new(&project, "Nexora Managed MongoDB");

    let connection = app.ok("start_managed_mongodb", json!({ "projectRoot": root }));
    let connection_id = connection["connectionId"].as_str().unwrap();
    assert!(connection["port"].as_u64().unwrap() > 0);
    assert_eq!(app.ok("managed_mongodb_status", json!({}))["active"], true);

    app.ok(
        "create_mongodb_collection",
        json!({
            "input": {
                "collection": "users",
                "connectionId": connection_id,
                "database": "nexora_ipc_e2e"
            }
        }),
    );
    app.ok(
        "insert_mongodb_document",
        json!({
            "input": {
                "collection": "users",
                "connectionId": connection_id,
                "database": "nexora_ipc_e2e",
                "document": "{\"name\":\"Nexora\",\"active\":false}"
            }
        }),
    );
    let found = app.ok(
        "find_mongodb",
        json!({
            "input": {
                "collection": "users",
                "connectionId": connection_id,
                "database": "nexora_ipc_e2e",
                "filter": "{\"name\":\"Nexora\"}",
                "limit": 20,
                "projection": null,
                "sort": null
            }
        }),
    );
    assert_eq!(found["count"], 1);

    let updated = app.ok(
        "update_mongodb_document",
        json!({
            "input": {
                "collection": "users",
                "connectionId": connection_id,
                "database": "nexora_ipc_e2e",
                "filter": "{\"name\":\"Nexora\"}",
                "update": "{\"$set\":{\"active\":true}}"
            }
        }),
    );
    assert_eq!(updated["modifiedCount"], 1);
    assert!(!app
        .ok(
            "list_mongodb_indexes",
            json!({
                "collection": "users",
                "connectionId": connection_id,
                "database": "nexora_ipc_e2e"
            }),
        )
        .as_array()
        .unwrap()
        .is_empty());
    assert!(app
        .ok(
            "list_mongodb_collections",
            json!({ "connectionId": connection_id, "database": "nexora_ipc_e2e" }),
        )
        .as_array()
        .unwrap()
        .iter()
        .any(|collection| collection == "users"));
    assert!(app
        .ok(
            "list_mongodb_databases",
            json!({ "connectionId": connection_id }),
        )
        .as_array()
        .unwrap()
        .iter()
        .any(|database| database == "nexora_ipc_e2e"));

    let deleted = app.ok(
        "delete_mongodb_document",
        json!({
            "input": {
                "collection": "users",
                "connectionId": connection_id,
                "database": "nexora_ipc_e2e",
                "filter": "{\"name\":\"Nexora\"}"
            }
        }),
    );
    assert_eq!(deleted["deletedCount"], 1);
    app.ok("stop_managed_mongodb", json!({}));
    assert_eq!(app.ok("managed_mongodb_status", json!({}))["active"], false);
}

#[test]
#[ignore = "requires the bundled PostgreSQL runtime and Windows Credential Manager"]
fn managed_postgresql_crud_runs_end_to_end_through_tauri_ipc() {
    let app = TestApp::new();
    let project = TempDirectory::new("managed-postgresql-ipc");
    let root = project.string();
    app.ok(
        "create_project",
        json!({ "name": "PostgreSQL IPC E2E", "root": root }),
    );
    let _credential = CredentialCleanup::new(&project, "Nexora Managed PostgreSQL");

    let connection = start_postgresql(&app, &project);
    let connection_id = connection["connectionId"].as_str().unwrap();
    let port = u16::try_from(connection["port"].as_u64().unwrap()).unwrap();
    assert!(port > 0);
    let repeated = start_postgresql(&app, &project);
    assert_eq!(repeated["connectionId"], connection["connectionId"]);
    assert_eq!(repeated["port"], connection["port"]);
    assert_eq!(
        app.ok("managed_postgresql_status", json!({}))["active"],
        true
    );

    let execute = |sql: &str, allow_write: bool| {
        app.ok(
            "execute_postgresql",
            json!({
                "allowWrite": allow_write,
                "connectionId": connection_id,
                "rowLimit": 500,
                "sql": sql
            }),
        )
    };
    let role = execute(
        "SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, \
         rolbypassrls, pg_has_role(current_user, 'nexora_admin', 'MEMBER') AS admin_member \
         FROM pg_roles WHERE rolname = current_user",
        false,
    );
    let role = &role["rows"][0];
    assert_eq!(role["rolcanlogin"], true);
    for capability in [
        "rolinherit",
        "rolsuper",
        "rolcreatedb",
        "rolcreaterole",
        "rolreplication",
        "rolbypassrls",
        "admin_member",
    ] {
        assert_eq!(role[capability], false, "el rol conserva {capability}");
    }
    app.error(
        "execute_postgresql",
        json!({
            "allowWrite": true,
            "connectionId": connection_id,
            "rowLimit": 500,
            "sql": "SET ROLE nexora_admin"
        }),
        "postgresql_error",
    );
    execute(
        "CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL, active boolean NOT NULL)",
        true,
    );
    execute(
        "INSERT INTO users VALUES (1, 'Nexora', false), (2, 'Local', true)",
        true,
    );
    app.error(
        "execute_postgresql",
        json!({
            "allowWrite": false,
            "connectionId": connection_id,
            "rowLimit": 500,
            "sql": "UPDATE users SET active = true WHERE id = 1"
        }),
        "validation_error",
    );
    execute("UPDATE users SET active = true WHERE id = 1", true);
    let selected = execute("SELECT id, name, active FROM users ORDER BY id", false);
    let empty = execute("SELECT id, name, active FROM users WHERE false", false);
    assert_eq!(empty["columns"], json!(["id", "name", "active"]));
    assert_eq!(empty["rows"], json!([]));
    let duplicate = execute("SELECT 1 AS id, 2 AS id, 3 AS \"id (2)\"", false);
    assert_eq!(duplicate["columns"], json!(["id", "id (3)", "id (2)"]));
    assert_eq!(
        duplicate["rows"][0],
        json!({ "id": 1, "id (3)": 2, "id (2)": 3 })
    );
    assert_eq!(selected["rows"].as_array().unwrap().len(), 2);
    assert_eq!(selected["rows"][0]["active"], true);

    let database = app.ok(
        "inspect_postgresql",
        json!({ "connectionId": connection_id }),
    );
    assert!(database["schemas"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|schema| schema["tables"].as_array().unwrap())
        .any(|table| table["name"] == "users"));

    let csv_path = project.path().join("users.csv");
    app.ok(
        "export_postgresql_csv",
        json!({
            "input": {
                "columns": selected["columns"],
                "path": csv_path.to_string_lossy(),
                "rows": selected["rows"]
            }
        }),
    );
    assert!(std::fs::read_to_string(csv_path)
        .unwrap()
        .contains("Nexora"));
    assert_eq!(
        execute("DELETE FROM users WHERE id = 2", true)["affectedRows"],
        1
    );

    app.ok("stop_managed_postgresql", json!({}));
    app.ok("stop_managed_postgresql", json!({}));
    assert!(std::net::TcpStream::connect(("127.0.0.1", port)).is_err());
    assert_eq!(
        app.ok("managed_postgresql_status", json!({}))["active"],
        false
    );

    let restarted = start_postgresql(&app, &project);
    let persisted = app.ok(
        "execute_postgresql",
        json!({
            "allowWrite": false,
            "connectionId": restarted["connectionId"],
            "rowLimit": 500,
            "sql": "SELECT name FROM users ORDER BY id"
        }),
    );
    assert_eq!(persisted["rows"], json!([{ "name": "Nexora" }]));
    app.ok("stop_managed_postgresql", json!({}));
    let restarted_port = u16::try_from(restarted["port"].as_u64().unwrap()).unwrap();
    assert!(std::net::TcpStream::connect(("127.0.0.1", restarted_port)).is_err());

    let data = project.path().join(".nexora/runtime/postgresql/data");
    std::fs::write(
        data.join("postgresql.auto.conf"),
        "nexora_deliberately_invalid_setting = 'startup-failure-fixture'\n",
    )
    .unwrap();
    let failed = app.error(
        "start_managed_postgresql",
        json!({ "projectRoot": root }),
        "internal_error",
    );
    assert!(failed["message"].as_str().unwrap().contains("FATAL:"));
    assert_eq!(
        app.ok("managed_postgresql_status", json!({}))["active"],
        false
    );
    assert!(!data.join("postmaster.pid").exists());
}

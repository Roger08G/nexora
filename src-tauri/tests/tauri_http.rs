mod common;

use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};

use common::TestApp;
use serde_json::json;

#[test]
fn executes_http_with_templates_headers_and_query_through_tauri_ipc() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("servidor HTTP efímero");
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut bytes = [0_u8; 8_192];
        let read = stream.read(&mut bytes).unwrap();
        let request = String::from_utf8_lossy(&bytes[..read]);
        assert!(request.starts_with("POST /users?limit=20 HTTP/1.1"));
        assert!(request
            .to_ascii_lowercase()
            .contains("x-nexora-token: local"));
        assert!(request.ends_with(r#"{"name":"Nexora"}"#));
        stream
            .write_all(
                b"HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nX-Test: ipc\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}",
            )
            .unwrap();
    });

    let app = TestApp::new();
    let response = app.ok(
        "execute_http",
        json!({
            "request": {
                "body": "{\"name\":\"{{name}}\"}",
                "headers": [{
                    "enabled": true,
                    "id": "token",
                    "key": "X-Nexora-Token",
                    "value": "{{token}}"
                }],
                "method": "POST",
                "params": [{
                    "enabled": true,
                    "id": "limit",
                    "key": "limit",
                    "value": "{{limit}}"
                }],
                "timeoutMs": 5_000,
                "url": "{{baseUrl}}/users",
                "variables": {
                    "baseUrl": format!("http://{address}"),
                    "limit": "20",
                    "name": "Nexora",
                    "token": "local"
                }
            }
        }),
    );
    server.join().unwrap();

    assert_eq!(response["status"], 201);
    assert_eq!(response["body"], r#"{"ok":true}"#);
    assert_eq!(response["sizeBytes"], 11);
    assert!(response["durationMs"].as_u64().is_some());
    assert!(response["headers"]
        .as_array()
        .unwrap()
        .iter()
        .any(|header| header["key"] == "x-test" && header["value"] == "ipc"));
}

#[test]
fn rejects_unsafe_protocols_and_unresolved_variables_through_tauri_ipc() {
    let app = TestApp::new();
    let request = |url: &str| {
        json!({
            "request": {
                "body": "",
                "headers": [],
                "method": "GET",
                "params": [],
                "timeoutMs": 1_000,
                "url": url,
                "variables": {}
            }
        })
    };

    app.error(
        "execute_http",
        request("file:///C:/Windows/win.ini"),
        "validation_error",
    );
    app.error(
        "execute_http",
        request("http://127.0.0.1/{{missing}}"),
        "validation_error",
    );
}

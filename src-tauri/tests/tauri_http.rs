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

#[test]
fn does_not_forward_api_keys_or_bodies_to_a_redirected_origin() {
    let origin = TcpListener::bind("127.0.0.1:0").unwrap();
    let origin_address = origin.local_addr().unwrap();
    let destination = TcpListener::bind("127.0.0.1:0").unwrap();
    let destination_address = destination.local_addr().unwrap();
    destination.set_nonblocking(true).unwrap();
    let server = thread::spawn(move || {
        let (mut stream, _) = origin.accept().unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut request = [0_u8; 8_192];
        assert!(stream.read(&mut request).unwrap() > 0);
        write!(
            stream,
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{destination_address}/sink\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        ).unwrap();
    });

    let response = TestApp::new().ok("execute_http", json!({
        "request": {
            "method": "POST",
            "url": format!("http://{origin_address}/redirect"),
            "headers": [{ "id": "key", "enabled": true, "key": "X-Api-Key", "value": "session-secret" }],
            "body": "{\"secret\":\"session-body\"}",
            "timeoutMs": 1_000
        }
    }));
    server.join().unwrap();
    assert_eq!(response["status"], 307);
    assert_eq!(
        destination.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
}

#[test]
fn follows_same_origin_redirects_and_preserves_duplicate_response_headers() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut bytes = [0_u8; 8_192];
            let count = stream.read(&mut bytes).unwrap();
            let request = String::from_utf8_lossy(&bytes[..count]);
            if index == 0 {
                stream.write_all(b"HTTP/1.1 302 Found\r\nLocation: /final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
            } else {
                assert!(request.starts_with("GET /final HTTP/1.1"));
                assert!(request
                    .to_ascii_lowercase()
                    .contains("x-api-key: local-secret"));
                stream.write_all(b"HTTP/1.1 200 OK\r\nSet-Cookie: first=1\r\nSet-Cookie: second=2\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK").unwrap();
            }
        }
    });
    let response = TestApp::new().ok("execute_http", json!({
        "request": {
            "method": "GET", "url": format!("http://{address}/redirect"), "timeoutMs": 1_000,
            "headers": [{ "id": "key", "enabled": true, "key": "X-Api-Key", "value": "local-secret" }]
        }
    }));
    server.join().unwrap();
    assert_eq!(response["status"], 200);
    assert_eq!(
        response["headers"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|header| header["key"] == "set-cookie")
            .count(),
        2
    );
}

#[test]
fn bounds_resolved_url_and_total_header_expansion_before_network_access() {
    let app = TestApp::new();
    app.error(
        "execute_http",
        json!({
            "request": {
                "method": "GET", "url": "http://127.0.0.1:1/{{path}}",
                "variables": { "path": "x".repeat(8_192) }
            }
        }),
        "validation_error",
    );
    app.error(
        "execute_http",
        json!({
            "request": {
                "method": "GET", "url": "http://127.0.0.1:1/",
                "params": [{ "id": "query", "enabled": true, "key": "q", "value": "{{query}}" }],
                "variables": { "query": "/".repeat(3_000) }
            }
        }),
        "validation_error",
    );
    let headers = (0..9).map(|index| json!({
        "id": format!("h-{index}"), "enabled": true, "key": format!("X-{index}"), "value": "{{large}}"
    })).collect::<Vec<_>>();
    app.error(
        "execute_http",
        json!({
            "request": {
                "method": "GET", "url": "http://127.0.0.1:1/", "headers": headers,
                "variables": { "large": "x".repeat(1024 * 1024) }
            }
        }),
        "validation_error",
    );
}

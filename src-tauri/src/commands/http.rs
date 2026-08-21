use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use reqwest::{header::HeaderMap, Method, Url};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::projects::KeyValueItem,
    error::{AppError, CommandResult},
    state::AppState,
};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_TIMEOUT_MS: u64 = 120_000;
const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestInput {
    method: String,
    url: String,
    #[serde(default)]
    params: Vec<KeyValueItem>,
    #[serde(default)]
    headers: Vec<KeyValueItem>,
    #[serde(default)]
    body: String,
    timeout_ms: Option<u64>,
    #[serde(default)]
    variables: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseOutput {
    status: u16,
    status_text: String,
    headers: Vec<ResponseHeader>,
    body: String,
    duration_ms: u64,
    size_bytes: usize,
}

#[derive(Debug, Serialize)]
pub struct ResponseHeader {
    key: String,
    value: String,
}

#[tauri::command]
pub async fn execute_http(
    state: State<'_, AppState>,
    request: HttpRequestInput,
) -> CommandResult<HttpResponseOutput> {
    execute(&state.http, request).await.map_err(Into::into)
}

async fn execute(
    client: &reqwest::Client,
    request: HttpRequestInput,
) -> Result<HttpResponseOutput, AppError> {
    let method = Method::from_bytes(request.method.trim().as_bytes())
        .map_err(|_| AppError::Validation("Método HTTP no válido".into()))?;
    let resolved_url = resolve_template(request.url.trim(), &request.variables)?;
    let mut url = Url::parse(&resolved_url)
        .map_err(|error| AppError::Validation(format!("URL no válida: {error}")))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::Validation(
            "Nexora solo ejecuta URLs HTTP o HTTPS".into(),
        ));
    }

    {
        let mut query = url.query_pairs_mut();
        for parameter in request.params.iter().filter(|item| item.enabled) {
            let key = parameter.key.trim();
            if !key.is_empty() {
                query.append_pair(
                    &resolve_template(key, &request.variables)?,
                    &resolve_template(&parameter.value, &request.variables)?,
                );
            }
        }
    }

    let mut builder = client.request(method, url);
    for header in request.headers.iter().filter(|item| item.enabled) {
        let key = header.key.trim();
        if key.is_empty() {
            continue;
        }
        let resolved_key = resolve_template(key, &request.variables)?;
        let name = reqwest::header::HeaderName::from_bytes(resolved_key.as_bytes())
            .map_err(|_| AppError::Validation(format!("Header no válido: {resolved_key}")))?;
        let resolved_value = resolve_template(&header.value, &request.variables)?;
        let value = reqwest::header::HeaderValue::from_str(&resolved_value)
            .map_err(|_| AppError::Validation(format!("Valor no válido para el header {key}")))?;
        builder = builder.header(name, value);
    }

    if !request.body.is_empty() {
        builder = builder.body(resolve_template(&request.body, &request.variables)?);
    }
    let timeout_ms = request
        .timeout_ms
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(1_000, MAX_TIMEOUT_MS);
    builder = builder.timeout(Duration::from_millis(timeout_ms));

    let started = Instant::now();
    let mut response = builder.send().await?;
    let status = response.status();
    let headers = serialize_headers(response.headers());
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(AppError::Validation(format!(
                "La respuesta supera el límite de {} MiB",
                MAX_RESPONSE_BYTES / 1024 / 1024
            )));
        }
        bytes.extend_from_slice(&chunk);
    }

    Ok(HttpResponseOutput {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or_default().to_owned(),
        headers,
        body: String::from_utf8_lossy(&bytes).into_owned(),
        duration_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
        size_bytes: bytes.len(),
    })
}

fn serialize_headers(headers: &HeaderMap) -> Vec<ResponseHeader> {
    headers
        .iter()
        .map(|(key, value)| ResponseHeader {
            key: key.to_string(),
            value: value.to_str().unwrap_or("<valor binario>").to_owned(),
        })
        .collect()
}

fn resolve_template(value: &str, variables: &HashMap<String, String>) -> Result<String, AppError> {
    let mut output = String::with_capacity(value.len());
    let mut remaining = value;
    while let Some(start) = remaining.find("{{") {
        output.push_str(&remaining[..start]);
        let after_start = &remaining[start + 2..];
        let Some(end) = after_start.find("}}") else {
            return Err(AppError::Validation("Variable sin cierre }}".into()));
        };
        let name = after_start[..end].trim();
        if name.is_empty() {
            return Err(AppError::Validation("Nombre de variable vacío".into()));
        }
        let replacement = variables.get(name).ok_or_else(|| {
            AppError::Validation(format!(
                "La variable {{{{{name}}}}} no tiene valor de sesión"
            ))
        })?;
        output.push_str(replacement);
        remaining = &after_start[end + 2..];
    }
    output.push_str(remaining);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    use super::{execute, HttpRequestInput};

    #[test]
    fn rejects_non_http_protocols_before_network_access() {
        let runtime = tauri::async_runtime::TokioRuntime::new().expect("runtime");
        runtime.block_on(async {
            let client = reqwest::Client::new();
            let result = execute(
                &client,
                HttpRequestInput {
                    method: "GET".into(),
                    url: "file:///C:/Windows/win.ini".into(),
                    params: vec![],
                    headers: vec![],
                    body: String::new(),
                    timeout_ms: None,
                    variables: HashMap::new(),
                },
            )
            .await;
            assert!(result.is_err());
        });
    }

    #[test]
    fn resolves_session_variables_without_persisting_them() {
        let variables = HashMap::from([
            ("baseUrl".into(), "http://localhost:3000".into()),
            ("token".into(), "secret-value".into()),
        ]);
        assert_eq!(
            super::resolve_template("{{baseUrl}}/users", &variables).unwrap(),
            "http://localhost:3000/users"
        );
        assert_eq!(
            super::resolve_template("{{ baseUrl }}/{{token}}/{{token}}", &variables).unwrap(),
            "http://localhost:3000/secret-value/secret-value"
        );
        assert!(super::resolve_template("Bearer {{missing}}", &variables).is_err());
        assert!(super::resolve_template("{{}}", &variables).is_err());
        assert!(super::resolve_template("{{token", &variables).is_err());
    }

    #[test]
    fn executes_a_real_local_http_request() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1_024];
            let bytes = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..bytes]);
            assert!(request.starts_with("GET /health?verbose=true HTTP/1.1"));
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}",
                )
                .unwrap();
        });

        let runtime = tauri::async_runtime::TokioRuntime::new().expect("runtime");
        let response = runtime.block_on(async {
            execute(
                &reqwest::Client::new(),
                HttpRequestInput {
                    method: "GET".into(),
                    url: "{{server}}/health".into(),
                    params: vec![crate::commands::projects::KeyValueItem {
                        id: "verbose".into(),
                        enabled: true,
                        key: "verbose".into(),
                        value: "true".into(),
                    }],
                    headers: vec![],
                    body: String::new(),
                    timeout_ms: Some(5_000),
                    variables: HashMap::from([("server".into(), format!("http://{address}"))]),
                },
            )
            .await
            .unwrap()
        });
        server.join().unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.body, r#"{"ok":true}"#);
    }

    #[test]
    fn resolves_variables_in_url_query_headers_and_body() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 4_096];
            let bytes = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..bytes]);
            assert!(request.starts_with("POST /users?active=true HTTP/1.1"));
            assert!(request
                .to_ascii_lowercase()
                .contains("x-nexora-token: local-secret"));
            assert!(request.ends_with(r#"{"name":"Roger"}"#));
            stream
                .write_all(
                    b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .unwrap();
        });

        let runtime = tauri::async_runtime::TokioRuntime::new().expect("runtime");
        let response = runtime.block_on(async {
            execute(
                &reqwest::Client::new(),
                HttpRequestInput {
                    method: "POST".into(),
                    url: "{{server}}/{{resource}}".into(),
                    params: vec![crate::commands::projects::KeyValueItem {
                        id: "active".into(),
                        enabled: true,
                        key: "{{queryName}}".into(),
                        value: "{{queryValue}}".into(),
                    }],
                    headers: vec![crate::commands::projects::KeyValueItem {
                        id: "token".into(),
                        enabled: true,
                        key: "X-{{headerName}}-Token".into(),
                        value: "{{token}}".into(),
                    }],
                    body: r#"{"name":"{{name}}"}"#.into(),
                    timeout_ms: Some(5_000),
                    variables: HashMap::from([
                        ("server".into(), format!("http://{address}")),
                        ("resource".into(), "users".into()),
                        ("queryName".into(), "active".into()),
                        ("queryValue".into(), "true".into()),
                        ("headerName".into(), "Nexora".into()),
                        ("token".into(), "local-secret".into()),
                        ("name".into(), "Roger".into()),
                    ]),
                },
            )
            .await
            .unwrap()
        });
        server.join().unwrap();
        assert_eq!(response.status, 204);
    }

    #[test]
    #[ignore = "requires the temporary Nexora TypeScript QA API"]
    fn exercises_external_typescript_api_end_to_end() {
        let base_url = std::env::var("NEXORA_E2E_BASE_URL").expect("NEXORA_E2E_BASE_URL");
        let pass = std::env::var("NEXORA_E2E_PASS").unwrap_or_else(|_| "manual".into());
        let runtime = tauri::async_runtime::TokioRuntime::new().expect("runtime");

        runtime.block_on(async {
            let expected_statuses = [
                ("GET", 200),
                ("POST", 201),
                ("PUT", 200),
                ("PATCH", 200),
                ("DELETE", 200),
                ("HEAD", 200),
                ("OPTIONS", 204),
            ];

            for (method, expected_status) in expected_statuses {
                let body = if matches!(method, "POST" | "PUT" | "PATCH") {
                    r#"{"pass":"{{pass}}","method":"{{methodPath}}"}"#.into()
                } else {
                    String::new()
                };
                let response = execute(
                    &reqwest::Client::new(),
                    qa_request(
                        method,
                        "{{baseUrl}}/method/{{methodPath}}",
                        body,
                        HashMap::from([
                            ("baseUrl".into(), base_url.clone()),
                            ("delay".into(), "30".into()),
                            ("headerName".into(), "Nexora-QA".into()),
                            ("headerValue".into(), format!("qa-header-{pass}")),
                            ("methodPath".into(), method.into()),
                            ("pass".into(), pass.clone()),
                            ("queryName".into(), "qa".into()),
                        ]),
                    ),
                )
                .await
                .unwrap_or_else(|error| panic!("{method} failed: {error}"));

                assert_eq!(response.status, expected_status, "{method} status");
                assert!(response.duration_ms >= 20, "{method} duration too short");
                assert!(response.duration_ms < 5_000, "{method} duration too long");
                assert_eq!(response_header(&response, "x-nexora-method"), Some(method));
                assert_eq!(
                    response_header(&response, "x-nexora-pass"),
                    Some(pass.as_str())
                );
                assert_eq!(
                    response_header(&response, "x-nexora-query-value"),
                    Some(pass.as_str())
                );
                assert_eq!(
                    response_header(&response, "x-nexora-request-header"),
                    Some(format!("qa-header-{pass}").as_str())
                );
                assert!(response_header(&response, "allow").is_some());

                if matches!(method, "HEAD" | "OPTIONS") {
                    assert_eq!(response.size_bytes, 0, "{method} response body");
                } else {
                    let json: serde_json::Value =
                        serde_json::from_str(&response.body).expect("JSON method response");
                    assert_eq!(json["method"], method);
                    assert_eq!(json["pass"], pass);
                    assert_eq!(json["query"], pass);
                    assert_eq!(json["header"], format!("qa-header-{pass}"));
                    if matches!(method, "POST" | "PUT" | "PATCH") {
                        assert_eq!(json["body"]["pass"], pass);
                        assert_eq!(json["body"]["method"], method);
                    }
                }
            }

            let item_id = format!("item-{pass}");
            let created = execute(
                &reqwest::Client::new(),
                qa_request(
                    "POST",
                    "{{baseUrl}}/items",
                    r#"{"id":"{{itemId}}","name":"created","pass":"{{pass}}"}"#.into(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("create item");
            assert_eq!(created.status, 201);
            assert_eq!(
                response_header(&created, "location"),
                Some(format!("/items/{item_id}").as_str())
            );

            let fetched = execute(
                &reqwest::Client::new(),
                qa_request(
                    "GET",
                    "{{baseUrl}}/items/{{itemId}}",
                    String::new(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("fetch item");
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&fetched.body).unwrap()["name"],
                "created"
            );

            let replaced = execute(
                &reqwest::Client::new(),
                qa_request(
                    "PUT",
                    "{{baseUrl}}/items/{{itemId}}",
                    r#"{"name":"replaced","pass":"{{pass}}"}"#.into(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("replace item");
            let replaced: serde_json::Value = serde_json::from_str(&replaced.body).unwrap();
            assert_eq!(replaced["name"], "replaced");
            assert_eq!(replaced["version"], 2);

            let patched = execute(
                &reqwest::Client::new(),
                qa_request(
                    "PATCH",
                    "{{baseUrl}}/items/{{itemId}}",
                    r#"{"name":"patched"}"#.into(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("patch item");
            let patched: serde_json::Value = serde_json::from_str(&patched.body).unwrap();
            assert_eq!(patched["name"], "patched");
            assert_eq!(patched["version"], 3);

            let head = execute(
                &reqwest::Client::new(),
                qa_request(
                    "HEAD",
                    "{{baseUrl}}/items/{{itemId}}",
                    String::new(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("head item");
            assert_eq!(head.status, 200);
            assert_eq!(head.size_bytes, 0);

            let deleted = execute(
                &reqwest::Client::new(),
                qa_request(
                    "DELETE",
                    "{{baseUrl}}/items/{{itemId}}",
                    String::new(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("delete item");
            assert_eq!(deleted.status, 204);

            let missing = execute(
                &reqwest::Client::new(),
                qa_request(
                    "GET",
                    "{{baseUrl}}/items/{{itemId}}",
                    String::new(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("missing item response");
            assert_eq!(missing.status, 404);

            let teapot = execute(
                &reqwest::Client::new(),
                qa_request(
                    "GET",
                    "{{baseUrl}}/status/418",
                    String::new(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("teapot response");
            assert_eq!(teapot.status, 418);
            assert_eq!(teapot.status_text, "I'm a teapot");

            let redirected = execute(
                &reqwest::Client::new(),
                qa_request(
                    "GET",
                    "{{baseUrl}}/redirect",
                    String::new(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await
            .expect("redirect response");
            assert_eq!(redirected.status, 200);

            let timed_out = execute(
                &reqwest::Client::new(),
                HttpRequestInput {
                    timeout_ms: Some(1_000),
                    ..qa_request(
                        "GET",
                        "{{baseUrl}}/slow/1250",
                        String::new(),
                        qa_variables(&base_url, &pass, &item_id),
                    )
                },
            )
            .await;
            assert!(timed_out.is_err(), "slow request should time out");

            let oversized = execute(
                &reqwest::Client::new(),
                qa_request(
                    "GET",
                    "{{baseUrl}}/large/10486784",
                    String::new(),
                    qa_variables(&base_url, &pass, &item_id),
                ),
            )
            .await;
            assert!(oversized.is_err(), "oversized response should be rejected");

            let unresolved = execute(
                &reqwest::Client::new(),
                qa_request(
                    "GET",
                    "{{missingBaseUrl}}/health",
                    String::new(),
                    HashMap::new(),
                ),
            )
            .await;
            assert!(unresolved.is_err(), "missing variables should be rejected");
        });
    }

    fn qa_request(
        method: &str,
        url: &str,
        body: String,
        variables: HashMap<String, String>,
    ) -> HttpRequestInput {
        HttpRequestInput {
            method: method.into(),
            url: url.into(),
            params: vec![
                crate::commands::projects::KeyValueItem {
                    id: "pass".into(),
                    enabled: true,
                    key: "pass".into(),
                    value: "{{pass}}".into(),
                },
                crate::commands::projects::KeyValueItem {
                    id: "qa".into(),
                    enabled: true,
                    key: "{{queryName}}".into(),
                    value: "{{pass}}".into(),
                },
                crate::commands::projects::KeyValueItem {
                    id: "delay".into(),
                    enabled: true,
                    key: "delay".into(),
                    value: "{{delay}}".into(),
                },
            ],
            headers: vec![
                crate::commands::projects::KeyValueItem {
                    id: "content-type".into(),
                    enabled: true,
                    key: "Content-Type".into(),
                    value: "application/json".into(),
                },
                crate::commands::projects::KeyValueItem {
                    id: "qa-header".into(),
                    enabled: true,
                    key: "X-{{headerName}}".into(),
                    value: "{{headerValue}}".into(),
                },
            ],
            body,
            timeout_ms: Some(5_000),
            variables,
        }
    }

    fn qa_variables(base_url: &str, pass: &str, item_id: &str) -> HashMap<String, String> {
        HashMap::from([
            ("baseUrl".into(), base_url.into()),
            ("delay".into(), "0".into()),
            ("headerName".into(), "Nexora-QA".into()),
            ("headerValue".into(), format!("qa-header-{pass}")),
            ("itemId".into(), item_id.into()),
            ("pass".into(), pass.into()),
            ("queryName".into(), "qa".into()),
        ])
    }

    fn response_header<'a>(response: &'a super::HttpResponseOutput, name: &str) -> Option<&'a str> {
        response
            .headers
            .iter()
            .find(|header| header.key.eq_ignore_ascii_case(name))
            .map(|header| header.value.as_str())
    }
}

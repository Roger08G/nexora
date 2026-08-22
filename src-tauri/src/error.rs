use serde::Serialize;
use thiserror::Error;

use crate::limits::MAX_COMMAND_ERROR_CHARS;

pub type CommandResult<T> = Result<T, CommandError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Serialization(#[from] serde_json::Error),
    #[error("{0}")]
    Http(#[from] reqwest::Error),
    #[error("{0}")]
    Mongo(#[from] mongodb::error::Error),
    #[error("{0}")]
    Postgres(#[from] tokio_postgres::Error),
    #[error("{0}")]
    Credential(String),
    #[error("{0}")]
    Internal(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(error: AppError) -> Self {
        let (code, message) = match error {
            AppError::Validation(message) => ("validation_error", message),
            AppError::NotFound(message) => ("not_found", message),
            AppError::Conflict(message) => ("conflict", message),
            AppError::Io(error) => ("io_error", error.to_string()),
            AppError::Serialization(error) => ("serialization_error", error.to_string()),
            AppError::Http(error) => ("http_error", public_http_error(&error)),
            AppError::Mongo(error) => ("mongodb_error", public_mongodb_error(&error)),
            AppError::Postgres(error) => ("postgresql_error", public_postgresql_error(&error)),
            AppError::Credential(message) => ("credential_error", message),
            AppError::Internal(message) => ("internal_error", message),
        };

        Self {
            code,
            message: sanitize_message(&message),
        }
    }
}

fn public_mongodb_error(error: &mongodb::error::Error) -> String {
    let message = error.to_string().to_ascii_lowercase();
    if message.contains("duplicate key") || message.contains("e11000") {
        "MongoDB rechazó la escritura porque ya existe una clave única".into()
    } else if message.contains("unauthorized") || message.contains("error code 13") {
        "MongoDB rechazó la operación porque la conexión no tiene permisos".into()
    } else if message.contains("timed out") || message.contains("server selection") {
        "MongoDB no respondió dentro del tiempo permitido".into()
    } else {
        "MongoDB no pudo completar la operación".into()
    }
}

fn public_postgresql_error(error: &tokio_postgres::Error) -> String {
    let Some(database_error) = error.as_db_error() else {
        return "PostgreSQL no pudo completar la operación".into();
    };
    use tokio_postgres::error::SqlState;
    match *database_error.code() {
        SqlState::UNIQUE_VIOLATION => {
            "PostgreSQL rechazó la escritura porque ya existe una clave única".into()
        }
        SqlState::FOREIGN_KEY_VIOLATION => {
            "PostgreSQL rechazó la escritura por una referencia inexistente".into()
        }
        SqlState::INSUFFICIENT_PRIVILEGE => {
            "PostgreSQL rechazó la operación por falta de permisos".into()
        }
        SqlState::QUERY_CANCELED => "PostgreSQL canceló la consulta por tiempo o petición".into(),
        _ => format!(
            "PostgreSQL rechazó la operación (SQLSTATE {})",
            database_error.code().code()
        ),
    }
}

fn public_http_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "La petición HTTP superó el tiempo de espera".into()
    } else if error.is_connect() {
        "No se pudo conectar con el servidor HTTP".into()
    } else if error.is_redirect() {
        "La petición HTTP superó el límite de redirecciones".into()
    } else if error.is_body() || error.is_decode() {
        "No se pudo leer la respuesta HTTP".into()
    } else {
        "No se pudo completar la petición HTTP".into()
    }
}

fn sanitize_message(message: &str) -> String {
    let message = redact_uri_credentials(message);
    let normalized = message.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut output = normalized
        .chars()
        .take(MAX_COMMAND_ERROR_CHARS)
        .collect::<String>();
    if normalized.chars().count() > MAX_COMMAND_ERROR_CHARS {
        output.push('…');
    }
    output
}

fn redact_uri_credentials(message: &str) -> String {
    const SCHEMES: [&str; 6] = [
        "mongodb+srv://",
        "mongodb://",
        "postgresql://",
        "postgres://",
        "https://",
        "http://",
    ];
    let mut output = message.to_owned();
    for scheme in SCHEMES {
        let mut search_from = 0;
        while let Some(relative_start) = output[search_from..].find(scheme) {
            let start = search_from + relative_start + scheme.len();
            let endpoint = output[start..]
                .find(|character: char| {
                    character.is_whitespace() || matches!(character, '"' | '\'' | ')' | ']' | '}')
                })
                .map_or(output.len(), |relative_end| start + relative_end);
            let Some(relative_at) = output[start..endpoint].find('@') else {
                search_from = endpoint;
                continue;
            };
            let at = start + relative_at;
            if output[start..at].contains(':') {
                output.replace_range(start..at, "<credenciales>");
                search_from = start + "<credenciales>@".len();
            } else {
                search_from = at + 1;
            }
        }
    }
    output
}

impl From<std::io::Error> for CommandError {
    fn from(error: std::io::Error) -> Self {
        AppError::from(error).into()
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(error: serde_json::Error) -> Self {
        AppError::from(error).into()
    }
}

#[cfg(test)]
mod tests {
    use super::{AppError, CommandError};

    #[test]
    fn redacts_credentials_and_bounds_command_errors() {
        let secret = "mongodb://user:super-secret@127.0.0.1:27017/admin";
        let error: CommandError =
            AppError::Internal(format!("falló {secret} {}", "x".repeat(2_000))).into();

        assert!(!error.message.contains("super-secret"));
        assert!(error.message.contains("mongodb://<credenciales>@127.0.0.1"));
        assert!(error.message.chars().count() <= 801);
    }
}

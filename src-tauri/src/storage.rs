use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

use serde::{de::DeserializeOwned, Serialize};
use uuid::Uuid;

use crate::error::AppError;

pub(crate) fn ensure_directory(path: &Path) -> Result<(), AppError> {
    let mut missing = Vec::new();
    let mut cursor = path;

    while !cursor.exists() {
        missing.push(cursor.to_owned());
        cursor = cursor.parent().ok_or_else(|| {
            AppError::Validation(format!("Ruta de carpeta no válida: {}", path.display()))
        })?;
    }
    let mut existing = Some(cursor);
    while let Some(directory) = existing {
        validate_directory(directory)?;
        existing = directory.parent();
    }

    for directory in missing.iter().rev() {
        fs::create_dir(directory)?;
        validate_directory(directory)?;
    }
    Ok(())
}

pub(crate) fn validate_directory(path: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AppError::Validation(format!(
            "Nexora no admite enlaces ni archivos especiales en {}",
            path.display()
        )));
    }
    Ok(())
}

pub(crate) fn read_json<T: DeserializeOwned>(
    path: &Path,
    max_bytes: usize,
    label: &str,
) -> Result<T, AppError> {
    let bytes = read_limited(path, max_bytes, label)?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub(crate) fn read_bytes(path: &Path, max_bytes: usize, label: &str) -> Result<Vec<u8>, AppError> {
    read_limited(path, max_bytes, label)
}

pub(crate) fn read_text(path: &Path, max_bytes: usize, label: &str) -> Result<String, AppError> {
    let bytes = read_limited(path, max_bytes, label)?;
    String::from_utf8(bytes)
        .map_err(|_| AppError::Validation(format!("{label} no contiene texto UTF-8 válido")))
}

pub(crate) fn read_tail(path: &Path, max_bytes: usize) -> Result<String, AppError> {
    reject_special_file(path)?;
    let mut file = File::open(path)?;
    let length = file.metadata()?.len();
    let offset = length.saturating_sub(max_bytes as u64);
    file.seek(SeekFrom::Start(offset))?;
    let mut bytes = Vec::with_capacity((length - offset) as usize);
    file.take(length - offset).read_to_end(&mut bytes)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub(crate) fn write_json_atomic<T: Serialize>(
    path: &Path,
    value: &T,
    max_bytes: usize,
) -> Result<(), AppError> {
    let mut contents = serde_json::to_vec_pretty(value)?;
    contents.push(b'\n');
    write_atomic(path, &contents, max_bytes)
}

pub(crate) fn write_text_atomic(
    path: &Path,
    contents: &str,
    max_bytes: usize,
) -> Result<(), AppError> {
    write_atomic(path, contents.as_bytes(), max_bytes)
}

fn read_limited(path: &Path, max_bytes: usize, label: &str) -> Result<Vec<u8>, AppError> {
    reject_special_file(path)?;
    let mut file = File::open(path)?;
    if file.metadata()?.len() > max_bytes as u64 {
        return Err(AppError::Validation(format!(
            "{label} supera el límite de {} MiB",
            display_mebibytes(max_bytes)
        )));
    }

    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(max_bytes.saturating_add(1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > max_bytes {
        return Err(AppError::Validation(format!(
            "{label} supera el límite de {} MiB",
            display_mebibytes(max_bytes)
        )));
    }
    Ok(bytes)
}

fn write_atomic(path: &Path, contents: &[u8], max_bytes: usize) -> Result<(), AppError> {
    if contents.len() > max_bytes {
        return Err(AppError::Validation(format!(
            "El contenido supera el límite de {} MiB",
            display_mebibytes(max_bytes)
        )));
    }
    let parent = path.parent().ok_or_else(|| {
        AppError::Validation(format!("Ruta de archivo no válida: {}", path.display()))
    })?;
    validate_directory(parent)?;
    if path.exists() {
        reject_special_file(path)?;
    }

    let temporary = sibling_path(path, "tmp")?;
    let write_result = (|| -> Result<(), AppError> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);

        // rename replaces an existing file atomically on supported desktop OSes.
        // Moving the original away first leaves a crash window with no document.
        fs::rename(&temporary, path)?;
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

fn reject_special_file(path: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AppError::Validation(format!(
            "Nexora no admite enlaces ni archivos especiales en {}",
            path.display()
        )));
    }
    Ok(())
}

fn sibling_path(path: &Path, suffix: &str) -> Result<PathBuf, AppError> {
    let parent = path.parent().ok_or_else(|| {
        AppError::Validation(format!("Ruta de archivo no válida: {}", path.display()))
    })?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            AppError::Validation(format!("Nombre de archivo no válido: {}", path.display()))
        })?;
    Ok(parent.join(format!(".{name}.{}.{suffix}", Uuid::new_v4())))
}

fn display_mebibytes(bytes: usize) -> usize {
    bytes.div_ceil(1024 * 1024)
}

#[cfg(test)]
mod tests {
    use serde::{Deserialize, Serialize};

    use super::{read_json, read_tail, read_text, write_json_atomic, write_text_atomic};

    #[derive(Debug, Deserialize, PartialEq, Serialize)]
    struct Fixture {
        value: String,
    }

    #[test]
    fn atomically_replaces_bounded_files() {
        let root = std::env::temp_dir().join(format!("nexora-storage-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("fixture.json");

        write_json_atomic(
            &path,
            &Fixture {
                value: "uno".into(),
            },
            1_024,
        )
        .unwrap();
        write_json_atomic(
            &path,
            &Fixture {
                value: "dos".into(),
            },
            1_024,
        )
        .unwrap();

        assert_eq!(
            read_json::<Fixture>(&path, 1_024, "fixture").unwrap(),
            Fixture {
                value: "dos".into()
            }
        );
        assert_eq!(
            std::fs::read_dir(&root).unwrap().count(),
            1,
            "no deben quedar temporales ni copias de seguridad"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_oversized_reads_and_writes() {
        let root = std::env::temp_dir().join(format!("nexora-storage-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("fixture.txt");
        std::fs::write(&path, "demasiado").unwrap();

        assert!(read_text(&path, 4, "fixture").is_err());
        assert!(write_text_atomic(&path, "demasiado", 4).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "demasiado");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn tail_read_retains_only_the_requested_log_suffix() {
        let root = std::env::temp_dir().join(format!("nexora-tail-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("runtime.log");
        std::fs::write(&path, "old-lines\nlast-line").unwrap();
        assert_eq!(read_tail(&path, 9).unwrap(), "last-line");
        assert_eq!(read_tail(&path, 0).unwrap(), "");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn replacing_a_file_never_exposes_a_missing_or_partial_document_to_readers() {
        let root = std::env::temp_dir().join(format!("nexora-atomic-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("request.json");
        write_json_atomic(
            &path,
            &Fixture {
                value: "initial".into(),
            },
            1_024,
        )
        .unwrap();
        let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let reader = std::thread::spawn({
            let path = path.clone();
            let done = done.clone();
            move || {
                while !done.load(std::sync::atomic::Ordering::Acquire) {
                    let value = read_json::<Fixture>(&path, 1_024, "request").unwrap();
                    assert!(!value.value.is_empty());
                }
            }
        });
        for index in 0..64 {
            write_json_atomic(
                &path,
                &Fixture {
                    value: format!("revision-{index}"),
                },
                1_024,
            )
            .unwrap();
        }
        done.store(true, std::sync::atomic::Ordering::Release);
        reader.join().unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
}

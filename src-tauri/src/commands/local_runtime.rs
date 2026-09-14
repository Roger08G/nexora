use std::{
    net::TcpStream,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use crate::error::AppError;

pub(crate) fn ensure_same_data_directory(
    expected: &Path,
    reported: &str,
    engine: &str,
) -> Result<(), AppError> {
    let mismatch = || {
        AppError::Conflict(format!(
            "El proceso {engine} activo usa otra carpeta; Nexora no lo adoptará"
        ))
    };
    let reported = Path::new(reported);
    if !reported.is_absolute()
        || expected.canonicalize()? != reported.canonicalize().map_err(|_| mismatch())?
    {
        return Err(mismatch());
    }
    Ok(())
}

pub(crate) fn runtime_roots() -> Vec<PathBuf> {
    let executable = std::env::current_exe().ok();
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    runtime_roots_at(executable.as_deref(), local_app_data.as_deref())
}

fn runtime_roots_at(executable: Option<&Path>, local_app_data: Option<&Path>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(directory) = executable.and_then(Path::parent) {
        roots.push(directory.join("runtimes"));
    }
    if let Some(directory) = local_app_data {
        roots.push(directory.join("Nexora/runtimes"));
    }
    roots
}

pub(crate) fn process_owns_loopback_port(process_id: u32, port: u16) -> bool {
    process_loopback_ports(process_id).contains(&port)
}

pub(crate) fn process_loopback_ports(process_id: u32) -> Vec<u16> {
    platform_netstat()
        .map(|output| parse_netstat_ports(&output, process_id))
        .unwrap_or_default()
}

pub(crate) fn wait_for_closed_port(port: u16, timeout: Duration) {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}")
                .parse()
                .expect("valid loopback socket"),
            Duration::from_millis(150),
        )
        .is_err()
        {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(windows)]
fn platform_netstat() -> Option<String> {
    use std::os::windows::process::CommandExt;

    let executable = std::env::var_os("SystemRoot")
        .map(std::path::PathBuf::from)?
        .join("System32/netstat.exe");
    if !executable.is_file() {
        return None;
    }
    let output = Command::new(executable)
        .args(["-ano", "-p", "tcp"])
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(not(windows))]
fn platform_netstat() -> Option<String> {
    None
}

fn parse_netstat_ports(output: &str, process_id: u32) -> Vec<u16> {
    let mut ports = output
        .lines()
        .filter_map(|line| {
            let columns = line.split_whitespace().collect::<Vec<_>>();
            if !columns
                .first()
                .is_some_and(|protocol| protocol.eq_ignore_ascii_case("TCP"))
                || columns.last()?.parse::<u32>().ok()? != process_id
            {
                return None;
            }
            let local = columns.get(1)?.parse::<std::net::SocketAddr>().ok()?;
            let remote = columns.get(2)?.parse::<std::net::SocketAddr>().ok()?;
            // Listening rows have an unspecified peer on every Windows locale.
            // An outbound or wildcard-bound socket cannot establish ownership of
            // the loopback database listener during recovery of a reused PID.
            (local.ip().is_loopback() && remote.ip().is_unspecified() && remote.port() == 0)
                .then_some(local.port())
        })
        .collect::<Vec<_>>();
    ports.sort_unstable();
    ports.dedup();
    ports
}

#[cfg(test)]
mod tests {
    use super::{parse_netstat_ports, runtime_roots_at};

    #[test]
    fn recovery_requires_the_same_physical_data_directory() {
        let root =
            std::env::temp_dir().join(format!("nexora-runtime-identity-{}", uuid::Uuid::new_v4()));
        let original = root.join("original");
        let copied = root.join("copy");
        std::fs::create_dir_all(&original).unwrap();
        std::fs::create_dir_all(&copied).unwrap();
        assert!(super::ensure_same_data_directory(
            &original,
            original.join("..").join("original").to_str().unwrap(),
            "test",
        )
        .is_ok());
        assert!(
            super::ensure_same_data_directory(&copied, original.to_str().unwrap(), "test").is_err()
        );
        assert!(super::ensure_same_data_directory(&original, "original", "test").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resolves_portable_runtimes_from_the_executable_before_user_installations() {
        let root = std::env::temp_dir().join("nexora-layout");
        assert_eq!(
            runtime_roots_at(
                Some(&root.join("portable/nexora.exe")),
                Some(&root.join("user"))
            ),
            vec![
                root.join("portable/runtimes"),
                root.join("user/Nexora/runtimes")
            ]
        );
        assert_eq!(
            runtime_roots_at(Some(&root.join("nexora.exe")), None),
            vec![root.join("runtimes")]
        );
    }

    #[test]
    fn extracts_tcp_ports_owned_by_a_process_without_localized_state_names() {
        let output = r#"
  Proto  Local Address          Foreign Address        State           PID
  TCP    127.0.0.1:57815        0.0.0.0:0              LISTENING       21104
  TCP    127.0.0.1:57815        127.0.0.1:60100        ESTABLISHED     21104
  TCP    127.0.0.1:59847        0.0.0.0:0              ESCUCHANDO      19812
  TCP    0.0.0.0:27017         0.0.0.0:0              LISTENING       21104
  TCP    127.0.0.1:61000       127.0.0.1:27017        ESTABLISHED     21104
  TCP    192.168.1.2:57816     0.0.0.0:0              LISTENING       21104
  TCP    [::1]:57815          [::]:0                  LISTENING       21104
"#;
        assert_eq!(parse_netstat_ports(output, 21104), vec![57815]);
        assert_eq!(parse_netstat_ports(output, 19812), vec![59847]);
    }
}

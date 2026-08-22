use std::{net::TcpStream, process::Command, time::Duration};

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

    let output = Command::new("netstat")
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
            columns.get(1)?.rsplit_once(':')?.1.parse::<u16>().ok()
        })
        .collect::<Vec<_>>();
    ports.sort_unstable();
    ports.dedup();
    ports
}

#[cfg(test)]
mod tests {
    use super::parse_netstat_ports;

    #[test]
    fn extracts_tcp_ports_owned_by_a_process_without_localized_state_names() {
        let output = r#"
  Proto  Local Address          Foreign Address        State           PID
  TCP    127.0.0.1:57815        0.0.0.0:0              LISTENING       21104
  TCP    127.0.0.1:57815        127.0.0.1:60100        ESTABLISHED     21104
  TCP    127.0.0.1:59847        0.0.0.0:0              ESCUCHANDO      19812
"#;
        assert_eq!(parse_netstat_ports(output, 21104), vec![57815]);
        assert_eq!(parse_netstat_ports(output, 19812), vec![59847]);
    }
}

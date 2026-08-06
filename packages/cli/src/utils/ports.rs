//! The ports a project's modules listen on, and freeing them.
//!
//! A back-end module declares its port as `app.port` in its `.env.yml`; a
//! front-end module declares it as the `--port` of a package script. Freeing one
//! means asking the operating system who is holding it — `lsof`, `ss` or `fuser`
//! on macOS and Linux, `netstat` on Windows — and stopping whoever answers.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

use regex::Regex;
use serde_json::Value;

use super::runnable_modules::RunnableModule;

/// A port together with the module that declares it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModulePort {
    pub module: String,
    pub port: u16,
}

/// How long a process gets to close its socket before it is killed outright.
const GRACE_PERIOD: Duration = Duration::from_millis(400);

/// The port an `.env.yml` body declares for the module itself.
///
/// Only the `port:` nested directly under the top-level `app:` counts — other
/// sections name ports too (an SMTP relay, a database) and those belong to
/// someone else's process.
pub fn parse_env_port(content: &str) -> Option<u16> {
    let mut in_app = false;
    for line in content.lines() {
        let key = line.trim_start();
        if key.is_empty() || key.starts_with('#') {
            continue;
        }
        let indent = line.len() - key.len();
        if indent == 0 {
            in_app = key.starts_with("app:");
            continue;
        }
        if !in_app || indent != 2 {
            continue;
        }
        if let Some(value) = key.strip_prefix("port:") {
            let value = value.split('#').next().unwrap_or(value);
            return value.trim().trim_matches('"').parse().ok();
        }
    }
    None
}

/// Every port the `--port` flags of a package manifest's scripts declare.
pub fn parse_script_ports(manifest: &str) -> BTreeSet<u16> {
    let mut ports = BTreeSet::new();
    let Ok(port_re) = Regex::new(r"--port[=\s]+(\d+)") else {
        return ports;
    };
    let scripts = serde_json::from_str::<Value>(manifest)
        .ok()
        .and_then(|package_json| package_json.get("scripts").cloned())
        .unwrap_or(Value::Null);
    let Some(scripts) = scripts.as_object() else {
        return ports;
    };
    for script in scripts.values().filter_map(Value::as_str) {
        for caps in port_re.captures_iter(script) {
            if let Some(port) = caps
                .get(1)
                .and_then(|value| value.as_str().parse::<u16>().ok())
            {
                ports.insert(port);
            }
        }
    }
    ports
}

/// Every port a module declares, from its env file and its package scripts.
///
/// `.env.yml` is git-ignored, so the committed example stands in for it on a
/// fresh checkout — same port, since that is what the module would boot with.
pub fn module_ports(module_dir: &Path) -> BTreeSet<u16> {
    let mut ports = BTreeSet::new();
    let env = fs::read_to_string(module_dir.join(".env.yml"))
        .or_else(|_| fs::read_to_string(module_dir.join(".env.example.yml")))
        .unwrap_or_default();
    ports.extend(parse_env_port(&env));
    if let Ok(manifest) = fs::read_to_string(module_dir.join("package.json")) {
        ports.extend(parse_script_ports(&manifest));
    }
    ports
}

/// The ports of `modules`, each attributed to the module declaring it. A port
/// two modules share is listed once, under the first of them.
pub fn collect_module_ports(modules: &[RunnableModule]) -> Vec<ModulePort> {
    let mut seen = BTreeSet::new();
    let mut ports = Vec::new();
    for module in modules {
        for port in module_ports(&module.dir) {
            if seen.insert(port) {
                ports.push(ModulePort {
                    module: module.name.clone(),
                    port,
                });
            }
        }
    }
    ports
}

/// The PIDs in a Unix probe's output.
///
/// `lsof -t` prints one bare PID per line and `fuser` a space-separated run of
/// them, while `ss` buries them in `users:(("bun",pid=4242,fd=20))` — so a
/// tagged PID wins whenever the output carries one.
pub fn parse_unix_pids(output: &str) -> Vec<u32> {
    let tagged = Regex::new(r"pid=(\d+)").ok();
    let mut pids: Vec<u32> = tagged
        .iter()
        .flat_map(|port_re| port_re.captures_iter(output))
        .filter_map(|caps| caps[1].parse().ok())
        .collect();
    if pids.is_empty() {
        pids = output
            .split_whitespace()
            .filter_map(|token| token.parse().ok())
            .collect();
    }
    let mut seen = BTreeSet::new();
    pids.retain(|pid| *pid != 0 && seen.insert(*pid));
    pids
}

/// The PIDs `netstat -ano` reports against `port`.
///
/// The state column is matched by shape rather than by name: Windows localises
/// `LISTENING`, so a row counts when it has five columns, a local address
/// carrying the port, and a live PID in the last one.
pub fn parse_netstat_pids(output: &str, port: u16) -> Vec<u32> {
    let suffix = format!(":{port}");
    let mut seen = BTreeSet::new();
    output
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() != 5 || !fields[1].ends_with(&suffix) {
                return None;
            }
            fields[4].parse::<u32>().ok().filter(|pid| *pid != 0)
        })
        .filter(|pid| seen.insert(*pid))
        .collect()
}

/// The PIDs listening on `port`, as the platform's own tooling reports them.
///
/// The probes are tried in turn because a machine has one or two of them, rarely
/// all three: `lsof` on macOS, `ss` on a modern Linux, `fuser` on a lean image.
#[cfg(not(windows))]
pub fn listening_pids(port: u16) -> Vec<u32> {
    let lsof_target = format!("-iTCP:{port}");
    let ss_filter = format!("sport = :{port}");
    let port = port.to_string();
    let probes = [
        (
            "lsof",
            vec!["-nP", lsof_target.as_str(), "-sTCP:LISTEN", "-t"],
        ),
        ("ss", vec!["-Hltnp", ss_filter.as_str()]),
        ("fuser", vec!["-n", "tcp", port.as_str()]),
    ];

    for (bin, args) in probes {
        let Ok(output) = Command::new(bin).args(&args).output() else {
            continue;
        };
        let pids = parse_unix_pids(&String::from_utf8_lossy(&output.stdout));
        if !pids.is_empty() {
            return pids;
        }
    }
    Vec::new()
}

/// The PIDs listening on `port`, as `netstat` reports them.
#[cfg(windows)]
pub fn listening_pids(port: u16) -> Vec<u32> {
    let Ok(output) = Command::new("netstat").args(["-ano", "-p", "tcp"]).output() else {
        return Vec::new();
    };
    parse_netstat_pids(&String::from_utf8_lossy(&output.stdout), port)
}

/// Ask a process to stop, or kill it when `force` is set.
#[cfg(not(windows))]
fn signal(pid: u32, force: bool) {
    let signal = if force { "-KILL" } else { "-TERM" };
    let _ = Command::new("kill")
        .args([signal, &pid.to_string()])
        .output();
}

/// Ask a process tree to stop, or kill it when `force` is set.
#[cfg(windows)]
fn signal(pid: u32, force: bool) {
    let mut command = Command::new("taskkill");
    command.args(["/PID", &pid.to_string(), "/T"]);
    if force {
        command.arg("/F");
    }
    let _ = command.output();
}

/// Stop whoever is listening on `port` and report the PIDs that were stopped.
///
/// Each one is asked to shut down first and only killed if it is still holding
/// the port once the grace period is over — a dev server that flushes its state
/// on exit gets the chance to.
pub fn free_port(port: u16) -> Vec<u32> {
    let own = std::process::id();
    let mut stopped: Vec<u32> = listening_pids(port)
        .into_iter()
        .filter(|pid| *pid != own)
        .collect();
    if stopped.is_empty() {
        return stopped;
    }

    for pid in &stopped {
        signal(*pid, false);
    }
    std::thread::sleep(GRACE_PERIOD);

    for pid in listening_pids(port) {
        if pid == own {
            continue;
        }
        signal(pid, true);
        if !stopped.contains(&pid) {
            stopped.push(pid);
        }
    }
    stopped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_port_under_the_app_section() {
        let content = "app:\n  env: local\n  host: \"\"\n  port: 8031\n";

        assert_eq!(parse_env_port(content), Some(8031));
    }

    #[test]
    fn ignores_the_port_of_another_section() {
        let content = "mailer:\n  smtp:\n    port: 587\n\napp:\n  port: 8030\n";

        assert_eq!(parse_env_port(content), Some(8030));
    }

    #[test]
    fn has_no_port_when_the_app_section_declares_none() {
        assert_eq!(parse_env_port("cache:\n  redis:\n    port: 6379\n"), None);
        assert_eq!(parse_env_port(""), None);
    }

    #[test]
    fn reads_a_quoted_and_commented_port() {
        let content = "app:\n  port: \"8032\" # PORT\n";

        assert_eq!(parse_env_port(content), Some(8032));
    }

    #[test]
    fn collects_every_port_a_script_declares() {
        let manifest = r#"{"scripts":{"dev":"vite --port 3030","e2e":"playwright test","preview":"vite preview --port=4173"}}"#;

        assert_eq!(parse_script_ports(manifest), BTreeSet::from([3030, 4173]));
    }

    #[test]
    fn has_no_script_ports_when_the_manifest_is_unusable() {
        assert!(parse_script_ports("not json").is_empty());
        assert!(parse_script_ports(r#"{"scripts":{"dev":"vite"}}"#).is_empty());
    }

    #[test]
    fn collects_the_env_and_script_ports_of_a_module() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(temp.path().join(".env.yml"), "app:\n  port: 8030\n").expect("env");
        fs::write(
            temp.path().join("package.json"),
            r#"{"scripts":{"dev":"vite --port 3030"}}"#,
        )
        .expect("manifest");

        assert_eq!(module_ports(temp.path()), BTreeSet::from([3030, 8030]));
    }

    #[test]
    fn falls_back_to_the_committed_env_example() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(temp.path().join(".env.example.yml"), "app:\n  port: 8030\n").expect("env");

        assert_eq!(module_ports(temp.path()), BTreeSet::from([8030]));
    }

    #[test]
    fn prefers_the_local_env_over_the_example() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(temp.path().join(".env.yml"), "app:\n  port: 8031\n").expect("env");
        fs::write(temp.path().join(".env.example.yml"), "app:\n  port: 8030\n").expect("example");

        assert_eq!(module_ports(temp.path()), BTreeSet::from([8031]));
    }

    #[test]
    fn attributes_a_shared_port_to_the_first_module_declaring_it() {
        let temp = tempfile::tempdir().expect("temp dir");
        let spa = temp.path().join("spa");
        let admin = temp.path().join("admin");
        fs::create_dir_all(&spa).expect("spa dir");
        fs::create_dir_all(&admin).expect("admin dir");
        let manifest = r#"{"scripts":{"dev":"vite --port 3030"}}"#;
        fs::write(spa.join("package.json"), manifest).expect("spa manifest");
        fs::write(admin.join("package.json"), manifest).expect("admin manifest");

        let ports = collect_module_ports(&[
            RunnableModule {
                name: "spa".to_string(),
                r#type: super::super::RunnableModuleType::Spa,
                dir: spa,
            },
            RunnableModule {
                name: "admin".to_string(),
                r#type: super::super::RunnableModuleType::Admin,
                dir: admin,
            },
        ]);

        assert_eq!(
            ports,
            vec![ModulePort {
                module: "spa".to_string(),
                port: 3030
            }]
        );
    }

    #[test]
    fn reads_the_bare_pids_of_lsof() {
        assert_eq!(parse_unix_pids("4242\n4243\n4242\n"), vec![4242, 4243]);
    }

    #[test]
    fn reads_the_tagged_pids_of_ss() {
        let output = "LISTEN 0 511 *:3030 *:* users:((\"bun\",pid=4242,fd=20))\n";

        assert_eq!(parse_unix_pids(output), vec![4242]);
    }

    #[test]
    fn has_no_pids_when_nothing_is_listening() {
        assert!(parse_unix_pids("").is_empty());
        assert!(parse_unix_pids("0\n").is_empty());
    }

    #[test]
    fn reads_the_listening_pids_of_netstat() {
        let output = concat!(
            "Active Connections\n",
            "  Proto  Local Address      Foreign Address    State       PID\n",
            "  TCP    0.0.0.0:3030       0.0.0.0:0          LISTENING   4242\n",
            "  TCP    [::]:3030          [::]:0             LISTENING   4242\n",
            "  TCP    0.0.0.0:5432       0.0.0.0:0          LISTENING   777\n",
            "  TCP    0.0.0.0:3030       0.0.0.0:0          TIME_WAIT   0\n",
        );

        assert_eq!(parse_netstat_pids(output, 3030), vec![4242]);
        assert_eq!(parse_netstat_pids(output, 5432), vec![777]);
        assert!(parse_netstat_pids(output, 9999).is_empty());
    }

    #[test]
    fn reads_a_localised_netstat_state() {
        let output = "  TCP    0.0.0.0:3030    0.0.0.0:0    ABHÖREN    4242\n";

        assert_eq!(parse_netstat_pids(output, 3030), vec![4242]);
    }

    #[test]
    fn does_not_confuse_a_port_with_its_suffix() {
        let output = "  TCP    0.0.0.0:13030    0.0.0.0:0    LISTENING    4242\n";

        assert!(parse_netstat_pids(output, 3030).is_empty());
    }
}

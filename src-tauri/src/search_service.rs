use serde::Serialize;
use std::{
    path::PathBuf,
    process::{Command, Output},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const CONTAINER: &str = "mikan-searxng";
const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:8888";
const RECOVERY_COOLDOWN: Duration = Duration::from_secs(90);
const STARTUP_GRACE: Duration = Duration::from_secs(20);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchServiceStatus {
    pub state: String,
    pub message: String,
}

fn state(name: &str, message: &str) -> SearchServiceStatus {
    SearchServiceStatus { state: name.into(), message: message.into() }
}

// Avoid a Docker process on every health check. Only use Docker when the local
// HTTP endpoint fails, and rate-limit automatic recovery to avoid restart loops.
#[derive(Default)]
struct RecoveryAttempts {
    docker: Option<Instant>,
    container: Option<Instant>,
    unhealthy_since: Option<Instant>,
}

fn attempts() -> &'static Mutex<RecoveryAttempts> {
    static ATTEMPTS: OnceLock<Mutex<RecoveryAttempts>> = OnceLock::new();
    ATTEMPTS.get_or_init(|| Mutex::new(RecoveryAttempts::default()))
}

fn claim_recovery(docker: bool) -> bool {
    let mut guard = attempts().lock().unwrap_or_else(|e| e.into_inner());
    let last = if docker { &mut guard.docker } else { &mut guard.container };
    if last.is_some_and(|time| time.elapsed() < RECOVERY_COOLDOWN) {
        return false;
    }
    *last = Some(Instant::now());
    true
}

// Don't restart SearXNG while it is simply booting after Docker starts.
fn allow_unresponsive_restart() -> bool {
    let mut guard = attempts().lock().unwrap_or_else(|e| e.into_inner());
    let started = guard.unhealthy_since.get_or_insert_with(Instant::now);
    started.elapsed() >= STARTUP_GRACE
}

fn clear_unhealthy() {
    attempts().lock().unwrap_or_else(|e| e.into_inner()).unhealthy_since = None;
}

fn docker_path() -> PathBuf {
    // Tauri apps launched by Explorer can inherit a different PATH from PowerShell.
    #[cfg(windows)]
    for variable in ["ProgramFiles", "ProgramW6432"] {
        if let Some(root) = std::env::var_os(variable) {
            let path = PathBuf::from(root).join("Docker/Docker/resources/bin/docker.exe");
            if path.is_file() { return path; }
        }
    }
    PathBuf::from(if cfg!(windows) { "docker.exe" } else { "docker" })
}

fn docker(args: &[&str]) -> Result<Output, String> {
    let mut command = Command::new(docker_path());
    command.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command.output().map_err(|_| {
        "Docker CLI not found. Install Docker Desktop first.".to_string()
    })
}

#[cfg(windows)]
fn launch_docker_desktop() -> Result<(), String> {
    for variable in ["ProgramFiles", "ProgramW6432"] {
        if let Some(root) = std::env::var_os(variable) {
            let path = PathBuf::from(root).join("Docker/Docker/Docker Desktop.exe");
            if path.is_file() {
                Command::new(&path).spawn()
                    .map_err(|e| format!("Could not launch Docker Desktop: {e}"))?;
                return Ok(());
            }
        }
    }
    Err("Docker Desktop was not found. Install it or start it manually.".into())
}

#[cfg(not(windows))]
fn launch_docker_desktop() -> Result<(), String> {
    Err("Start Docker manually on this operating system.".into())
}

fn result(output: Output, operation: &str) -> Result<(), String> {
    if output.status.success() { return Ok(()); }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let details = stderr.chars().take(380).collect::<String>();
    Err(format!("{operation} failed: {details}. Make sure Docker Desktop is running and SearXNG was set up once."))
}

fn inspect() -> SearchServiceStatus {
    let available = docker(&["info", "--format", "{{.ServerVersion}}"]);
    if !matches!(available, Ok(ref o) if o.status.success()) {
        return state("docker-offline", "Docker Desktop is not running or is not installed.");
    }
    match docker(&["inspect", "--format", "{{.State.Running}}", CONTAINER]) {
        Ok(value) if value.status.success() => {
            if String::from_utf8_lossy(&value.stdout).trim() == "true" {
                state("running", "SearXNG container running; checking HTTP readiness…")
            } else {
                state("stopped", "SearXNG is installed but stopped.")
            }
        },
        _ => state("not-installed", "SearXNG has not been installed. Run tools/searxng/start.ps1 once."),
    }
}

fn manages_endpoint(endpoint: &str) -> bool {
    reqwest::Url::parse(endpoint).is_ok_and(|url| {
        matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
            && url.port_or_known_default() == Some(8888)
    })
}

async fn endpoint_healthy(endpoint: &str) -> bool {
    // GET / checks the actual SearXNG HTTP service without sending a query to
    // public search engines. The Docker "running" flag alone is insufficient.
    let Ok(client) = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .build() else { return false };
    matches!(client.get(endpoint).send().await, Ok(response) if response.status().is_success())
}

fn start_container() -> Result<SearchServiceStatus, String> {
    result(docker(&["update", "--restart", "unless-stopped", CONTAINER])?, "Updating container restart policy")?;
    result(docker(&["start", CONTAINER])?, "Starting SearXNG")?;
    // Allow the container to boot before treating an unready HTTP service as hung.
    clear_unhealthy();
    let _ = claim_recovery(false);
    Ok(state("starting", "Starting SearXNG; waiting for HTTP readiness…"))
}

fn start_service() -> Result<SearchServiceStatus, String> {
    let current = inspect();
    match current.state.as_str() {
        "docker-offline" => {
            if claim_recovery(true) {
                launch_docker_desktop()?;
            }
            Ok(state("starting", "Waiting for Docker Desktop to start…"))
        },
        "not-installed" => Ok(current),
        "running" => {
            result(docker(&["update", "--restart", "unless-stopped", CONTAINER])?, "Updating container restart policy")?;
            Ok(state("starting", "SearXNG running; checking HTTP readiness…"))
        },
        "stopped" => start_container(),
        _ => Ok(current)
    }
}

fn ensure_service() -> Result<SearchServiceStatus, String> {
    let current = inspect();
    match current.state.as_str() {
        "docker-offline" => {
            clear_unhealthy();
            if claim_recovery(true) {
                launch_docker_desktop()?;
            }
            Ok(state("starting", "Waiting for Docker Desktop to start…"))
        },
        "stopped" => {
            clear_unhealthy();
            if claim_recovery(false) {
                start_container()
            } else {
                Ok(state("starting", "Waiting to retry SearXNG startup…"))
            }
        },
        "running" => {
            if allow_unresponsive_restart() && claim_recovery(false) {
                result(docker(&["restart", CONTAINER])?, "Restarting unresponsive SearXNG")?;
                clear_unhealthy();
                Ok(state("starting", "SearXNG was unresponsive; restarting container…"))
            } else {
                Ok(state("starting", "Waiting for SearXNG HTTP readiness…"))
            }
        },
        _ => Ok(current)
    }
}

#[tauri::command]
pub async fn search_service(action: String, endpoint: Option<String>) -> Result<SearchServiceStatus, String> {
    let endpoint = crate::web_search::local_searxng_url(endpoint.as_deref().unwrap_or(DEFAULT_ENDPOINT))?;
    if !matches!(action.as_str(), "status" | "ensure" | "start" | "stop") {
        return Err("Unsupported SearXNG action".into());
    }

    if matches!(action.as_str(), "status" | "ensure") {
        if endpoint_healthy(&endpoint).await {
            clear_unhealthy();
            return Ok(state("ready", "Search ready. SearXNG is responding."));
        }
        if !manages_endpoint(&endpoint) {
            return Ok(state("unavailable", "Custom SearXNG endpoint is not responding; automatic recovery only manages local port 8888."));
        }
    }

    tauri::async_runtime::spawn_blocking(move || match action.as_str() {
        "status" => {
            let current = inspect();
            if current.state == "running" {
                Ok(state("starting", "SearXNG container is running but HTTP is not ready."))
            } else {
                Ok(current)
            }
        },
        "ensure" => ensure_service(),
        "start" => start_service(),
        "stop" => {
            result(docker(&["stop", CONTAINER])?, "Stopping SearXNG")?;
            Ok(state("stopped", "SearXNG stopped. Automatic recovery is disabled."))
        },
        _ => unreachable!(),
    }).await.map_err(|e| format!("SearXNG operation failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docker_container_name_is_fixed() {
        assert_eq!(CONTAINER, "mikan-searxng");
    }

    #[test]
    fn only_managed_local_endpoint_can_be_auto_restarted() {
        assert!(manages_endpoint("http://127.0.0.1:8888/"));
        assert!(manages_endpoint("http://localhost:8888/"));
        assert!(!manages_endpoint("http://localhost:9999/"));
    }
}

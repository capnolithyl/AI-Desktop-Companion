use serde::Serialize;
use std::{path::PathBuf, process::{Command, Output}};

const CONTAINER: &str = "mikan-searxng";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchServiceStatus {
    pub state: String,
    pub message: String,
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
        "Docker CLI not found. Install Docker Desktop and start it first.".to_string()
    })
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
        return SearchServiceStatus {
            state: "docker-offline".into(),
            message: "Docker Desktop is not running or is not installed.".into(),
        };
    }
    match docker(&["inspect", "--format", "{{.State.Running}}", CONTAINER]) {
        Ok(value) if value.status.success() => {
            if String::from_utf8_lossy(&value.stdout).trim() == "true" {
                SearchServiceStatus { state: "running".into(), message: "SearXNG container running.".into() }
            } else {
                SearchServiceStatus { state: "stopped".into(), message: "SearXNG is installed but stopped.".into() }
            }
        },
        _ => SearchServiceStatus {
            state: "not-installed".into(),
            message: "SearXNG has not been installed. Run tools/searxng/start.ps1 once.".into(),
        },
    }
}

#[tauri::command]
pub async fn search_service(action: String) -> Result<SearchServiceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match action.as_str() {
            "status" => {},
            "start" => {
                // Also opt an existing v0.4 container into Docker auto-start on next boot.
                result(docker(&["update", "--restart", "unless-stopped", CONTAINER])?, "Updating container restart policy")?;
                result(docker(&["start", CONTAINER])?, "Starting SearXNG")?;
            },
            "stop" => result(docker(&["stop", CONTAINER])?, "Stopping SearXNG")?,
            _ => return Err("Unsupported SearXNG action".into()),
        };
        Ok(inspect())
    }).await.map_err(|e| format!("SearXNG operation failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn docker_container_name_is_fixed() {
        assert_eq!(CONTAINER, "mikan-searxng");
    }
}

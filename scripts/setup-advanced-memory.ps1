param(
  [string]$Model = "qwen3.5:9b",
  [string]$OllamaUrl = "http://127.0.0.1:11434",
  [switch]$InstallOnly
)
$ErrorActionPreference = "Stop"
if ($OllamaUrl -notin @("http://127.0.0.1:11434", "http://localhost:11434")) {
  throw "Only local Ollama is supported."
}
if ($Model -notmatch '^[A-Za-z0-9._:/-]{1,100}$') {
  throw "Invalid local model name."
}
if (-not $env:LOCALAPPDATA) { throw "LOCALAPPDATA is required on Windows." }
$home = Join-Path $env:LOCALAPPDATA "Mikan\advanced-memory"
$venv = Join-Path $home "venv"
$py = Join-Path $venv "Scripts\python.exe"
New-Item -ItemType Directory -Path $home -Force | Out-Null

# Works both from a source checkout and from Tauri's bundled resources.
$bundleRoot = Split-Path -Parent $PSCommandPath
$source = Join-Path (Split-Path -Parent $bundleRoot) "advanced_memory"
if (Test-Path (Join-Path $bundleRoot "server.py")) { $source = $bundleRoot }
if (-not (Test-Path (Join-Path $source "server.py"))) {
  throw "Cannot locate advanced_memory/server.py. Run from the Mikan project checkout or bundled resources."
}
Copy-Item (Join-Path $source "server.py") (Join-Path $home "server.py") -Force
Copy-Item (Join-Path $source "requirements.txt") (Join-Path $home "requirements.txt") -Force

if (-not (Test-Path $py)) {
  Write-Host "Creating local Python environment..."
  py -3.11 -m venv $venv
}
Write-Host "Installing pinned Mem0 OSS dependencies in Mikan's own virtual environment..."
& $py -m pip install --disable-pip-version-check -r (Join-Path $home "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Failed to install local Mem0 dependencies." }
Write-Host "Downloading the free local semantic embedding model..."
& ollama pull nomic-embed-text
if ($LASTEXITCODE -ne 0) { throw "Ollama could not download nomic-embed-text." }

if (-not $InstallOnly) {
  $env:MIKAN_MEMORY_LLM = $Model
  $env:MIKAN_OLLAMA_URL = $OllamaUrl
  Write-Host "Starting Mem0 locally. No cloud account or API key."
  $service = Start-Process -FilePath $py -ArgumentList @((Join-Path $home "server.py")) -WorkingDirectory $home -WindowStyle Hidden -PassThru
  Write-Host "Mem0 process id: $($service.Id)"
  Write-Host "Mikan will use it automatically when available, otherwise fall back to SQLite."
} else {
  Write-Host "Dependencies installed. Run the same script without -InstallOnly to start Mem0."
}

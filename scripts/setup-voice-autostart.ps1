# Run once from the Mikan checkout, using the existing working ROCm/PyTorch TTS venv.
# No downloads, no venv replacement, no registry or scheduled tasks.
[CmdletBinding()]
param(
    [string]$ProjectRoot,
    [ValidateSet("auto", "cuda:0", "cpu")][string]$Device = "auto",
    [ValidateSet("1.7B", "0.6B")][string]$CloneSize = "1.7B",
    [switch]$DisableMiopen

)

$ErrorActionPreference = "Stop"
if (-not $ProjectRoot) {
    # Script-scoped automatic variables are populated only after parameter
    # binding in Windows PowerShell 5.1. Resolve the repository here instead.
    if (-not $PSCommandPath) { throw "Cannot determine the setup script path. Pass -ProjectRoot explicitly." }
    $ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
}
if (-not $env:LOCALAPPDATA) { throw "LOCALAPPDATA is required on Windows." }

$python = Join-Path $ProjectRoot "tools\tts\.venv\Scripts\python.exe"
$server = Join-Path $ProjectRoot "tools\tts\server.py"
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "The working TTS Python environment was not found at: $python. Install/test TTS first; do not replace your existing ROCm PyTorch wheel."
}
if (-not (Test-Path -LiteralPath $server -PathType Leaf)) {
    throw "The TTS service source was not found at: $server"
}

# Store absolute paths; the user's working GPU environment remains where it is.
# Rerun this script after moving the checkout or TTS venv.
$python = (Resolve-Path -LiteralPath $python).ProviderPath
$server = (Resolve-Path -LiteralPath $server).ProviderPath
$root = Join-Path $env:LOCALAPPDATA "Mikan\voice"
New-Item -ItemType Directory -Path $root -Force | Out-Null
$config = [ordered]@{
    python = $python
    server = $server
    device = $Device
    cloneSize = $CloneSize
    disableMiopen = $DisableMiopen.IsPresent
}
# PowerShell 5.1's Set-Content -Encoding UTF8 adds a BOM that serde_json
# cannot read. Write BOM-free UTF-8 on both PS 5.1 and 7+.
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $root "service.json"), ($config | ConvertTo-Json -Compress), $utf8)
Write-Host "Voice service registered for automatic startup in Mikan."
Write-Host "Python: $python"
Write-Host "Server: $server"
Write-Host "Experimental AMD MIOpen bypass: $($DisableMiopen.IsPresent)"
Write-Host "Restart the Mikan desktop app, then open Settings > Voice > Check connection."
Write-Host "The speech model still loads on first use; your voice reference is preserved."

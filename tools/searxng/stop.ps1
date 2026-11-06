$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    docker compose stop
    if ($LASTEXITCODE -ne 0) { throw "Unable to stop SearXNG." }
    Write-Host "Stopped the Mikan SearXNG container."
} finally {
    Pop-Location
}

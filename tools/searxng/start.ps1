$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is not installed or is missing from PATH. Install Docker Desktop and start it first."
    }

    if (-not (Test-Path ".env")) {
        # Generate a local secret. Never commit the resulting .env file.
        $bytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $secret = [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
        [System.IO.File]::WriteAllText(
            (Join-Path $PSScriptRoot ".env"),
            "SEARXNG_SECRET=$secret" + [Environment]::NewLine,
            (New-Object System.Text.UTF8Encoding($false))
        )
        Write-Host "Created a private SearXNG secret in tools/searxng/.env."
    }

    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw "SearXNG did not start. Verify Docker Desktop is running." }

    Write-Host "SearXNG is starting at http://127.0.0.1:8888"
    Write-Host 'Test in PowerShell: Invoke-RestMethod "http://127.0.0.1:8888/search?q=Mikan&format=json"'
} finally {
    Pop-Location
}

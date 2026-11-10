$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$package = Get-Content "package.json" -Raw | ConvertFrom-Json
$tauri = Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
$cargoVersion = [regex]::Match((Get-Content "src-tauri/Cargo.toml" -Raw), '(?m)^version = "([^"]+)"').Groups[1].Value
if ($package.version -ne $tauri.version -or $package.version -ne $cargoVersion) {
    throw "Version drift: package=$($package.version), Tauri=$($tauri.version), Cargo=$cargoVersion"
}
$expectedVersion = $package.version
$nsis = Join-Path $root "src-tauri/target/release/bundle/nsis"
$installers = @(Get-ChildItem $nsis -Filter "*-setup.exe" -File)
if ($installers.Count -ne 1) { throw "Expected exactly one NSIS installer, found $($installers.Count)." }
$installer = $installers[0]
if (-not $installer.Name.Contains($expectedVersion)) {
    throw "Installer $($installer.Name) does not carry expected version $expectedVersion"
}
if ($installer.Length -lt 1MB) { throw "Installer suspiciously small: $($installer.Length) bytes" }
$stream = [System.IO.File]::OpenRead($installer.FullName)
try {
    if ($stream.ReadByte() -ne 0x4d -or $stream.ReadByte() -ne 0x5a) {
        throw "Installer does not have a valid Windows executable header."
    }
} finally { $stream.Dispose() }
$hash = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash
$signature = (Get-AuthenticodeSignature $installer.FullName).Status
Write-Host "Installer: $($installer.Name)"
Write-Host "Version: $expectedVersion; Size: $($installer.Length); SHA256: $hash"
Write-Host "Authenticode: $signature (unsigned hobby builds are expected; never disable antivirus)"
$details = @(
    "Mikan installer build information"
    "Version: $expectedVersion"
    "Commit: $env:GITHUB_SHA"
    "Branch/ref: $env:GITHUB_REF"
    "Installer: $($installer.Name)"
    "Size: $($installer.Length) bytes"
    "SHA256: $hash"
    "Authenticode: $signature"
)
Set-Content -Path (Join-Path $nsis "BUILD-INFO.txt") -Value $details -Encoding UTF8

# NSIS's documented silent-install flag allows a clean installed-app smoke
# check on the Windows runner. Do not assume the GUI can be tested headlessly.
$destination = Join-Path $env:RUNNER_TEMP "MikanInstallerSmoke"
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Write-Host "Smoke installing into $destination"
$process = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$destination") -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "NSIS silent installation failed with exit code $($process.ExitCode)" }
$installed = @(Get-ChildItem $destination -Recurse -File -Filter "*.exe" |
    Where-Object { $_.Name -match "mikan" -and $_.Name -notmatch "uninstall" })
if ($installed.Count -lt 1) {
    throw "Installer returned success but did not install Mikan executable in $destination"
}
Write-Host "Installed executable exists: $($installed[0].FullName)"
Write-Host "Installer smoke check passed. Local Windows Security history is still needed if the owner reports quarantine."

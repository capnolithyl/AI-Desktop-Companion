# Optional, isolated Pocket TTS CPU voice trial. Does NOT touch Qwen3-TTS/ROCm.
# Downloaded from Kyutai's pinned official Windows release with SHA256 verification.
# Model/voice weights may require accepting terms at https://huggingface.co/kyutai/pocket-tts
[CmdletBinding()]
param(
    [string]$TestText = "Hey there! I'm Mikan. Let's see if this voice sounds like me without making you wait forever.",
    [switch]$PromptForHfToken
)

$ErrorActionPreference = "Stop"
if (-not $env:LOCALAPPDATA) { throw "LOCALAPPDATA is required." }
$root = Join-Path $env:LOCALAPPDATA "Mikan\voice"
$reference = Join-Path $root "mikan-reference.wav"
if (-not (Test-Path -LiteralPath $reference -PathType Leaf)) {
    throw "No saved Mikan WAV reference at $reference. Save your cloned reference using Qwen3-TTS first."
}
New-Item -ItemType Directory -Path $root -Force | Out-Null

# v4.0.1 is the GitHub release; its standalone binary is packaged as version 3.3.0.
$release = "v4.0.1"
$filename = "pocket-tts-3.3.0-x86_64-pc-windows-msvc.zip"
$url = "https://github.com/kyutai-labs/pocket-tts/releases/download/$release/$filename"
$expectedSha = "98753041f2e65744b989776f87bccb93f1f574a08afe1890c5427ec94cd6309c"
$archive = Join-Path $root $filename
$directory = Join-Path $root "pocket-tts"
$versionMarker = Join-Path $directory "mikan-pocket-release.txt"
$needsDownload = -not (Test-Path -LiteralPath $versionMarker -PathType Leaf) -or
    ((Get-Content -LiteralPath $versionMarker -Raw).Trim() -ne $release)

if ($needsDownload) {
    Write-Host "Downloading official Kyutai Pocket TTS Windows binary ($release)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -UseBasicParsing -OutFile $archive
    $actualSha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha -ne $expectedSha) {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        throw "Pocket TTS download failed SHA256 verification. Nothing was installed."
    }
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $directory -Force
    [System.IO.File]::WriteAllText($versionMarker, $release, [System.Text.UTF8Encoding]::new($false))
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
}
$exe = Get-ChildItem -LiteralPath $directory -File -Recurse -Filter "pocket-tts.exe" |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "Pocket TTS executable is missing; delete $versionMarker and rerun this script."
}

# Exercise the exact saved Mikan voice in isolation before exposing this as an app option.
# The first run downloads and initializes model weights; don't benchmark the cold time.
$sample = Join-Path $root "pocket-mikan-sample.wav"
Write-Host "Generating Pocket TTS sample with your existing saved Mikan voice..."
Write-Host "If Hugging Face blocks the download, accept https://huggingface.co/kyutai/pocket-tts"
Write-Host "and authenticate locally (hf auth login or a temporary HF_TOKEN environment variable)."
$previousToken = [Environment]::GetEnvironmentVariable("HF_TOKEN", "Process")
if ($PromptForHfToken) {
    Write-Host "Use a Hugging Face READ token from https://huggingface.co/settings/tokens"
    Write-Host "The token is passed only to this test process and is not saved in a file."
    $secureToken = Read-Host "Paste Hugging Face token" -AsSecureString
    $tokenHandle = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $env:HF_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenHandle)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenHandle)
    }
}
try {
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    & $exe generate --text $TestText --voice $reference --language english --output-path $sample
    $exitCode = $LASTEXITCODE
    $watch.Stop()
} finally {
    if ($PromptForHfToken) {
        [Environment]::SetEnvironmentVariable("HF_TOKEN", $previousToken, "Process")
    }
}
if ($exitCode -ne 0 -or -not (Test-Path -LiteralPath $sample -PathType Leaf)) {
    throw "Pocket voice generation failed. No app setting was changed. Accept the model terms on Hugging Face and retry with -PromptForHfToken if required."
}
$sampleHeader = [System.IO.File]::ReadAllBytes($sample)
if ($sampleHeader.Length -lt 44 -or [System.Text.Encoding]::ASCII.GetString($sampleHeader,0,4) -ne "RIFF") {
    throw "Pocket generated an invalid WAV. Nothing was registered."
}

$config = [ordered]@{
    executable = (Resolve-Path -LiteralPath $exe).ProviderPath
    reference = (Resolve-Path -LiteralPath $reference).ProviderPath
    version = $release
}
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $root "pocket-service.json"), ($config | ConvertTo-Json -Compress), $utf8)
Write-Host ""
Write-Host "Pocket TTS CPU backend registered for Mikan."
Write-Host ("Cold test (includes model setup): {0:N1} seconds" -f $watch.Elapsed.TotalSeconds)
Write-Host "Listen to the sample before switching engines: $sample"
Write-Host "In Mikan v0.8.12+: Settings > Voice > Engine: Pocket TTS (CPU)."
Write-Host "The desktop app starts Pocket on port 8766 when checked/used."
Write-Host "Qwen, MIOpen workaround, and the existing voice recording are untouched."

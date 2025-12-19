# setup-https.ps1
# Set up local HTTPS certificates using mkcert
# Usage: .\scripts\dev\setup-https.ps1

$ErrorActionPreference = "Stop"

function Write-Success { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green }
function Write-Failure { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Header { param($msg) Write-Host "`n========== $msg ==========`n" -ForegroundColor Yellow }

# Change to project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsDir = Split-Path -Parent $scriptDir
$projectRoot = Split-Path -Parent $scriptsDir
Set-Location $projectRoot

$certsDir = "$projectRoot\certs"
$mkcertPath = "$certsDir\mkcert.exe"

Write-Header "Setting Up Local HTTPS"

# Create certs directory
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
    Write-Info "Created certs directory"
}

# Download mkcert if not present
if (-not (Test-Path $mkcertPath)) {
    Write-Info "Downloading mkcert..."

    $mkcertUrl = "https://dl.filippo.io/mkcert/latest?for=windows/amd64"

    try {
        Invoke-WebRequest -Uri $mkcertUrl -OutFile $mkcertPath -UseBasicParsing
        Write-Success "Downloaded mkcert"
    } catch {
        Write-Failure "Failed to download mkcert: $_"
        Write-Info "Please download manually from: https://github.com/FiloSottile/mkcert/releases"
        exit 1
    }
} else {
    Write-Info "mkcert already downloaded"
}

# Install local CA (requires admin for first-time setup)
Write-Info "Installing local CA (may require admin privileges)..."
Write-Host "  If prompted, click 'Yes' to trust the certificate" -ForegroundColor Gray

try {
    & $mkcertPath -install 2>&1 | Out-Null
    Write-Success "Local CA installed"
} catch {
    Write-Failure "Failed to install CA. Try running PowerShell as Administrator."
    exit 1
}

# Generate certificates for localhost
$certFile = "$certsDir\localhost.pem"
$keyFile = "$certsDir\localhost-key.pem"

if ((Test-Path $certFile) -and (Test-Path $keyFile)) {
    Write-Info "Certificates already exist"
    $regenerate = Read-Host "Regenerate? (y/N)"
    if ($regenerate -ne "y") {
        Write-Success "Using existing certificates"
        exit 0
    }
}

Write-Info "Generating certificates for localhost..."
Push-Location $certsDir
try {
    & $mkcertPath localhost 127.0.0.1 ::1

    # Rename to consistent names
    $generatedCert = Get-ChildItem -Filter "localhost+*.pem" | Where-Object { $_.Name -notmatch "-key" } | Select-Object -First 1
    $generatedKey = Get-ChildItem -Filter "localhost+*-key.pem" | Select-Object -First 1

    if ($generatedCert -and $generatedKey) {
        Move-Item $generatedCert.FullName $certFile -Force
        Move-Item $generatedKey.FullName $keyFile -Force
        Write-Success "Generated certificates"
    } else {
        Write-Failure "Certificate generation failed"
        exit 1
    }
} finally {
    Pop-Location
}

Write-Header "Setup Complete"

Write-Host "Certificates created:" -ForegroundColor White
Write-Host "  Certificate: $certFile" -ForegroundColor Gray
Write-Host "  Private Key: $keyFile" -ForegroundColor Gray
Write-Host ""
Write-Info "Next steps:"
Write-Host "  1. Update apps/web/.env.local:" -ForegroundColor Gray
Write-Host "     NEXTAUTH_URL=https://localhost:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "  2. Start services with HTTPS:" -ForegroundColor Gray
Write-Host "     .\scripts\dev\start-all.ps1 -DevMode -ShowLogs -Https" -ForegroundColor Yellow
Write-Host ""

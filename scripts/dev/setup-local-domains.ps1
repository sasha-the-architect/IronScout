# IronScout Local Domain Setup Script (Windows PowerShell)
#
# This script sets up local domain aliases for development:
# - Installs mkcert certificates
# - Updates hosts file
# - Creates .env.local.domains files
#
# Run as Administrator for hosts file modification
#
# Usage: .\scripts\dev\setup-local-domains.ps1

$ErrorActionPreference = "Stop"

$domains = @(
    "www.ironscout.local",
    "app.ironscout.local",
    "api.ironscout.local",
    "admin.ironscout.local",
    "merchant.ironscout.local"
)

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$certsDir = Join-Path $projectRoot ".certs"

Write-Host "IronScout Local Domain Setup" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Step 1: Check for mkcert
Write-Host "[1/4] Checking for mkcert..." -ForegroundColor Yellow
$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) {
    Write-Host "  mkcert not found. Install it with:" -ForegroundColor Red
    Write-Host "    choco install mkcert" -ForegroundColor White
    Write-Host "    # or" -ForegroundColor Gray
    Write-Host "    scoop install mkcert" -ForegroundColor White
    exit 1
}
Write-Host "  mkcert found at: $($mkcert.Source)" -ForegroundColor Green

# Step 2: Generate certificates
Write-Host ""
Write-Host "[2/4] Generating SSL certificates..." -ForegroundColor Yellow

if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
}

$certFile = Join-Path $certsDir "_wildcard.ironscout.local.pem"
if (-not (Test-Path $certFile)) {
    Push-Location $certsDir
    try {
        # Install mkcert CA if not already done
        & mkcert -install 2>$null

        # Generate wildcard cert
        & mkcert "*.ironscout.local" "ironscout.local"
        Write-Host "  Certificates generated in .certs/" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "  Certificates already exist in .certs/" -ForegroundColor Green
}

# Step 3: Update hosts file
Write-Host ""
Write-Host "[3/4] Updating hosts file..." -ForegroundColor Yellow

$hostsFile = "C:\Windows\System32\drivers\etc\hosts"
$hostsContent = Get-Content $hostsFile -Raw

$needsUpdate = $false
foreach ($domain in $domains) {
    if ($hostsContent -notmatch [regex]::Escape($domain)) {
        $needsUpdate = $true
        break
    }
}

if ($needsUpdate) {
    if (-not $isAdmin) {
        Write-Host "  Hosts file needs updating but script is not running as Administrator." -ForegroundColor Red
        Write-Host "  Please add these lines to C:\Windows\System32\drivers\etc\hosts manually:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  # IronScout Local Development" -ForegroundColor Gray
        foreach ($domain in $domains) {
            Write-Host "  127.0.0.1 $domain" -ForegroundColor White
        }
        Write-Host ""
    }
    else {
        $hostEntries = "`n# IronScout Local Development`n"
        foreach ($domain in $domains) {
            $hostEntries += "127.0.0.1 $domain`n"
        }
        Add-Content -Path $hostsFile -Value $hostEntries
        Write-Host "  Hosts file updated" -ForegroundColor Green
    }
}
else {
    Write-Host "  Hosts file already configured" -ForegroundColor Green
}

# Step 4: Check for Caddy
Write-Host ""
Write-Host "[4/4] Checking for Caddy..." -ForegroundColor Yellow
$caddy = Get-Command caddy -ErrorAction SilentlyContinue
if (-not $caddy) {
    Write-Host "  Caddy not found. Install it with:" -ForegroundColor Red
    Write-Host "    choco install caddy" -ForegroundColor White
    Write-Host "    # or" -ForegroundColor Gray
    Write-Host "    scoop install caddy" -ForegroundColor White
}
else {
    Write-Host "  Caddy found at: $($caddy.Source)" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy environment variables:" -ForegroundColor White
Write-Host "     - Review .env.local.domains.example files in each app" -ForegroundColor Gray
Write-Host "     - Merge relevant values into your .env.local files" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Start the development servers:" -ForegroundColor White
Write-Host "     pnpm dev:all" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Start Caddy proxy (in separate terminal):" -ForegroundColor White
Write-Host "     caddy run" -ForegroundColor Cyan
Write-Host ""
Write-Host "  4. Access your apps:" -ForegroundColor White
Write-Host "     https://www.ironscout.local      - Marketing" -ForegroundColor Gray
Write-Host "     https://app.ironscout.local      - Web App" -ForegroundColor Gray
Write-Host "     https://api.ironscout.local      - API" -ForegroundColor Gray
Write-Host "     https://admin.ironscout.local    - Admin" -ForegroundColor Gray
Write-Host "     https://merchant.ironscout.local - Merchant" -ForegroundColor Gray
Write-Host ""

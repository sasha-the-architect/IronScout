# start-all.ps1
# Start all services locally to verify they run correctly
# Usage: .\scripts\start-all.ps1
#
# Options:
#   -SkipBuild    Skip building before starting
#   -Only         Start only specific services (e.g., -Only web,api)
#   -DevMode      Use dev mode (hot reload) instead of production builds

param(
    [switch]$SkipBuild,
    [switch]$DevMode,
    [string[]]$Only
)

$ErrorActionPreference = "Continue"

# Colors for output
function Write-Success { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green }
function Write-Failure { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Header { param($msg) Write-Host "`n========== $msg ==========`n" -ForegroundColor Yellow }

# Change to project root
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot
Write-Info "Project root: $projectRoot"

# Track background jobs
$jobs = @()

# Define services with their start commands
$services = @(
    @{
        Name = "api"
        Port = 8000
        DevCommand = "pnpm --filter @ironscout/api dev"
        ProdCommand = "pnpm --filter @ironscout/api start"
        HealthCheck = "http://localhost:8000/health"
    },
    @{
        Name = "web"
        Port = 3000
        DevCommand = "pnpm --filter @ironscout/web dev"
        ProdCommand = "pnpm --filter @ironscout/web start"
        HealthCheck = "http://localhost:3000"
    },
    @{
        Name = "admin"
        Port = 3002
        DevCommand = "pnpm --filter @ironscout/admin dev"
        ProdCommand = "pnpm --filter @ironscout/admin start"
        HealthCheck = "http://localhost:3002"
    },
    @{
        Name = "dealer"
        Port = 3003
        DevCommand = "pnpm --filter @ironscout/dealer dev"
        ProdCommand = "pnpm --filter @ironscout/dealer start"
        HealthCheck = "http://localhost:3003"
    },
    @{
        Name = "harvester"
        Port = $null  # No port - background worker
        DevCommand = "pnpm --filter @ironscout/harvester worker:dev"
        ProdCommand = "pnpm --filter @ironscout/harvester worker"
        HealthCheck = $null
    }
)

# Filter services if -Only specified
if ($Only) {
    $services = $services | Where-Object { $Only -contains $_.Name }
    Write-Info "Starting only: $($Only -join ', ')"
}

# Build first if not skipped and not in dev mode
if (-not $SkipBuild -and -not $DevMode) {
    Write-Header "Building All Services"
    & "$projectRoot\scripts\build-all.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Failure "Build failed. Fix errors before starting services."
        exit 1
    }
}

Write-Header "Starting Services"

# Start each service as a background job
foreach ($service in $services) {
    $name = $service.Name
    $port = $service.Port
    $command = if ($DevMode) { $service.DevCommand } else { $service.ProdCommand }

    Write-Info "Starting $name..."

    if ($port) {
        Write-Host "  Port: $port" -ForegroundColor Gray
    } else {
        Write-Host "  (Background worker - no port)" -ForegroundColor Gray
    }

    # Start as background job
    $job = Start-Job -Name $name -ScriptBlock {
        param($root, $cmd)
        Set-Location $root
        Invoke-Expression $cmd
    } -ArgumentList $projectRoot, $command

    $jobs += @{ Name = $name; Job = $job; Port = $port; HealthCheck = $service.HealthCheck }

    # Small delay between service starts
    Start-Sleep -Seconds 2
}

Write-Header "Waiting for Services to Start"

# Wait for services to be ready (with timeout)
$timeout = 60  # seconds
$startTime = Get-Date

foreach ($svc in $jobs) {
    $name = $svc.Name
    $healthCheck = $svc.HealthCheck

    if (-not $healthCheck) {
        Write-Info "$name is a background worker (no health check)"
        continue
    }

    Write-Host "Checking $name at $healthCheck..." -NoNewline

    $ready = $false
    while (-not $ready -and ((Get-Date) - $startTime).TotalSeconds -lt $timeout) {
        try {
            $response = Invoke-WebRequest -Uri $healthCheck -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                $ready = $true
                Write-Success " Ready!"
            }
        } catch {
            Write-Host "." -NoNewline
            Start-Sleep -Seconds 2
        }
    }

    if (-not $ready) {
        Write-Failure " Timeout waiting for $name"
    }
}

Write-Header "Service Status"

# Display status table
Write-Host "`nService          Port      Status     URL" -ForegroundColor White
Write-Host "-------          ----      ------     ---" -ForegroundColor Gray

foreach ($svc in $jobs) {
    $name = $svc.Name.PadRight(16)
    $port = if ($svc.Port) { $svc.Port.ToString().PadRight(10) } else { "N/A".PadRight(10) }
    $job = $svc.Job

    $status = if ($job.State -eq "Running") { "Running" } else { $job.State }
    $statusColor = if ($status -eq "Running") { "Green" } else { "Red" }

    $url = if ($svc.HealthCheck) { $svc.HealthCheck } else { "(worker)" }

    Write-Host "$name $port " -NoNewline
    Write-Host $status.PadRight(10) -ForegroundColor $statusColor -NoNewline
    Write-Host " $url"
}

Write-Host ""
Write-Info "Press Ctrl+C to stop all services"
Write-Host ""

# Function to cleanup jobs on exit
function Stop-AllServices {
    Write-Header "Stopping All Services"
    foreach ($svc in $jobs) {
        Write-Info "Stopping $($svc.Name)..."
        Stop-Job -Job $svc.Job -ErrorAction SilentlyContinue
        Remove-Job -Job $svc.Job -Force -ErrorAction SilentlyContinue
    }
    Write-Success "All services stopped"
}

# Register cleanup on Ctrl+C
try {
    # Keep script running and show logs
    while ($true) {
        Start-Sleep -Seconds 5

        # Check if any jobs have failed
        foreach ($svc in $jobs) {
            if ($svc.Job.State -eq "Failed") {
                Write-Failure "$($svc.Name) has failed!"
                Receive-Job -Job $svc.Job
            }
        }
    }
} finally {
    Stop-AllServices
}

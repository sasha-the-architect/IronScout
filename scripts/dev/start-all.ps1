# start-all.ps1
# Start all services locally to verify they run correctly
# Usage: .\scripts\dev\start-all.ps1
#
# Options:
#   -SkipBuild    Skip building before starting
#   -Only         Start only specific services (e.g., -Only web,api)
#   -DevMode      Use dev mode (hot reload) instead of production builds
#   -ShowLogs     Stream logs from all services (uses separate windows)
#   -SkipEnvCheck Skip environment variable validation

param(
    [switch]$SkipBuild,
    [switch]$DevMode,
    [switch]$ShowLogs,
    [switch]$SkipEnvCheck,
    [string[]]$Only
)

$ErrorActionPreference = "Continue"

# Colors for output
function Write-Success { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green }
function Write-Failure { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warning { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Header { param($msg) Write-Host "`n========== $msg ==========`n" -ForegroundColor Yellow }

# Change to project root (scripts/dev -> scripts -> project root)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsDir = Split-Path -Parent $scriptDir
$projectRoot = Split-Path -Parent $scriptsDir
Set-Location $projectRoot
Write-Info "Project root: $projectRoot"

# ============================================================================
# ENVIRONMENT VARIABLE VALIDATION
# ============================================================================
# Check for shell environment variables that might conflict with .env files.
# dotenv does NOT override existing env vars, so stale shell vars cause issues.

if (-not $SkipEnvCheck) {
    Write-Header "Checking Environment Variables"

    # List of env vars that should come from .env files, not the shell
    $conflictingEnvVars = @(
        @{ Name = "DATABASE_URL"; Description = "Database connection string" },
        @{ Name = "REDIS_HOST"; Description = "Redis server host" },
        @{ Name = "REDIS_PORT"; Description = "Redis server port" },
        @{ Name = "REDIS_PASSWORD"; Description = "Redis password" },
        @{ Name = "NEXTAUTH_SECRET"; Description = "NextAuth secret key" },
        @{ Name = "STRIPE_SECRET_KEY"; Description = "Stripe API key" },
        @{ Name = "OPENAI_API_KEY"; Description = "OpenAI API key" },
        @{ Name = "ANTHROPIC_API_KEY"; Description = "Anthropic API key" },
        @{ Name = "RESEND_API_KEY"; Description = "Resend email API key" }
    )

    $foundConflicts = @()

    foreach ($envVar in $conflictingEnvVars) {
        $value = [Environment]::GetEnvironmentVariable($envVar.Name)
        if ($value) {
            $maskedValue = if ($value.Length -gt 20) {
                $value.Substring(0, 10) + "..." + $value.Substring($value.Length - 5)
            } else {
                $value.Substring(0, [Math]::Min(5, $value.Length)) + "***"
            }
            $foundConflicts += @{
                Name = $envVar.Name
                Description = $envVar.Description
                Value = $maskedValue
            }
        }
    }

    if ($foundConflicts.Count -gt 0) {
        Write-Warning "Found environment variables that may conflict with .env files:"
        Write-Host ""
        foreach ($conflict in $foundConflicts) {
            Write-Host "  $($conflict.Name)" -ForegroundColor Red -NoNewline
            Write-Host " = $($conflict.Value)" -ForegroundColor Gray
            Write-Host "    $($conflict.Description)" -ForegroundColor DarkGray
        }
        Write-Host ""
        Write-Warning "These shell environment variables will OVERRIDE values in .env files!"
        Write-Warning "This can cause services to connect to wrong databases/services."
        Write-Host ""
        Write-Info "To fix, run one of these commands:"
        Write-Host ""
        Write-Host "  # Clear all conflicting env vars for this session:" -ForegroundColor Cyan
        foreach ($conflict in $foundConflicts) {
            Write-Host "  Remove-Item Env:$($conflict.Name)" -ForegroundColor White
        }
        Write-Host ""
        Write-Host "  # Or skip this check (not recommended):" -ForegroundColor Cyan
        Write-Host "  .\scripts\dev\start-all.ps1 -SkipEnvCheck" -ForegroundColor White
        Write-Host ""

        $response = Read-Host "Clear these environment variables and continue? (Y/n)"
        if ($response -eq "" -or $response -match "^[Yy]") {
            foreach ($conflict in $foundConflicts) {
                Remove-Item "Env:$($conflict.Name)" -ErrorAction SilentlyContinue
                Write-Success "Cleared $($conflict.Name)"
            }
            Write-Host ""
        } else {
            Write-Failure "Aborting. Please clear the environment variables manually."
            exit 1
        }
    } else {
        Write-Success "No conflicting environment variables found"
    }
}

# Track background jobs
$jobs = @()

# Define services with their start commands (HTTP only for local dev)
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
    },
    @{
        Name = "bullboard"
        Port = 3939
        DevCommand = "pnpm --filter @ironscout/harvester bullboard:dev"
        ProdCommand = "pnpm --filter @ironscout/harvester bullboard"
        HealthCheck = "http://localhost:3939/health"
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
    & "$projectRoot\scripts\build\build-all.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Failure "Build failed. Fix errors before starting services."
        exit 1
    }
}

Write-Header "Starting Services"

# Create logs directory
$logsDir = "$projectRoot\logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

# Start each service
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

    if ($ShowLogs) {
        # Start in a new window with visible logs
        $logFile = "$logsDir\$name.log"
        Write-Host "  Logs: $logFile" -ForegroundColor Gray

        Start-Process powershell -ArgumentList @(
            "-NoExit",
            "-Command",
            "Set-Location '$projectRoot'; Write-Host 'Starting $name...' -ForegroundColor Cyan; $command 2>&1 | Tee-Object -FilePath '$logFile'"
        )

        $jobs += @{ Name = $name; Job = $null; Port = $port; HealthCheck = $service.HealthCheck; LogFile = $logFile }
    } else {
        # Start as background job (logs buffered)
        $job = Start-Job -Name $name -ScriptBlock {
            param($root, $cmd)
            Set-Location $root
            Invoke-Expression $cmd
        } -ArgumentList $projectRoot, $command

        $jobs += @{ Name = $name; Job = $job; Port = $port; HealthCheck = $service.HealthCheck }
    }

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

    # Handle both ShowLogs mode (no job) and background job mode
    if ($ShowLogs) {
        $status = "Window"
        $statusColor = "Cyan"
    } elseif ($job) {
        $status = if ($job.State -eq "Running") { "Running" } else { $job.State }
        $statusColor = if ($status -eq "Running") { "Green" } else { "Red" }
    } else {
        $status = "Unknown"
        $statusColor = "Yellow"
    }

    $url = if ($svc.HealthCheck) { $svc.HealthCheck } else { "(worker)" }

    Write-Host "$name $port " -NoNewline
    Write-Host $status.PadRight(10) -ForegroundColor $statusColor -NoNewline
    Write-Host " $url"
}

Write-Host ""
Write-Info "Bull Board (Queue Monitor): http://localhost:3939/admin/queues"
Write-Host "  Auth: admin / ironscout2024" -ForegroundColor Gray
Write-Host ""
Write-Info "Press Ctrl+C to stop all services"
Write-Host ""

# Function to cleanup jobs on exit
function Stop-AllServices {
    Write-Header "Stopping All Services"
    if ($ShowLogs) {
        Write-Info "Services are running in separate windows."
        Write-Info "Use .\scripts\dev\stop-all.ps1 to stop them."
    } else {
        foreach ($svc in $jobs) {
            if ($svc.Job) {
                Write-Info "Stopping $($svc.Name)..."
                Stop-Job -Job $svc.Job -ErrorAction SilentlyContinue
                Remove-Job -Job $svc.Job -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Success "All services stopped"
    }
}

# Register cleanup on Ctrl+C
try {
    if ($ShowLogs) {
        # In ShowLogs mode, services run in separate windows
        Write-Info "Services started in separate windows. Check each window for logs."
        Write-Info "Use .\scripts\dev\stop-all.ps1 to stop all services."
    } else {
        # Keep script running and monitor background jobs
        while ($true) {
            Start-Sleep -Seconds 5

            # Check if any jobs have failed
            foreach ($svc in $jobs) {
                if ($svc.Job -and $svc.Job.State -eq "Failed") {
                    Write-Failure "$($svc.Name) has failed!"
                    Receive-Job -Job $svc.Job
                }
            }
        }
    }
} finally {
    Stop-AllServices
}

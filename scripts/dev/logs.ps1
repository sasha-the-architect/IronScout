# logs.ps1
# View logs from running IronScout services
# Usage: .\scripts\dev\logs.ps1 [service]
#
# Examples:
#   .\scripts\dev\logs.ps1          # List available services
#   .\scripts\dev\logs.ps1 web      # Tail web logs
#   .\scripts\dev\logs.ps1 api      # Tail api logs
#   .\scripts\dev\logs.ps1 -All     # Show recent logs from all services

param(
    [string]$Service,
    [switch]$All,
    [int]$Lines = 50
)

$ErrorActionPreference = "Continue"

# Colors for output
function Write-Success { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green }
function Write-Failure { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Header { param($msg) Write-Host "`n========== $msg ==========`n" -ForegroundColor Yellow }

# Change to project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsDir = Split-Path -Parent $scriptDir
$projectRoot = Split-Path -Parent $scriptsDir
$logsDir = "$projectRoot\logs"

$services = @("api", "web", "admin", "dealer", "harvester")

# Check for background jobs first
function Get-ServiceLogs {
    param($svcName)

    # Try log file first
    $logFile = "$logsDir\$svcName.log"
    if (Test-Path $logFile) {
        return @{ Type = "file"; Path = $logFile }
    }

    # Try background job
    $job = Get-Job -Name $svcName -ErrorAction SilentlyContinue
    if ($job) {
        return @{ Type = "job"; Job = $job }
    }

    return $null
}

if (-not $Service -and -not $All) {
    Write-Header "Available Services"

    foreach ($svc in $services) {
        $logs = Get-ServiceLogs $svc
        if ($logs) {
            if ($logs.Type -eq "file") {
                $size = (Get-Item $logs.Path).Length
                $sizeStr = if ($size -gt 1MB) { "{0:N2} MB" -f ($size / 1MB) }
                          elseif ($size -gt 1KB) { "{0:N2} KB" -f ($size / 1KB) }
                          else { "$size B" }
                Write-Host "  $($svc.PadRight(12)) " -NoNewline
                Write-Success "Log file ($sizeStr)"
            } else {
                Write-Host "  $($svc.PadRight(12)) " -NoNewline
                Write-Success "Background job ($($logs.Job.State))"
            }
        } else {
            Write-Host "  $($svc.PadRight(12)) " -NoNewline
            Write-Host "Not running" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Info "Usage: .\scripts\dev\logs.ps1 <service>"
    Write-Info "       .\scripts\dev\logs.ps1 -All"
    exit 0
}

if ($All) {
    foreach ($svc in $services) {
        $logs = Get-ServiceLogs $svc
        if ($logs) {
            Write-Header "$svc Logs (last $Lines lines)"
            if ($logs.Type -eq "file") {
                Get-Content $logs.Path -Tail $Lines
            } else {
                Receive-Job -Job $logs.Job -Keep | Select-Object -Last $Lines
            }
        }
    }
    exit 0
}

# Single service
$logs = Get-ServiceLogs $Service

if (-not $logs) {
    Write-Failure "Service '$Service' not found or not running"
    Write-Info "Available services: $($services -join ', ')"
    exit 1
}

Write-Header "$Service Logs"

if ($logs.Type -eq "file") {
    Write-Info "Tailing $($logs.Path) (Ctrl+C to stop)"
    Write-Host ""
    Get-Content $logs.Path -Wait -Tail $Lines
} else {
    Write-Info "Showing logs from background job"
    Write-Host ""
    # For jobs, we can only show what's been output so far
    Receive-Job -Job $logs.Job -Keep

    Write-Host ""
    Write-Info "Note: Background jobs buffer output. For real-time logs, restart with -ShowLogs flag:"
    Write-Host "  .\scripts\dev\start-all.ps1 -DevMode -ShowLogs" -ForegroundColor Gray
}

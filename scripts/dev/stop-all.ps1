# stop-all.ps1
# Stop all running IronScout services
# Usage: .\scripts\dev\stop-all.ps1
#
# Options:
#   -Force    Skip graceful shutdown and force kill immediately
#   -Verbose  Show more details about what's being checked

param(
    [switch]$Force,
    [switch]$VerboseOutput
)

$ErrorActionPreference = "SilentlyContinue"

# Colors for output
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Failure { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warning { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Header { param($msg) Write-Host "`n========== $msg ==========`n" -ForegroundColor Yellow }
function Write-Debug { param($msg) if ($VerboseOutput) { Write-Host "[DEBUG] $msg" -ForegroundColor Gray } }

Write-Header "Stopping All Services"

if ($Force) {
    Write-Warning "Force mode enabled - killing immediately"
}

$stoppedCount = 0
$myPID = $PID  # Current PowerShell process ID
Write-Debug "My PID: $myPID (will not kill self)"

# Define ports used by services
$servicePorts = @(
    @{ Name = "API"; Port = 8000 },
    @{ Name = "Web"; Port = 3000 },
    @{ Name = "Web (alt)"; Port = 3001 },
    @{ Name = "Web (alt)"; Port = 3004 },
    @{ Name = "Admin"; Port = 3002 },
    @{ Name = "Dealer"; Port = 3003 }
)

# Method 1: Stop by port using netstat (works without admin)
Write-Info "Checking ports..."

foreach ($service in $servicePorts) {
    $name = $service.Name
    $port = $service.Port

    Write-Debug "Checking $name on port $port..."

    # Use netstat to find process on port (works without admin)
    # Match patterns like ":3000 " or ":3000\t" to avoid matching :30001
    $netstatOutput = netstat -ano 2>$null | Where-Object { $_ -match ":${port}\s" -and $_ -match "LISTENING" }

    if ($netstatOutput) {
        foreach ($line in $netstatOutput) {
            # Extract PID from last column
            $parts = $line.ToString().Trim() -split '\s+'
            $pid = $parts[-1]

            if ($pid -and $pid -match '^\d+$' -and [int]$pid -gt 0) {
                # Skip our own process
                if ([int]$pid -eq $myPID) {
                    Write-Debug "  Skipping own PID $pid"
                    continue
                }
                $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Info "Stopping $name (PID: $pid, Process: $($process.ProcessName))..."
                    try {
                        Stop-Process -Id $pid -Force
                        Start-Sleep -Milliseconds 300
                        $stillRunning = Get-Process -Id $pid -ErrorAction SilentlyContinue
                        if (-not $stillRunning) {
                            Write-Success "  Stopped $name on port $port"
                            $stoppedCount++
                        } else {
                            Write-Failure "  Failed to stop PID $pid"
                        }
                    } catch {
                        Write-Failure "  Error stopping PID $pid : $_"
                    }
                }
            }
        }
    } else {
        Write-Debug "  Port $port not in use"
    }
}

# Method 2: Find and kill node processes running from IronScout folders
Write-Info "Checking Node.js processes..."

# Broaden process scan to catch wrappers (pnpm/npm/bun/next/cmd/powershell)
$procNames = @("node","pnpm","npm","bun","next","cmd","powershell")
$procCandidates = Get-Process -Name $procNames -ErrorAction SilentlyContinue

if ($procCandidates) {
    foreach ($proc in $procCandidates) {
        # Skip our own process
        if ($proc.Id -eq $myPID) {
            continue
        }
        try {
            # Get command line of the process
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue).CommandLine

            Write-Debug "  PID $($proc.Id): $cmdLine"

            # Check if it's one of our processes (IronScout or apps folder)
            if ($cmdLine -and (
                $cmdLine -match "IronScout" -or
                $cmdLine -match "ironscout" -or
                $cmdLine -match "@ironscout" -or
                $cmdLine -match "apps[\\/](web|api|admin|merchant|harvester)" -or
                $cmdLine -match "dist[\\/]index\.js" -or   # API server
                $cmdLine -match "dist[\\/]worker\.js"      # Harvester worker
            )) {
                # Determine app name
                $appName = if ($cmdLine -match "harvester" -or $cmdLine -match "dist[\\/]worker\.js") { "Harvester" }
                           elseif ($cmdLine -match "apps[\\/]web" -or $cmdLine -match "next dev") { "Web" }
                           elseif ($cmdLine -match "apps[\\/]api" -or $cmdLine -match "dist[\\/]index\.js") { "API" }
                           elseif ($cmdLine -match "apps[\\/]admin") { "Admin" }
                           elseif ($cmdLine -match "apps[\\/]merchant") { "Merchant" }
                           else { "Node" }

                Write-Info "Stopping $appName node process (PID: $($proc.Id))..."
                try {
                    Stop-Process -Id $proc.Id -Force
                    Start-Sleep -Milliseconds 300
                    $stillRunning = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
                    if (-not $stillRunning) {
                        Write-Success "  Stopped $appName"
                        $stoppedCount++
                    } else {
                        Write-Failure "  Failed to stop PID $($proc.Id)"
                    }
                } catch {
                    Write-Failure "  Error: $_"
                }
            }
        } catch {
            Write-Debug "  Could not check PID $($proc.Id)"
        }
    }
} else {
    Write-Debug "  No Node.js processes found"
}

# Method 3: Stop PowerShell background jobs
Write-Info "Checking background jobs..."

try {
    $jobs = Get-Job | Where-Object {
        $_.Name -in @("api", "web", "admin", "merchant", "harvester") -or
        $_.Command -match "IronScout|ironscout"
    }
    if ($jobs) {
        foreach ($job in $jobs) {
            Write-Info "  Stopping job: $($job.Name)..."
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
            $stoppedCount++
            Write-Success "  Stopped job $($job.Name)"
        }
    } else {
        Write-Debug "  No matching background jobs"
    }
} catch {
    Write-Debug "  Error checking jobs: $_"
}

# Summary
Write-Header "Summary"

if ($stoppedCount -gt 0) {
    Write-Success "Stopped $stoppedCount process(es)"
} else {
    Write-Info "No running services found"
}

# Verify ports are free
Write-Host ""
Write-Info "Port status:"
foreach ($service in $servicePorts) {
    $netstatCheck = netstat -ano 2>$null | Where-Object { $_ -match ":$($service.Port)\s" -and $_ -match "LISTENING" }
    if ($netstatCheck) {
        Write-Warning "  Port $($service.Port) ($($service.Name)) - STILL IN USE"
    } else {
        Write-Host "  Port $($service.Port) ($($service.Name)) - free" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Info "Usage: .\scripts\dev\stop-all.ps1 [-Force] [-VerboseOutput]"

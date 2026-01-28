# pull-from-lovable.ps1
# Pull Lovable changes back into the monorepo
#
# Usage: .\scripts\lovable\pull-from-lovable.ps1

$ErrorActionPreference = "Stop"

$REMOTE_NAME = "lovable"
$REMOTE_URL = "https://github.com/jeb-scarbrough/ironscout-www-lovable.git"
$PREFIX = "apps/www"

Write-Host "==> Pulling Lovable changes into apps/www..." -ForegroundColor Cyan

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "❌ Error: You have uncommitted changes. Please commit or stash them first." -ForegroundColor Red
    exit 1
}

# Ensure remote exists
$remoteExists = git remote get-url $REMOTE_NAME 2>$null
if (-not $remoteExists) {
    Write-Host "==> Adding remote '$REMOTE_NAME'..." -ForegroundColor Yellow
    git remote add $REMOTE_NAME $REMOTE_URL
}

# Fetch latest from Lovable
Write-Host "==> Fetching from $REMOTE_NAME..." -ForegroundColor Yellow
git fetch $REMOTE_NAME

# Pull with subtree
Write-Host "==> Pulling changes into $PREFIX..." -ForegroundColor Yellow
git subtree pull --prefix=$PREFIX $REMOTE_NAME main --squash -m "chore: sync www changes from Lovable"

Write-Host ""
Write-Host "✅ Successfully pulled Lovable changes into apps/www!" -ForegroundColor Green
Write-Host ""
Write-Host "Review changes with: git diff HEAD~1" -ForegroundColor Gray

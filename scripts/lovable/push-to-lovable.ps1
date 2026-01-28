# push-to-lovable.ps1
# Push apps/www changes from monorepo to Lovable repo
#
# Usage: .\scripts\lovable\push-to-lovable.ps1

$ErrorActionPreference = "Stop"

$REMOTE_NAME = "lovable"
$REMOTE_URL = "https://github.com/jeb-scarbrough/ironscout-www-lovable.git"
$PREFIX = "apps/www"
$BRANCH = "lovable-www"

Write-Host "==> Pushing apps/www to Lovable repo..." -ForegroundColor Cyan

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

# Create subtree split
Write-Host "==> Creating subtree split from $PREFIX..." -ForegroundColor Yellow
git subtree split --prefix=$PREFIX -b $BRANCH

# Push to Lovable repo
Write-Host "==> Pushing to $REMOTE_NAME main branch..." -ForegroundColor Yellow
git push $REMOTE_NAME "${BRANCH}:main" --force-with-lease

Write-Host ""
Write-Host "✅ Successfully pushed apps/www to Lovable repo!" -ForegroundColor Green
Write-Host "   View at: https://github.com/jeb-scarbrough/ironscout-www-lovable" -ForegroundColor Gray

# Start the doc watcher with optional Slack webhook and polling interval.
# Usage examples:
#   ./start-watcher.ps1                       # 120s interval, no Slack
#   ./start-watcher.ps1 -IntervalSeconds 60   # 60s interval
#   ./start-watcher.ps1 -SlackWebhook "<url>" # send Slack alerts
#   ./start-watcher.ps1 -SlackWebhook "<url>" -IntervalSeconds 90
param(
  [string]$SlackWebhook,
  [int]$IntervalSeconds = 120,
  [switch]$NoSlack
)

if ($NoSlack) {
  Write-Host "Slack disabled for this run (--no-slack)."
} elseif ($SlackWebhook) {
  $env:DOC_WATCHER_SLACK_WEBHOOK = $SlackWebhook
  Write-Host "DOC_WATCHER_SLACK_WEBHOOK set for this session."
} elseif ($env:DOC_WATCHER_SLACK_WEBHOOK) {
  Write-Host "Using existing DOC_WATCHER_SLACK_WEBHOOK from environment."
} else {
  Write-Host "No Slack webhook provided. Run with -SlackWebhook <url> to enable Slack alerts, or -NoSlack to suppress this notice."
}

$argsList = @('doc:watch:head', "$IntervalSeconds")
if ($NoSlack) {
  $argsList += '--no-slack'
}

Write-Host "Starting doc watcher (interval: $IntervalSeconds seconds)..."
Write-Host "Command: pnpm $($argsList -join ' ')"
& pnpm @argsList

if ($LASTEXITCODE -ne 0) {
  Write-Host "doc watcher exited with code $LASTEXITCODE"
}

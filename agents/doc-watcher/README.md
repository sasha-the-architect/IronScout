# Doc Watcher Agent

This Codex-friendly agent runs the documentation drift check so you can spot when code changes likely require updates to `docs/`.

## What it does
- Reads the latest git commit (message + diff).
- Applies heuristics for drift-prone areas (schema/DB, API contracts, search/ranking, tiers/pricing/subscriptions, auth/roles, env/deploy/config, alerts/notifications, queues/schedules, data visibility/lifecycle, metrics/monitoring, seeds/fixtures, business/product logic).
- Prints a concise report with candidate docs to review.

## Requirements
- pnpm
- tsx (available via `pnpm exec tsx ...`)
- Run from the repo root so git commands work.

## Run as a Codex agent
```
pnpm exec tsx agents/doc-watcher/index.ts
```
Register in your Codex config as:
```
"doc-watcher": {
  "command": "pnpm exec tsx agents/doc-watcher/index.ts",
  "description": "Analyze latest commit for doc drift"
}
```

## Helpful scripts
- `pnpm doc:watch` - run the watcher once.
- `pnpm doc:watch:head` - poll HEAD and run on change.
- Acknowledge after updating docs: `pnpm doc:watch --ack`
- Block pushes on drift: `pnpm doc:watch --fail-on-drift` (used by pre-push hook)
- PowerShell helper (with optional Slack + interval): `./start-watcher.ps1 [-IntervalSeconds 90] [-SlackWebhook <url>] [-NoSlack]`

## Git hooks (optional)
Copy `.githooks/post-commit.sample` and/or `.githooks/post-merge.sample` to `.git/hooks/` and `chmod +x` to run the watcher after commits/merges.
Copy `.githooks/pre-push.sample` to `.git/hooks/pre-push` and `chmod +x` to block pushes when drift is unacknowledged.

## Slack notifications (optional)
- Create a Slack app with the “Incoming Webhooks” feature (from Slack’s marketplace link), enable it, add a webhook to your channel, and set `DOC_WATCHER_SLACK_WEBHOOK` to that URL.
- The watcher sends a message when it detects drift and hasn’t been acknowledged for the current HEAD.
- Suppress Slack for a run with `--no-slack`.
- Mark current HEAD as addressed with `pnpm doc:watch --ack`.

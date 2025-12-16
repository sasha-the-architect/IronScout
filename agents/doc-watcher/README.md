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
- Create a Slack app with the "Incoming Webhooks" feature (from Slack's marketplace link), enable it, add a webhook to your channel, and set `DOC_WATCHER_SLACK_WEBHOOK` to that URL.
- The watcher sends a message when it detects drift and hasn't been acknowledged for the current HEAD.
- Suppress Slack for a run with `--no-slack`.
- Mark current HEAD as addressed with `pnpm doc:watch --ack`.

## How acknowledgment works
The watcher uses a **content-based hash** (commit message + changed files) rather than the raw commit SHA. This means:

- You can acknowledge drift, then amend the commit to include the state file, without invalidating the acknowledgment
- The `.doc-watcher-state.json` file is automatically excluded from the content hash
- This avoids the "amend cycle" where acknowledging → committing state → hash changes → acknowledgment invalid

**Workflow:**
1. Make your commit with code changes
2. Pre-push hook detects potential doc drift
3. Run `pnpm doc:watch --ack` to acknowledge
4. Amend or create a new commit to include `.doc-watcher-state.json`
5. Push succeeds because the content hash still matches

## Future enhancements

### TODO: Slack interactive acknowledgment
Add ability to acknowledge doc drift directly from Slack by clicking a button in the notification message. This requires:

1. **Slack App with Interactivity** - Configure app with a Request URL endpoint
2. **API endpoint** - Add `/api/hooks/slack-actions` route to handle button clicks
3. **Shared state** - Move state from local `.doc-watcher-state.json` to Redis/database so the API can update it
4. **Button payload** - Update `sendSlack()` to include Block Kit interactive button

Benefits: Faster workflow for acknowledging false positives without switching to terminal.

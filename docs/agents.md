# Agents Overview

Lightweight Codex-friendly agents available in this repo.

## Available Agents

| Agent | Path | Purpose | How to run |
|-------|------|---------|------------|
| `doc-watcher` | `agents/doc-watcher/` | Flags likely documentation drift from the latest git commit. | `pnpm doc:watch` |

## doc-watcher
- **What it does:** Reads the latest git commit (message + diff), applies heuristics (schema/DB, API contracts, search/ranking, tiers/pricing/subscriptions, auth/roles, env/deploy/config, alerts/notifications, queues/schedules, data visibility/lifecycle, metrics/monitoring, seeds/fixtures, business/product logic), and prints candidate docs to review.
- **Run once:** `pnpm doc:watch`
- **Poll while coding:** `pnpm doc:watch:head` (default 120s; pass a number for seconds, e.g., `pnpm doc:watch:head 60`)
- **As Codex agent:** `codex run doc-watcher` (registered in `codex.config.json`)
- **Hooks (optional):** Copy `.githooks/post-commit.sample` / `.githooks/post-merge.sample` to `.git/hooks/` and `chmod +x` to auto-run after commits/merges.
- **Entry:** `agents/doc-watcher/index.ts`
- **Config:** `codex.config.json` maps `doc-watcher` to `pnpm exec tsx agents/doc-watcher/index.ts`

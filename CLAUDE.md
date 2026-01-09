# CLAUDE.md

This file provides **operational guidance for Claude Code** when working in the IronScout repository.

This file is **subordinate to `AGENTS.md`**.
If there is any conflict, **AGENTS.md always wins**.

Claude must treat IronScout as a **constraint-driven system**, not a feature playground.

---

## Authoritative Documentation

All authoritative documentation lives in:

- `AGENTS.md` (root) — agent rules and invariants
- `context/` — product, architecture, operations, and reference
- `context/decisions/` — Architectural Decision Records (ADRs)

The legacy `docs/` folder is deprecated and must not be referenced unless explicitly instructed.

Start with:
1. `AGENTS.md`
2. `context/README.md`
3. `context/decisions/ADR-*.md`

---

## What IronScout Is (v1)

IronScout is a **pricing intelligence and discovery platform** for ammunition.

It provides:
- Canonical product grouping
- Cross-retailer and eligible-dealer price comparison
- Historical price context
- Alerts for price and availability changes
- Assistive AI for search interpretation and explanations

It does **not**:
- Make purchase recommendations
- Provide deal scores or verdicts
- Predict future prices
- Guarantee outcomes or savings
- Automate dealer pricing decisions

All decisions remain with the user.

---

## System Overview

IronScout is a pnpm monorepo with multiple deployable apps:

1. `apps/api` — Backend API (search, enforcement, alerts)
2. `apps/web` — Consumer-facing Next.js app
3. `apps/dealer` — Dealer portal (feeds, visibility, context)
4. `apps/admin` — Admin and operations portal
5. `apps/harvester` — Background ingestion worker (BullMQ)

The frontend **never** accesses the database directly.
All enforcement happens server-side.

---

## Non-Negotiable Constraints

Claude must **never violate** the following:

- Tier enforcement is server-side only (ADR-002)
- Dealer visibility is filtered at query time (ADR-005)
- Price history is append-only (ADR-004)
- Fail closed on eligibility or trust ambiguity (ADR-009)
- AI is assistive only, never prescriptive (ADR-003)
- No recommendations, verdicts, or deal scores (ADR-006)
- Premium increases information density, not guarantees (ADR-007)
- Harvester scheduler must be singleton or lock-protected (ADR-001)
- Routine ops must not require prod code changes (ADR-010)

If a request requires breaking one of these, stop and escalate.

---

## Harvester Safety Rules

The Harvester is trust-critical.

- Scheduling must be singleton
- Do not run multiple schedulers
- Use `HARVESTER_SCHEDULER_ENABLED=false` by default in local dev
- Never duplicate ingestion or mutate historical data
- Never write data for ineligible dealers

If ingestion behavior is ambiguous, fail closed.

---

## AI Usage Rules

AI may:
- Assist search intent parsing
- Assist ranking and grouping
- Generate optional explanations

AI must not:
- Recommend purchases
- Suggest actions
- Imply certainty or optimality
- Change factual outputs

AI features must degrade safely and be removable.

---

## Tier and Eligibility Rules

- Tier and eligibility are resolved from verified auth context
- Client-provided headers must not be trusted
- UI hiding is insufficient
- Ambiguity defaults to restricted access

All tier behavior is defined in:
- `context/04_pricing_and_tiers.md`

---

## Commands and Environment

Claude should not invent commands.

Use:
- `context/reference/commands.md`
- `context/reference/env.md`

Key warnings:
- Never point local dev at staging or production DB/Redis
- Never use real billing credentials locally
- Never run multiple Harvester schedulers

---

## Testing Expectations

Tests must protect:
- Tier enforcement
- Dealer eligibility
- Append-only history
- Alert correctness
- Fail-closed behavior

See:
- `context/reference/testing.md`

Do not add tests that expand scope or weaken constraints.

---

## How to Proceed When Unsure

If documentation:
- Conflicts
- Is ambiguous
- Appears outdated
- Does not cover the scenario

Then:
1. Stop
2. Surface the conflict
3. Propose clarification or a new ADR

Do not guess.

---

## Guiding Principle

> IronScout optimizes for trust, correctness, and operability over cleverness.

If forced to choose, choose **safe and boring** over impressive and risky.
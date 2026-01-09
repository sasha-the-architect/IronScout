# AGENTS.md

This file provides **authoritative instructions for coding agents** (e.g. Codex-style tools) working on the IronScout repository.

Agents must treat this file as **higher priority than intuition, inference, or pattern matching**.

If instructions here conflict with code, docs, or comments, **stop and surface the conflict**.

---

## What IronScout Is

IronScout is an AI-native **pricing intelligence and discovery platform** for ammunition.

It:
- Aggregates fragmented pricing data
- Normalizes listings into canonical products
- Provides historical price context
- Enforces strict trust, eligibility, and tier boundaries

It does **not**:
- Make purchase recommendations
- Predict prices
- Guarantee outcomes
- Automate merchant pricing decisions

Context and constraints live in `context/`.  
Decisions live in `decisions/`.

---

## Where Truth Lives (Read Order)

Before making changes, agents must read in this order:

1. `context/00_public_promises.md`
2. `context/01_product_overview.md`
3. `context/02_v1_scope_and_cut_list.md`
4. `context/03_release_criteria.md`
5. `context/05_security_and_trust.md`
6. `context/decisions/ADR-*.md`
7. `context/reference/*`

If a change would violate any of the above, **do not implement it**.

---

## System Map (High-Level)

IronScout is a multi-app system:

- `apps/api` — Backend API, enforcement, search, alerts
- `apps/web` — Consumer UI
- `apps/merchant` — Merchant portal
- `apps/admin` — Admin / ops portal
- `apps/harvester` — Ingestion worker (BullMQ)

Shared data lives in Postgres.  
Queues live in Redis.

---

## Non-Negotiable Invariants

Agents must **never break** the following:

- Server-side tier enforcement only (ADR-002)
- Retailer visibility filtered at query time (ADR-005)
- Append-only price history (ADR-004)
- Fail closed on ambiguity (ADR-009)
- No recommendations, verdicts, or deal scores (ADR-006)
- AI is assistive only (ADR-003)
- Harvester scheduler must be singleton or lock-protected (ADR-001)

If a task requires violating one of these, stop and request a new ADR.

---

## Allowed Changes

Agents may:
- Refactor code without changing behavior
- Add tests that enforce existing constraints
- Improve observability and safety
- Tighten enforcement logic
- Remove dead or misleading code paths
- Improve documentation for clarity

Agents must prefer **removal over expansion** when uncertain.

---

## Disallowed Changes (v1)

Agents must not:
- Add recommendations, verdicts, or “deal scores”
- Add usage-based billing UI
- Relax eligibility or tier enforcement
- Introduce client-trusted identity or tier logic
- Add real-time guarantees or SLAs
- Add autonomous agents or decision-making systems

If requested, flag as out-of-scope per `context/02_v1_scope_and_cut_list.md`.

---

## How to Work Safely

### Before Coding

- Identify which ADRs apply
- Identify which release criteria could be affected
- Identify trust boundaries touched

If unclear, stop.

---

### While Coding

- Enforce rules server-side
- Prefer explicit checks over implicit behavior
- Log and surface ambiguous state
- Default to restricted behavior

Never assume “happy path” data.

---

### After Coding

- Add or update tests if trust boundaries were touched
- Verify no public-facing copy exceeds `00_public_promises.md`
- Confirm behavior matches scope and pricing docs

---

## How to Run the System

Refer to:
- `context/reference/commands.md`
- `context/reference/env.md`

Key warnings:
- Do not run harvester scheduler in multiple instances
- Do not point local dev at staging or production DB/Redis
- Do not use real billing credentials locally

---

## How to Handle Ambiguity

If:
- Docs conflict
- Code contradicts docs
- Behavior is unclear
- A feature seems “half-built”

Then:
1. Stop implementation
2. Document the conflict
3. Propose resolution (ADR or doc update)

Do not guess.

---

## Tests and Validation

Tests must protect:
- Eligibility enforcement
- Tier enforcement
- Append-only history
- Alert correctness
- Fail-closed behavior

See `context/reference/testing.md`.

If a test does not protect trust or scope, reconsider writing it.

---

## Output Expectations

Agents should:
- Make minimal, focused changes
- Explain reasoning in commit messages or PR descriptions
- Reference ADRs and context docs explicitly

Agents should not:
- Introduce speculative features
- Expand scope silently
- Optimize prematurely

---

## Guiding Principle

> IronScout values correctness, trust, and operability over cleverness.

If an agent must choose between being impressive and being safe, **choose safe**.

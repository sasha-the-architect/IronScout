# Scaling and Limits

This document defines IronScout’s **explicit scaling assumptions, limits, and non-goals for v1**.  
It exists to prevent accidental overreach, protect trust, and keep the system operable by a small team.

This is not a growth roadmap. It is a set of guardrails.

---

## Scaling Philosophy

IronScout v1 is designed to:
- Scale **correctly before scaling large**
- Prefer determinism over throughput
- Fail safely rather than degrade silently
- Keep operational complexity proportional to team size

v1 optimizes for **clarity, trust, and debuggability**, not peak load.

---

## Explicit v1 Assumptions

The following assumptions are intentional and must be treated as constraints:

- Data is **eventually consistent**, not real-time
- Ingestion latency is acceptable if correctness is preserved
- Background jobs may lag during spikes
- Manual intervention is acceptable for rare edge cases
- The system is operated by a **small team**

If these assumptions no longer hold, v1 architecture is no longer sufficient.

---

## Ingestion Throughput Limits

### Harvester

- Harvester is a single logical pipeline
- Scheduling is assumed to be **singleton or lock-protected**
- Jobs are processed asynchronously via BullMQ
- Database writes are the primary bottleneck

**Hard constraints (v1):**
- No guarantees on ingestion frequency
- No real-time ingestion
- No per-source SLAs
- No auto-scaling schedulers

If ingestion falls behind:
- Data freshness degrades
- Correctness must not

---

## Database Scaling Constraints

### Postgres as the Source of Truth

Postgres is the primary system of record for:
- Products
- Prices
- History
- Subscriptions
- Alerts
- Retailer inventory

**Constraints:**
- Price history is append-only
- Query patterns favor read-heavy access
- Indexing must support “latest” and “recent history” queries

v1 does **not** support:
- Sharding
- Multi-region writes
- Eventual-consistency replicas for user-facing reads

---

## Search and AI Limits

### Search

- Search performance is bounded by:
  - database query complexity
  - ranking logic
  - history shaping

Search must remain:
- predictable
- explainable
- debuggable

If performance degrades:
- Reduce result breadth
- Reduce history depth
- Reduce explanation complexity

Do not silently change ranking semantics.

---

### AI Usage

AI-related costs and latency are constrained by:
- API call volume
- embedding generation
- explanation generation

**Limits (v1):**
- No real-time AI inference guarantees
- No per-query AI SLA
- AI features may be selectively disabled under load

AI degradation must:
- remove explanations
- fall back to simpler behavior
- never change factual outputs

---

## Alert Volume and Rate Limits

### Alert Evaluation

- Alerts are evaluated asynchronously
- Evaluation frequency is uniform in v1 (no consumer tiers)
- Deduplication is required to prevent spam

**Limits:**
- Alert delivery is best-effort
- No guarantee of immediate delivery
- Alerts may be delayed under load

If alert volume exceeds capacity:
- Drop low-priority alerts
- Delay delivery
- Never send incorrect alerts

---

## Merchant Scaling Limits

### Merchant Count

v1 assumes:
- A limited number of active Merchants
- Manual review and onboarding
- Human oversight of feed health

Out of scope for v1:
- Fully self-serve Merchant onboarding
- Automatic remediation of broken feeds
- High-frequency competitive analytics

If Merchant scale increases:
- Feed health enforcement must tighten
- Ingestion concurrency must be revisited

---

## Admin and Ops Limits

- Admin actions are manual and auditable
- No bulk admin operations without safeguards
- No automated corrective actions without review

Operational tooling must remain:
- simple
- explicit
- reversible

---

## Failure and Backpressure Strategy

When the system is under stress:

1. **Reduce features**
   - Disable explanations
   - Reduce alert frequency
   - Limit history depth

2. **Preserve correctness**
   - Never show stale data as fresh
   - Never bypass eligibility checks
   - Never fabricate confidence

3. **Fail closed**
   - Prefer missing data over wrong data
   - Prefer silence over misleading alerts

---

## Explicit Non-Goals (v1)

IronScout v1 does **not** aim to support:

- Real-time pricing guarantees
- High-frequency trading-style updates
- Multi-region deployments
- Hard uptime SLAs
- Enterprise-scale Merchant networks
- Autonomous agents or pricing automation

Any work toward these goals must be explicitly scoped as post-v1.

---

## Decision Triggers (When This Doc Must Change)

This document must be revisited if:

- Harvester can no longer keep up with ingestion volume
- Database query latency materially impacts UX
- Alert backlog grows uncontrollably
- Merchant onboarding becomes mostly self-serve
- Team size grows beyond what manual ops can support

These are **signals to evolve the architecture**, not to patch around limits.

---

## Guiding Principle

> Scale only what you can still explain, enforce, and debug.

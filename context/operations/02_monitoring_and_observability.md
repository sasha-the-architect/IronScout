# Monitoring and Observability

This document defines the **minimum monitoring and observability requirements** for IronScout v1.

Its purpose is not to maximize metrics.  
Its purpose is to ensure the system can be **understood, debugged, and trusted** by a small team.

If behavior cannot be observed, it cannot be trusted.

---

## Observability Goals (v1)

Monitoring must allow operators to:

- Detect failures quickly
- Understand *what* failed and *where*
- Correlate user-facing issues with backend behavior
- Diagnose issues without modifying production code

v1 prioritizes **actionable signals over exhaustive telemetry**.

---

## Core Signals (Required)

The following signal categories are mandatory in v1.

### Application Health

Each deployed app must expose basic health signals:

- Process running
- Request success / error rates
- Latency at coarse granularity
- Crash or restart events

Applies to:
- `apps/api`
- `apps/web`
- `apps/dealer` (legacy path, Merchant portal)
- `apps/admin`
- `apps/harvester`

If an app is unhealthy, operators must know quickly.

---

### API Observability

Required API signals:
- Request count by endpoint
- Error rate by endpoint
- Authentication and authorization failures
- Tier enforcement failures
- Retailer eligibility filter hits

These signals help answer:
- “Is the API up?”
- “Is enforcement working?”
- “Are users being incorrectly blocked or allowed?”

---

### Harvester Observability

Harvester is a trust-critical system and requires deeper visibility.

Required signals:
- Job counts (enqueued, processing, completed, failed)
- Execution status per source and Retailer feed (legacy naming)
- SKIPPED execution counts and reasons
- Write counts (prices, inventory, benchmarks)
- Error summaries by stage (fetch, normalize, write)

Operators must be able to answer:
- “Is ingestion running?”
- “What failed?”
- “Did bad data propagate?”

---

### Queue Health (BullMQ / Redis)

Required queue-level signals:
- Queue depth
- Processing rate
- Failed job count
- Stalled jobs

Queue backlogs are early warning signals.

If queues are growing without draining, intervention is required.

---

## Logging

### Logging Principles

Logs must be:
- Structured where possible
- Correlated via request IDs or execution IDs
- Safe (no secrets or PII)

Logs exist to answer:
- What happened?
- When?
- To which entity?

---

### Required Log Context

Logs should include:
- Environment
- App name
- Request ID or execution ID
- Relevant entity IDs (user, merchant, feed, execution)

Harvester logs must include execution identifiers consistently.

---

## Alerting on Monitoring (Meta-Alerts)

Monitoring systems may generate alerts for operators.

Required alert categories:
- API unavailable or error rate spike
- Harvester stalled or failing consistently
- Queue backlog exceeding thresholds
- Database connectivity failures

Operator alerts must:
- Be actionable
- Avoid noise
- Trigger escalation only when necessary

Alert fatigue is a failure mode.

---

## Tier and Eligibility Monitoring

Because eligibility is a trust boundary, it requires explicit observability.

Required checks:
- Count of results filtered due to ineligibility
- Count of alerts suppressed due to eligibility
- Attempts to access restricted features (if any) in v1
- Attempts by suspended Merchants to ingest data

Unexpected spikes in these signals indicate bugs or abuse.

---

## AI and Search Observability

AI systems must remain explainable at a high level.

Required signals:
- AI-assisted search usage rate
- Embedding generation errors
- Explanation generation success/failure
- Fallback rates to non-AI behavior

Operators do not need internal model scores, but must see:
- when AI is used
- when it fails
- when it is disabled

---

## Dashboards (Minimal)

Dashboards should exist for:
- API health
- Harvester health
- Queue health
- Subscription and eligibility enforcement

Dashboards must be:
- Readable at a glance
- Focused on anomalies
- Not overloaded with metrics

If a dashboard cannot be understood quickly, it is too complex.

---

## Debugging Without Code Changes

A core requirement for v1:

Operators must be able to:
- Identify a failing feed
- Quarantine or disable it
- Inspect the last execution
- Prevent further propagation

All without:
- Editing production code
- Modifying the database manually

If this is not possible, observability is insufficient.

---

## Data Retention

Observability data should be retained long enough to:
- Debug issues
- Understand trends
- Audit incidents

Exact retention periods are flexible, but:
- Short retention that prevents root cause analysis is not acceptable

---

## Non-Negotiables

- Trust-critical paths must be observable
- Silent failures are unacceptable
- Eligibility enforcement must be visible
- Operators must not rely on memory or guesswork

---

## Guiding Principle

> Observability is how the system explains itself to its operators.

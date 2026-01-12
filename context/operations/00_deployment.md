# Deployment

This document describes how IronScout is deployed in v1.  
It defines **supported deployment patterns, constraints, and safeguards**, not idealized infrastructure.

Deployment must remain simple, reversible, and understandable by a small team.

If deployment behavior contradicts trust, scope, or release criteria, this document is wrong.

---

## Deployment Goals (v1)

Deployment must:
- Be repeatable and predictable
- Support fast rollback
- Avoid manual, error-prone steps
- Preserve data integrity
- Minimize operational surface area

v1 prioritizes **operability over optimization**.

---

## Supported Environments

IronScout supports the following environments:

- **Production**
- **Staging** (or equivalent pre-prod)
- **Local development**

Each environment must be:
- Isolated
- Independently deployable
- Independently configurable

Cross-environment access is not permitted.

---

## Application Deployment Units

IronScout is deployed as multiple independent applications:

- `apps/web` – Consumer-facing UI
- `apps/dealer` – Merchant portal (legacy path name)

Legacy note: directory name `apps/dealer` is a migration artifact. Functionally this is the Merchant portal.
- `apps/admin` – Admin portal
- `apps/api` – Backend API
- `apps/harvester` – Worker process

Each app:
- Has its own build and deploy lifecycle
- Can be deployed independently
- Must be version-compatible with shared schema and contracts

---

## Deployment Model

### Web Apps (web, dealer [legacy path], admin)

- Deployed as stateless Next.js applications
- Scaled horizontally if needed
- Do not store state locally

Requirements:
- All state must be externalized (DB, cache, queues)
- Environment-specific configuration via env vars
- No reliance on sticky sessions

---

### API

- Deployed as a stateless Node service
- Scaled horizontally if needed
- Responsible for enforcing eligibility, listing entitlement, and trust rules

Requirements:
- Must not rely on client-provided identity headers
- Must enforce consumer visibility predicate (eligibility + listing entitlement; no subscription gating)
- Must fail closed if auth or eligibility resolution fails

---

### Harvester

- Deployed as a long-running worker process
- Connects to Redis (queues) and Postgres
- Executes scheduled and queued ingestion jobs

v1 constraint:
- Scheduler must be singleton or lock-protected

If this constraint cannot be enforced, only one Harvester instance may run schedulers.

---

## Configuration Management

### Environment Variables

All configuration must be provided via environment variables.

Includes:
- Database connection strings
- Redis connection info
- API keys and secrets
- Feature flags (where applicable)

Configuration must not:
- Be hard-coded
- Be committed to source control
- Be exposed client-side unless explicitly intended

---

## Database Migrations

- Schema changes must be applied via migrations
- Migrations must be:
  - backward-compatible where possible
  - reversible where feasible

Deployment must not require:
- Manual database edits
- Ad-hoc production fixes

If a migration is risky, deployment must be blocked.

---

## Deployment Process (v1)

A standard deployment should follow this order:

1. Apply database migrations
2. Deploy API
3. Deploy web apps
4. Deploy Harvester
5. Verify health and core flows
6. Monitor for anomalies

Steps may be automated but must remain observable.

---

## Rollback Strategy

Rollback must be possible without:
- Data loss
- Manual data correction
- Re-running ingestion unsafely

Rollback expectations:
- Web and API deploys can be rolled back independently
- Harvester jobs can be paused or stopped
- Feature flags can disable risky features

If rollback cannot be done safely, deployment must not proceed.

---

## Secrets and Credentials

- Secrets must be stored securely
- Rotation must be possible without redeploy where feasible
- Secrets must not appear in logs, errors, or client responses

Any exposure of secrets is a security incident.

---

## Deployment Safety Checks

Before deploying to production, confirm:

- [ ] Migrations applied successfully
- [ ] API capability shaping verified (uniform)
- [ ] Retailer eligibility + listing entitlement enforcement verified (query-time predicate)
- [ ] Delinquency/suspension auto-unlist job/webhook verified
- [ ] Harvester scheduler mode confirmed
- [ ] Rollback path verified
- [ ] Monitoring active

Skipping checks is a release violation.

---

## Known Constraints (v1)

These are intentional:

- No blue/green or canary deploy requirements
- No zero-downtime guarantees
- No auto-scaling schedulers
- No multi-region deploys

If these become requirements, architecture must evolve first.

---

## Non-Negotiables

- Deployment must be reversible
- Configuration must be explicit
- Secrets must be protected
- Data integrity must be preserved

---

## Guiding Principle

> A deployment should never surprise the system or the operator.

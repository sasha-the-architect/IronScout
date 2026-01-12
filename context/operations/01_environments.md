# Environments

This document defines IronScout’s supported environments and the rules that govern how they are configured, accessed, and operated.

Environments are a **hard trust boundary**.  
Blurring them introduces security risk, data corruption, and false confidence.

---

## Supported Environments (v1)

IronScout supports exactly three environments in v1:

- **Production**
- **Staging**
- **Local Development**

No other environments are assumed or supported unless explicitly added later.

---

## Environment Isolation Rules

Each environment must be:

- Fully isolated at the database level
- Fully isolated at the queue (Redis) level
- Configured with its own secrets and credentials
- Deployable independently

Cross-environment access is **not permitted**.

Examples of prohibited behavior:
- Staging pointing at production databases
- Local workers consuming staging queues
- Shared API keys across environments

If isolation cannot be guaranteed, the environment must not be used.

---

## Production

### Purpose

Production is the live environment used by real consumers and dealers.

It must:
- Enforce all trust and eligibility rules
- Reflect current public promises
- Preserve data integrity at all times

---

### Production Constraints

- No experimental features
- No test data
- No manual database edits
- No debug-only endpoints exposed

All changes must go through the standard deployment process.

---

## Staging

### Purpose

Staging is used to:
- Validate deployments
- Test ingestion and eligibility behavior
- Verify merchant subscription enforcement
- Reproduce production issues safely

Staging should be **as close to production as possible** without risking live data.

---

### Staging Constraints

- Uses its own database and queues
- May contain test or scrubbed data
- May expose additional observability or debug tooling

Staging must not:
- Share credentials with production
- Be used for load testing that could impact prod assumptions

---

## Local Development

### Purpose

Local development exists to:
- Build and test features
- Debug ingestion and search behavior
- Validate logic without external risk

---

### Local Constraints

- Uses local or disposable databases
- Uses local or disposable queues
- Does not require access to production secrets

Local environments may:
- Mock external services
- Use seeded data
- Bypass non-critical integrations

Local must never:
- Write to staging or production systems
- Use real billing credentials
- Trigger live alerts or emails

---

## Configuration Management

### Environment Variables

Each environment must define:
- Database connection strings
- Redis connection details
- API keys and secrets
- Feature flags (where applicable)

Configuration must be explicit per environment.

Implicit defaults that point to production are not allowed.

---

## Feature Flags Across Environments

Feature flags may differ by environment, but:

- Production flags must reflect public promises
- Staging flags may enable testing features
- Local flags may enable debug features

Flags must not:
- Be toggled silently in production
- Enable out-of-scope features for v1

---

## Data Handling Rules

### Production Data

- Treated as authoritative
- Never copied to other environments without scrubbing
- Never modified manually

---

### Staging Data

- May be seeded
- May be periodically reset
- Must not contain sensitive real user data

---

### Local Data

- Disposable
- Non-authoritative
- May be destroyed freely

---

## Access Control

- Access to each environment must be explicit
- Production access must be limited
- Environment credentials must not be reused

If an operator does not need production access, they must not have it.

---

## Incident Containment

When incidents occur:
- Reproduction should happen in staging
- Fixes should be validated in staging
- Production changes should be minimal and deliberate

Debugging directly in production is a last resort.

---

## Non-Negotiables

- Environments are isolated
- Secrets do not cross boundaries
- Production is treated as fragile and authoritative
- Ambiguity defaults to restriction

---

## Guiding Principle

> Environments exist to prevent mistakes from becoming incidents.


---

## `context/reference/testing.md`

```markdown
# Testing

This document defines **what testing means for IronScout v1**.

Testing exists to protect:
- trust boundaries
- scope discipline
- release criteria

v1 favors **high-signal tests over exhaustive coverage**.

---

## Testing Philosophy

IronScout testing prioritizes:

1. **Trust enforcement**
2. **Eligibility correctness**
3. **Deterministic behavior**
4. **Safe failure modes**

Perfect coverage is not required.
Breaking trust is unacceptable.

---

## Required Test Categories (v1)

### 1. Uniform Capability Tests

Must verify:
- All users receive identical capability sets
- No consumer-tier gating exists in API responses
- UI does not hide or restrict features based on tier

---

### 2. Retailer Eligibility Tests

Must verify:
- Ineligible Retailers never appear in search
- Ineligible inventory does not trigger alerts
- Eligibility changes propagate immediately at query time

These are **trust-critical tests**.

---

### 3. Ingestion Idempotency Tests

Must verify:
- Re-running ingestion does not duplicate price history
- Duplicate scheduling does not corrupt data
- SKIPPED executions produce no downstream effects

Focus on:
- writer behavior
- execution boundaries

---

### 4. Alert Correctness Tests

Must verify:
- Alerts do not fire from ineligible inventory
- Alerts deduplicate correctly
- Alert language remains conservative

Alert misfires are user-facing trust failures.

---

### 5. Failure Mode Tests

Must verify:
- Missing data degrades gracefully
- Ambiguous state fails closed
- AI explanations are removed when unsafe

These tests often assert **absence**, not presence.

---

## What Does NOT Require Tests (v1)

- Pixel-perfect UI behavior
- Styling changes
- Non-user-facing admin convenience features
- Experimental or deferred features

Do not waste test budget here.

---

## Test Data Rules

- Use synthetic data only
- Never use real Merchant or user data
- Make eligibility state explicit in fixtures

Tests must be reproducible from scratch.

---

## Environment Rules for Tests

- Tests must not depend on production services
- External APIs should be mocked
- Redis and DB should be isolated per test run

If isolation is not possible, the test must be skipped.

---

## Mapping Tests to Docs

Tests should map directly to:
- `context/03_release_criteria.md`
- `decisions/ADR-*.md`

If a test does not protect a release criterion or ADR, question its value.

---

## Minimum Pre-Release Test Checklist

Before shipping v1:

- [ ] Tier enforcement tested via API
- [ ] Merchant suspension → Retailer visibility tested end-to-end
- [ ] Harvester SKIPPED execution tested
- [ ] Alert suppression tested
- [ ] Fail-closed behavior tested

Skipping any item requires explicit acceptance of risk.

---

## Non-Negotiables

- Tests must never relax trust boundaries
- False positives are acceptable; false negatives are not
- Silent failures are worse than test failures

---

## Guiding Principle

> Tests exist to prevent regressions that users would feel.

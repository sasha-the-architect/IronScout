# Runbooks

This document defines **incident response and recovery procedures** for IronScout v1.

Runbooks are for **when something is already broken**.  
They are not guides, tutorials, or design docs.

If an incident occurs and there is no applicable runbook, that is a documentation failure.

---

## Purpose of Runbooks

Runbooks exist to:
- Restore correct behavior quickly
- Minimize user impact
- Prevent data corruption
- Preserve trust boundaries

Runbooks prioritize **containment and correctness** over feature continuity.

---

## General Incident Principles

Apply these principles to all incidents:

1. **Fail closed**
   - Prefer removing access or visibility over risking exposure.
2. **Stop propagation first**
   - Prevent bad data or behavior from spreading.
3. **Stabilize before fixing**
   - Do not “fix forward” while the system is unstable.
4. **Preserve evidence**
   - Do not delete logs, executions, or history.
5. **Restore trust, then features**
   - Features can wait. Trust cannot.

---

## Incident Severity Levels

### SEV-1: Trust or Security Violation
Examples:
- Ineligible Retailer inventory visible to consumers
- Cross-account data exposure
- Eligibility corruption

**Response goals**
- Immediate containment
- Remove exposure
- Audit impact

---

### SEV-2: Major Functional Degradation
Examples:
- Harvester stalled
- Alerts failing broadly
- Search unavailable or incorrect

**Response goals**
- Restore core functionality
- Limit user confusion
- Prevent secondary failures

---

### SEV-3: Partial Degradation
Examples:
- Delayed ingestion
- Missing explanations
- Non-critical UI errors

**Response goals**
- Monitor
- Fix during normal operations
- Communicate if needed

---

## Core Runbooks

### Runbook: Ineligible Retailer Inventory Visible

**Symptoms**
- Retailer inventory appears in consumer search despite feed quarantine or policy violation
- Alerts triggered from ineligible Retailer prices

**Immediate Actions**
1. Set `retailers.visibilityStatus` to INELIGIBLE if policy violation is confirmed.
2. If a Merchant relationship exists, set `merchant_retailers.listingStatus` to UNLISTED (and/or relationship `status` to SUSPENDED) for the affected pairing.
3. Disable/quarantine the Retailer's feed(s) and ignore the offending ingestion run(s) (ADR-015).
4. Verify query-time filtering uses eligibility + listing predicate in API/search.
5. Verify alert suppression for affected Retailer.

**Verification**
- Search no longer returns ineligible/unlisted Retailer inventory
- No new alerts fire from ineligible/unlisted Retailer data

**Follow-Up**
- Audit ingestion logs
- Identify enforcement gap
- Add test coverage

---

### Runbook: Harvester Stalled or Backlogged

**Symptoms**
- Queue depth increasing
- Executions not completing
- No recent ingestion activity

**Immediate Actions**
1. Inspect queue metrics
2. Pause scheduling if enabled
3. Identify failing job types
4. Restart worker if safe

**Verification**
- Jobs begin draining
- New executions complete successfully

**Follow-Up**
- Identify bottleneck
- Adjust batch sizes or scheduling
- Update scaling assumptions if needed

---

### Runbook: Duplicate or Corrupted Ingestion

**Symptoms**
- Duplicate price history entries
- Rapid write amplification
- Conflicting availability states

**Immediate Actions**
1. Pause harvester scheduling
2. Identify duplicate execution source
3. Quarantine affected feeds

**Verification**
- No new duplicate writes occur

**Follow-Up**
- Fix idempotency logic
- Add execution-level guards
- Document root cause

---

### Runbook: Alert Misfires or Spam

**Symptoms**
- Duplicate alerts
- Alerts from ineligible inventory
- Alerts with incorrect language

**Immediate Actions**
1. Disable alert delivery if necessary
2. Identify trigger condition
3. Suppress affected alerts

**Verification**
- No further incorrect alerts are delivered

**Follow-Up**
- Fix deduplication logic
- Tighten eligibility checks
- Review alert language templates

---

### Runbook: Brand Alias Cache Invalidation Not Applying

**Symptoms**
- Brand alias activated in admin but not applied to products
- Brand alias changes appear after a long delay

**Immediate Actions**
1. Check harvester logs for `Received cache invalidation` - if missing, pub/sub issue
2. Check harvester logs for `Brand alias cache refreshed` - verify aliasCount
3. Check Redis connectivity: `redis-cli PUBSUB CHANNELS "brand-alias:*"`
4. Check feature flag: `RESOLVER_BRAND_ALIASES_ENABLED` must be `true`
5. Force refresh: Restart harvester or wait for periodic refresh (60s max)

**Verification**
- New brand alias applied to products
- Recent refresh log entry shows expected aliasCount

**Follow-Up**
- If pub/sub is down, note that periodic refresh is the fallback (60s max)
- If Redis is down, document staleness and restore Redis

---

### Runbook: API or Search Unavailable

**Symptoms**
- Elevated API error rates
- Search returning errors or empty results

**Immediate Actions**
1. Check API health and logs
2. Verify database connectivity
3. Roll back recent deploy if needed

**Verification**
- Search requests succeed
- Error rates normalize

**Follow-Up**
- Identify root cause
- Add missing observability
- Update deployment checks

---

## Communication Guidelines

- Communicate only confirmed facts
- Avoid speculation or blame
- Do not over-promise fixes or timelines

If user-facing communication is required:
- Be conservative
- Acknowledge impact
- Describe mitigation, not excuses

---

## Post-Incident Review

After any SEV-1 or SEV-2 incident:

- Document what happened
- Identify root cause
- Identify detection gaps
- Identify prevention steps

Reviews are for learning, not blame.

---

## Non-Negotiables

- Trust violations take priority over uptime
- Incidents must be documented
- Fixes must prevent recurrence
- Silence is not resolution

---

## Guiding Principle

> In an incident, correctness and trust come before convenience.

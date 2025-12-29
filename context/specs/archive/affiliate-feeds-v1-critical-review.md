# Affiliate Feeds v1 - Critical Architecture Review

**Status:** Superseded
**Date:** 2025-12-26
**Reviewer:** Architecture Review

> **Note:** This document has been superseded. All issues have been resolved and incorporated into the master specification:
> **`context/specs/affiliate-feeds-v1.md`** (see Appendix B: ADR Compliance Matrix and Appendix C: Open Items)
>
> This file is retained for historical reference only.

---

## Executive Summary

After deep analysis of the Affiliate Feeds v1 specification against all ADRs, existing schema, and codebase patterns, this review identifies:

- **3 ADR Conflicts** - All resolved
- **4 Over-Engineering Concerns** - 1 resolved, 3 remaining (2 actionable)
- **3 Under-Engineering Concerns** - 2 resolved, 1 remaining
- **5 Alignment Confirmations** where decisions are sound

**Resolved Issues:**
- ADR-001 conflict: Spec updated to use singleton scheduler
- Offer model conflict: Spec updated to use SourceProduct + SourceProductPresence + Price
- Advisory locks: Appropriate with singleton scheduler pattern
- Source migration: Fail-open query pattern + data backfill + partial unique index
- Spike detection: Two-phase circuit breaker blocks activation before damage occurs

---

## 1. ADR Conflicts

### 1.1 RESOLVED: ADR-001 Compliance

**ADR-001 (Singleton Harvester Scheduler)** explicitly states:
> "Queue-Native Repeatable Jobs - Higher implementation cost, additional failure scenarios, not required for v1 scale"

**Original Spec:** Used BullMQ repeatable jobs for scheduling

**Resolution:** Spec updated to use singleton Harvester scheduler pattern:
- Singleton scheduler ticks on interval
- Queries ENABLED feeds where `lastRunAt + frequencyHours < now()`
- Enqueues execution jobs to BullMQ
- BullMQ handles execution only, not scheduling

This:
- Complies with ADR-001
- Reuses proven dealer feed infrastructure
- Avoids queue-native scheduling complexity
- Keeps ADR-001 unchanged

**Status:** Resolved. No ADR amendment needed.

---

### 1.2 RESOLVED: SourceProduct + Price Pattern (No Offer Model)

**Original Conflict:**
- Spec proposed new `Offer` model with lifecycle fields
- Existing schema has no `Offer` model
- `affiliate-feed-analysis.md` (2025-12-22) said "no lifecycle fields, use SourceProduct later"

**Resolution:** Spec updated to use SourceProduct + SourceProductPresence + Price pattern:

1. **SourceProduct** - Product as seen from a Source (identity, title, URL, secondary identifiers)
2. **SourceProductPresence** - Thin table for `lastSeenAt`, `lastSeenSuccessAt` only
3. **Price** - Append-only observations (unchanged, ADR-004 compliant)

**Key design decisions:**
- No `status` field on SourceProduct - "active" is query-time filter on presence timestamps
- No `currentPrice` cache - derive from latest Price record
- Expiration is passive (timestamp ages out), not a mutation

**Benefits:**
- Aligns with `affiliate-feed-analysis.md` direction
- Keeps ADR-004 intact (append-only Price)
- No lifecycle state machine to maintain
- Clean separation: identity (SourceProduct) vs presence (timestamps) vs prices (append-only)

**Status:** Resolved. Spec updated.

---

### 1.3 CONFLICT: ADR-009 (Fail Closed) vs Partial Success Handling

**ADR-009:** "When state is ambiguous, IronScout fails closed: restrict access and visibility."

**Spec Decision:** On partial failure, keep successful upserts, mark run as FAILED

**Analysis:**
This is a nuanced case. The spec allows:
- 50% of file processed successfully
- Those offers become visible
- Run marked FAILED
- No expiry runs

The question: Is partial visibility on a failed run "failing closed"?

**Arguments FOR current spec:**
- Partial data is better than no data
- Offers that were successfully validated are trustworthy
- Expiry is blocked (conservative)

**Arguments AGAINST:**
- A failed run may indicate systemic issues (wrong file, bad format)
- Partial visibility from bad runs could show incorrect data
- "Fail closed" would mean: if run fails, show nothing new

**Resolution:**

The spec's approach is reasonable IF:
1. Chunked commits use transactions per batch
2. Each batch is fully validated before commit
3. The failure happens between batches, not mid-batch

**Recommendation:** Add explicit clarification to spec:
> "Partial success is permitted only when individual batches complete successfully. A failure mid-batch rolls back that batch entirely. 'Fail closed' applies at batch granularity, not file granularity."

This preserves ADR-009 intent at the appropriate granularity.

---

## 2. Over-Engineering Concerns

### 2.1 RESOLVED: Two-Layer Mutual Exclusion

**Spec:** Both BullMQ job ID deduplication AND PostgreSQL advisory locks

**Original Concern:** Belt-and-suspenders adds complexity without proven need.

**Resolution:** With singleton scheduler pattern (per ADR-001), advisory locks are appropriate:
- Singleton scheduler prevents duplicate job enqueuing
- BullMQ job ID provides deduplication at queue level
- Advisory locks provide execution-level safety (e.g., if worker crashes mid-job and restarts)

**Recommendation:** Keep both. This is defense-in-depth, not over-engineering, when using singleton scheduler.

**Risk:** Low. Advisory lock cleanup is handled by PostgreSQL automatically on session disconnect.

---

### 2.2 OVER: last_seen_success_at Separate from last_seen_at

**Spec:** Two separate timestamp fields for observation tracking

**Concern:** Adds schema complexity for edge case that may not occur often.

**Analysis:**
The spec argues:
- `last_seen_at` updates on every observation
- `last_seen_success_at` updates only on successful runs
- Expiry uses `last_seen_success_at`

But consider:
- If a run fails, we don't run expiry anyway
- If a run succeeds partially, we update both
- The only difference is: partial failures update `last_seen_at` but not `last_seen_success_at`

For a partial failure, does it matter? The offer was seen. It exists in the file. The run failed for other reasons.

**Recommendation:** Consider using a single `last_seen_at` with a flag `lastRunWasSuccessful` on the run, not per-offer. Expiry already checks "only after successful runs." The per-offer distinction may be unnecessary complexity.

**Risk if simplified:** Medium. If we truly have partial failures where some offers are problematic and others aren't, the distinction helps. But this is speculative.

---

### 2.3 OVER: secretKeyId and secretVersion for Future KMS

**Spec:** Schema supports future KMS migration via `secretKeyId` and `secretVersion` fields

**Concern:** YAGNI (You Aren't Gonna Need It) in v1.

**Analysis:**
- v1 uses env-based AES-256-GCM key
- KMS migration is explicitly deferred
- Adding fields for future use adds schema bloat
- Migration to KMS would likely involve a full re-encryption anyway

**Recommendation:** Remove `secretKeyId` and `secretVersion` for v1. Add them when implementing KMS. The migration cost is the same whether fields exist or not.

**Risk if removed:** Zero. Migration adds fields when needed.

---

### 2.4 OVER: Dual Change Detection (mtime + hash)

**Spec:** Both mtime/size precheck AND content hash

**Concern:** Two mechanisms for same goal.

**Analysis:**
- mtime/size is cheap and catches most cases
- Content hash is expensive (requires full download) but definitive
- Spec uses mtime as precheck, then downloads and hashes anyway

If mtime/size match, skip. If different, download and hash. But if mtime is the same and content changed (server time drift?), we miss updates.

**Actually, this is correct.** The spec uses mtime as an optimization to avoid downloads, but doesn't trust it as source of truth. This is reasonable.

**Recommendation:** Keep as designed. This is NOT over-engineering.

---

## 3. Under-Engineering Concerns

### 3.1 RESOLVED: Spike Detection with Two-Phase Circuit Breaker

**Original Concern:** Spike detection was reactive - damage done before alert.

**Resolution:** Spec updated with two-phase circuit breaker:

**Phase 1: Ingest and Stage Presence**
- Download, parse, validate rows
- Upsert SourceProduct records
- Update `lastSeenAt` as you process
- Record "seen this run" in staging table: `source_product_seen(runId, sourceProductId)`

**Phase 2: Evaluate Circuit Breaker (BEFORE updating success timestamps)**
- Compute: `activeCountBefore`, `seenSuccessCount`, `wouldExpireCount`
- Apply thresholds: >30% AND >=10 expiring, OR >=500 expiring
- **If spike detected:**
  - Send Slack alert
  - Set `expiryBlocked = true`, `expiryBlockedReason = 'SPIKE_THRESHOLD_EXCEEDED'`
  - **Do NOT update `lastSeenSuccessAt`** - products stay active
  - No blast radius
- **If no spike:**
  - Promote presence: update `lastSeenSuccessAt` for seen products
  - Stale products naturally age out via query-time filter

**Key insight:** Because "active" is defined by `lastSeenSuccessAt`, if you don't advance it, nothing becomes newly stale from this run.

**Admin "Approve Activation" action:** When blocked, admin can review and manually promote the run's presence updates.

**Status:** Resolved. Spec includes two-phase algorithm, staging table, run flags, and admin approval action.

---

### 3.2 UNDER: No Rollback Strategy

**Spec:** Chunked commits are final. No rollback mechanism.

**Concern:** If bad data is committed, there's no undo.

**Analysis:**
Append-only price history (ADR-004) means we don't delete. But offers can be:
- Incorrectly created
- Created with wrong prices
- Created with wrong identity

The spec has no mechanism to:
- Mark a run's offers as "reverted"
- Soft-delete offers from a bad run
- Restore previous state

**Options:**
A) **Run-level soft delete:** Add `invalidatedAt`, `invalidatedReason` to offers. Admin can mark entire run as invalid.
B) **Manual correction path:** Rely on admin tooling to fix individual offers.
C) **Accept append-only:** Bad data is visible until next good run.

**Recommendation:** Option A for v1. Add `invalidatedAt` and `invalidatedByRunId` to offer/price records. This allows:
- "Undo" of a bad run without violating append-only
- Historical record of what happened
- Clean consumer-facing queries (filter `invalidatedAt IS NULL`)

**Risk if not addressed:** High. First major bad file will require manual DB intervention.

---

### 3.3 RESOLVED: Source Model Additions Migration

**Original Concern:** All existing Sources need backfill or search breaks.

**Resolution:** Spec updated with three-layer protection:

1. **Fail-open query pattern:**
   ```sql
   WHERE (
     s.is_display_primary = true
     OR (
       NOT EXISTS (SELECT 1 FROM sources s2 WHERE s2.retailer_id = s.retailer_id AND s2.is_display_primary = true)
       AND s.source_kind = 'DIRECT'
     )
   )
   ```
   If no primary exists, fall back to DIRECT sources.

2. **Data backfill migration:**
   ```sql
   UPDATE sources SET source_kind = 'DIRECT' WHERE source_kind IS NULL;
   UPDATE sources SET is_display_primary = true WHERE source_kind = 'DIRECT';
   ```

3. **Partial unique index:**
   ```sql
   CREATE UNIQUE INDEX sources_one_primary_per_retailer ON sources(retailer_id) WHERE is_display_primary = true;
   ```
   Prevents multiple primaries per retailer.

**Status:** Resolved. Spec includes migration requirements.

---

## 4. Alignment Confirmations (Sound Decisions)

### 4.1 SOUND: AffiliateFeed 1:1 to Source

Correct separation of concerns. Source handles commercial identity and display. AffiliateFeed handles ingestion operations. This follows the existing pattern where Source is the stable identity anchor.

### 4.2 SOUND: Price table append-only

Spec explicitly complies with ADR-004. Denormalized `currentPrice` on Offer (if Offer exists) is documented as cache, not source of truth.

### 4.3 SOUND: buildTrackingUrl() only in v1

Correctly defers click redirect infrastructure while enabling tracking URL generation. Matches `affiliate-feed-analysis.md` decision from 2025-12-22.

### 4.4 SOUND: Hours-only scheduling

Simple, predictable, no cron parser bugs. Cron documented as future enhancement. This is appropriately conservative for v1.

### 4.5 SOUND: Slack routing to global ops channel

Avoids per-feed channel configuration complexity. Single channel is operationally simple for v1.

---

## 5. Recommendations Summary

### Must Fix Before Implementation

| Issue | Priority | Action |
|-------|----------|--------|
| ~~ADR-001 conflict~~ | ~~High~~ | **RESOLVED** - Spec updated to use singleton scheduler |
| ~~Offer vs Price model~~ | ~~High~~ | **RESOLVED** - Using SourceProduct + SourceProductPresence + Price |
| ~~Source migration path~~ | ~~Critical~~ | **RESOLVED** - Fail-open query + backfill + partial unique index |
| ~~Spike expiry is reactive~~ | ~~Medium~~ | **RESOLVED** - Two-phase circuit breaker with admin approval |

### Simplify for v1

| Issue | Recommendation |
|-------|----------------|
| Advisory locks | Keep - provides execution safety with singleton scheduler |
| secretKeyId/secretVersion | Remove for v1 |
| last_seen_success_at | Consider consolidating with run-level flag |

### Add for Safety

| Issue | Recommendation |
|-------|----------------|
| No rollback | Add invalidatedAt to offers/prices |
| Partial failure clarity | Add batch-level transaction documentation |

---

## 6. Suggested Spec Amendments

### Amendment 1: Reconcile Offer Model

Either:
A) Remove `Offer` model from spec. Use `Price` + `SourceProduct` per existing decision.
B) Explicitly supersede `affiliate-feed-analysis.md` with reasoning.

### Amendment 2: Simplify Mutual Exclusion

Change from:
> "Both BullMQ deduplication AND PostgreSQL advisory locks"

To:
> "BullMQ job ID deduplication for v1. Advisory locks documented as enhancement if race conditions observed."

### Amendment 3: ~~Add Spike Blocking~~ RESOLVED

**Implemented:** Two-phase circuit breaker added to Section 8 (Expiration):
- Phase 1 stages presence in `source_product_seen` table
- Phase 2 evaluates circuit breaker before promoting `lastSeenSuccessAt`
- Admin "Approve Activation" action for blocked runs

### Amendment 4: Add Migration Requirement

Add to Section 18 (Implementation Order):
> "0. Create migration to backfill existing Sources with `isDisplayPrimary = true` where `sourceKind = 'DIRECT'`"

### Amendment 5: Add Invalidation Field

Add to Offer model:
```prisma
invalidatedAt       DateTime?
invalidatedByRunId  String?
invalidatedReason   String?
```

---

## 7. Open Questions for Product Owner

1. ~~**Offer model existence:**~~ **RESOLVED** - Using SourceProduct + SourceProductPresence + Price pattern per December 22 decision.

2. ~~**Spike handling:**~~ **RESOLVED** - Two-phase circuit breaker blocks activation preventively, with admin approval action.

3. **Rollback capability:** Is run-level invalidation a v1 requirement, or acceptable to add post-launch?

4. ~~**Advisory locks:**~~ **RESOLVED** - Keep both BullMQ deduplication and advisory locks for defense-in-depth with singleton scheduler.

---

**Document Version:** 1.0
**Last Updated:** 2025-12-26

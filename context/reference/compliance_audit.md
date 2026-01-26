# ADR Compliance Audit

**Audit Date:** 2025-12-21
**Auditor:** Claude Code
**Scope:** All ADRs (001-010) against current codebase

---

## Executive Summary

| ADR | Status | Severity |
|-----|--------|----------|
| ADR-001 | ✅ FIXED | — |
| ADR-002 | ✅ Compliant | — |
| ADR-003 | ✅ FIXED | — |
| ADR-004 | ✅ Compliant | — |
| ADR-005 | ✅ FIXED | — |
| ADR-006 | ✅ FIXED | — |
| ADR-007 | ✅ Compliant | — |
| ADR-008 | ✅ Compliant | — |
| ADR-009 | ✅ Compliant | — |
| ADR-010 | ✅ Compliant | — |

**Critical Issues:** 0
**High Issues:** 0
**Fixed Issues:** 4

---

## Detailed Findings

### ADR-001: Singleton Harvester Scheduler

**Status:** ✅ FIXED (2025-12-21)

**Requirement:**
Harvester scheduler must be singleton or lock-protected to prevent duplicate ingestion.

**Fix Applied:**
`apps/harvester/src/worker.ts` now checks `HARVESTER_SCHEDULER_ENABLED` environment variable before starting the scheduler:
- If `HARVESTER_SCHEDULER_ENABLED=true`: scheduler starts
- Otherwise: scheduler is disabled, instance only processes jobs

Startup logs now clearly indicate scheduler status.

**No further action required.**

---

### ADR-002: Server-Side Tier Enforcement

**Status:** ✅ Compliant

**Requirement:**
All tier enforcement must be server-side. Never trust client-provided headers.

**Finding:**
`apps/api/src/middleware/auth.ts:48-64` implements `getUserTier()` correctly:
- Extracts user ID from JWT (not headers)
- Looks up tier from database
- Defaults to `FREE` on any failure

The code includes explicit security comments warning against header trust.

**No action required.**

---

### ADR-003: AI Assistive Only

**Status:** ✅ FIXED (2025-12-21)

**Requirement:**
AI must not recommend purchases, suggest actions, or imply certainty.

**Fix Applied:**
1. Deleted `best-value-score.ts` - removed letter grades and deal scores
2. Updated `premium-ranking.ts:generateRankingExplanation()`:
   - "Federal HST is a proven defensive load" → "commonly used for defensive applications"
   - "Gold Dot is trusted by law enforcement" → "widely used by law enforcement agencies"
   - "Reliable FMJ" → "Standard FMJ"
   - "Good match" → "Matches your search criteria"
3. Updated `ai-explanation-banner.tsx`:
   - "AI-powered recommendations" → "detailed context and product insights"
   - "Recommended types" → "Matching types"

**No further action required.**

---

### ADR-004: Append-Only Price History

**Status:** ✅ Compliant

**Requirement:**
Price history must be append-only. Never overwrite historical records.

**Finding:**
`apps/harvester/src/writer/index.ts` uses:
- `prisma.price.create()` (line 266)
- `prisma.price.createMany()` (line 187)

No `update` or `upsert` operations on Price model. New prices are always appended.

**No action required.**

---

### ADR-005: Query-Time Retailer Visibility

**Status:** ⚠️ PARTIAL VIOLATION
**Severity:** High

**Requirement:**
Retailer visibility must be filtered at query time. Ineligible Retailers must never appear in search, alerts, watchlists, or product views.

**Finding:**
`visibleDealerPriceWhere()` (legacy naming) in `apps/api/src/config/tiers.ts:362-383` correctly filters by Retailer eligibility and is used in:
- ✅ `apps/api/src/routes/dashboard.ts`
- ✅ `apps/api/src/routes/products.ts`
- ✅ `apps/api/src/routes/search.ts`
- ✅ `apps/api/src/routes/alerts.ts`
- ✅ `apps/api/src/routes/watchlist.ts`
- ✅ `apps/api/src/services/ai-search/search-service.ts`

**Fix Applied (2025-12-21):**

`apps/harvester/src/alerter/index.ts` now checks Retailer visibility:

1. Added `hasVisibleDealerPrice()` function (legacy naming) that checks if a product has any prices from eligible Retailers
2. Before evaluating alerts, the alerter verifies the product has visible Retailer prices
3. If no visible prices exist, alerts are skipped with `ALERT_SKIPPED_NO_VISIBLE_DEALER` log event (legacy naming)
4. `sendNotification()` now only fetches prices from visible Retailers

This ensures alerts never fire from ineligible Retailer inventory.

**No further action required.**

---

### ADR-006: No Recommendations, Verdicts, or Deal Scores

**Status:** ✅ FIXED (2025-12-21)

**Requirement:**
IronScout must not present purchase recommendations, verdicts, or deal scores.

**Fix Applied:**

#### 1. Best Value Score System - REMOVED
- Deleted `apps/api/src/services/ai-search/best-value-score.ts`
- Created `price-signal-index.ts` with ADR-006 compliant output

#### 2. BUY/WAIT/STABLE Verdicts - REMOVED
- Removed `Verdict` type from `dashboard.ts`
- Deleted `verdict-chip.tsx`
- Migrated to `ContextChip` with `PriceContext` type:
  - `LOWER_THAN_RECENT` / `WITHIN_RECENT_RANGE` / `HIGHER_THAN_RECENT`
- Updated `pulse-row.tsx`, `todays-best-moves.tsx` to use new component

#### 3. Dashboard Verdict Logic - FIXED
- `dashboard.ts` now returns `priceContext` (descriptive) instead of verdict

#### 4. Deal Labels - REMOVED
- Removed `DealLabel` type (`HOT_DEAL`, `NEW_LOW`, `BULK_VALUE`)
- Deleted `deal-tag.tsx`
- `ProductCard` no longer shows deal labels

#### 5. Savings Attribution - REFRAMED
- Removed "verified savings" concept
- Removed ROI comparison (`thisMonth > 7.99`)
- Renamed to "Price Difference" - shows factual comparison to target price
- Removed `SAVINGS_VERIFIED` copy

#### 6. Recommendation Language - REFRAMED
- "Why this deal?" → "Why this match?"
- "No Recommendations Yet" → "No Matches Yet"
- "get personalized recommendations" → "see personalized matches"
- "Buy Now" → "View at Retailer"
- "Deals For You" → "For You"

**No further action required.**

---

### ADR-007: Premium = Information Density Only

**Status:** ✅ Compliant

**Requirement:**
Premium unlocks more context, not better outcomes or guarantees.

**Finding:**
Pricing copy in `apps/web/components/pricing/pricing-plans.tsx:344` explicitly states:
> "It does not guarantee the lowest price, future price movements, or savings on every purchase."

Similar disclaimers in:
- `apps/web/components/pricing/pricing-faq.tsx:17`
- `apps/web/components/sections/testimonials.tsx:66`
- `apps/web/components/sections/disclaimer.tsx:13`

**No action required** (though ADR-006 violations undermine this compliance).

---

### ADR-008: No Usage-Based Billing UI

**Status:** ✅ Compliant

**Requirement:**
Merchant billing is subscription-based only. Usage metrics are internal.

**Finding:**
No usage-based billing UI found. Search for `usage.?based|metered|per.?click` returned no matches in apps.

**No action required.**

---

### ADR-009: Fail Closed on Ambiguity

**Status:** ✅ Compliant

**Requirement:**
When state is ambiguous, restrict access.

**Finding:**
`apps/api/src/middleware/auth.ts` defaults to `FREE` tier when:
- No JWT present (line 52)
- User not found in database (line 60)
- Any error occurs (line 62)

This correctly fails closed to most restricted access.

**No action required.**

---

### ADR-010: Operations Without Code Changes

**Status:** ✅ Compliant

**Requirement:**
Routine operations must be possible without production code changes.

**Finding:**
Admin portal provides operational UI:
- `apps/admin/app/api/dealers/[id]/suspend/route.ts`
- `apps/admin/app/api/dealers/[id]/reactivate/route.ts`
- `apps/admin/app/dealers/[id]/admin-actions.tsx` (impersonation, email verification)

**No action required.**

---

## Action Items

### Critical (Block v1 Launch)

None - all critical issues resolved.

### High (Should Fix Before Launch)

None - all high issues resolved.

### Fixed

| # | ADR | Issue | Fixed |
|---|-----|-------|-------|
| 1 | 006 | Remove Best Value Score, verdicts, deal scores, savings claims | 2025-12-21 |
| 2 | 005 | Add Retailer visibility check to alerter | 2025-12-21 |
| 3 | 003 | Remove recommendation language from AI outputs | 2025-12-21 |
| 4 | 001 | Enforce `HARVESTER_SCHEDULER_ENABLED` in worker.ts | 2025-12-21 |

---

## Appendix: Files Changed

### ADR-006 Migration (2025-12-21)

**Deleted:**
- ~~`apps/api/src/services/ai-search/best-value-score.ts`~~
- ~~`apps/web/components/dashboard/atoms/verdict-chip.tsx`~~
- ~~`apps/web/components/dashboard/atoms/deal-tag.tsx`~~

**Created:**
- `apps/api/src/services/ai-search/price-signal-index.ts`
- `apps/web/components/dashboard/atoms/context-chip.tsx`
- `apps/api/src/services/ai-search/__tests__/consumer-output-safety.test.ts`

**Updated:**
- `apps/api/src/services/ai-search/premium-ranking.ts` - AI explanation language
- `apps/api/src/routes/dashboard.ts` - priceContext instead of verdict
- `apps/web/types/dashboard.ts` - removed Verdict, DealLabel types
- `apps/web/components/dashboard/molecules/deal-card.tsx` → ProductCard
- `apps/web/components/dashboard/molecules/pulse-row.tsx` - uses ContextChip
- `apps/web/components/dashboard/molecules/savings-card.tsx` - removed ROI claims
- `apps/web/components/dashboard/organisms/todays-best-moves.tsx` → TopMatch
- `apps/web/components/dashboard/organisms/deals-for-you.tsx` → PersonalizedFeed
- `apps/web/components/premium/ai-explanation-banner.tsx` - removed recommendation language

### ADR-005 Fix (2025-12-21)
- `apps/harvester/src/alerter/index.ts` ✅

### ADR-001 Fix (2025-12-21)
- `apps/harvester/src/worker.ts` ✅

---

## Sign-Off

This audit identifies compliance gaps against ADRs 001-010. Critical violations in ADR-006 must be resolved before v1 launch per `context/03_release_criteria.md`.

Next steps:
1. Review findings with stakeholder
2. Decide on remediation approach for ADR-006 (remove vs reframe)
3. Implement fixes in priority order
4. Re-audit after changes

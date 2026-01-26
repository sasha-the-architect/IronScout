# ADR Compliance Questions

**Created:** 2025-12-21
**Status:** Pending Resolution
**Context:** Questions arising from `compliance_audit.md` before implementing fixes

---

## ADR-006 Violations

### Q1: Best Value Score System - Already Fixed?

**Context:**
The audit lists `best-value-score.ts` as a violation, but this file was deleted in a previous refactoring session.

**Question:**
Is the audit stale, or should we verify the file is actually gone and update the audit?

**Finding:**
File confirmed deleted. Audit is stale on this point.

**Resolution:**
- [x] RESOLVED - Update audit to mark as fixed

---

### Q2: BUY/WAIT/STABLE Verdicts

**Context:**
- `apps/web/types/dashboard.ts` was already refactored - `Verdict` type removed
- `verdict-chip.tsx` still imports the old `Verdict` type (broken import)
- New `context-chip.tsx` exists with ADR-006 compliant `PriceContext` type
- **23 type errors** in web app due to partial migration

**Current State:**
```
Types removed from dashboard.ts:
- Verdict (was: 'BUY' | 'WAIT' | 'STABLE')
- VerdictChipProps
- DealLabel (was: 'HOT_DEAL' | 'NEW_LOW' | 'BULK_VALUE')
- DealTagProps
- DealCardProps

Components still using old types (BROKEN):
- verdict-chip.tsx
- deal-tag.tsx
- deal-card.tsx
- pulse-row.tsx
- todays-best-moves.tsx
- deals-for-you.tsx
```

**Question:**
Complete the migration by:
- **A:** Delete `verdict-chip.tsx`, `deal-tag.tsx` and update components to use `context-chip.tsx`
- **B:** Restore old types temporarily and plan separate migration
- **C:** Other approach?

**Resolution:**
- [ ] Pending - DECISION NEEDED

---

### Q3: Dashboard Verdict Logic

**Context:**
The audit says `dashboard.ts:138-146` determines BUY/WAIT verdict from price timing signal.

**Current State:**
API already refactored to use:
```typescript
priceContext: 'LOWER_THAN_RECENT' | 'WITHIN_RECENT_RANGE' | 'HIGHER_THAN_RECENT'
```

The `verdict` field was removed from `MarketPulseItem` type, but `pulse-row.tsx:70` still references `pulse.verdict` (broken).

**Question:**
Is the new `priceContext` terminology compliant with ADR-006?

**Analysis:**
- `LOWER_THAN_RECENT` - Factual comparison, no action implied
- `WITHIN_RECENT_RANGE` - Factual, neutral
- `HIGHER_THAN_RECENT` - Factual comparison, no action implied
- No "BUY", "WAIT", "DEAL" language

This appears ADR-006 compliant. The issue is incomplete component migration.

**Resolution:**
- [ ] Pending - Terminology is compliant, need to fix component migration

---

### Q4: Deal Labels

**Context:**
`DealLabel` type was removed from `dashboard.ts` but `deal-tag.tsx` still uses it (broken import).

**Original Labels:**
```typescript
type DealLabel = 'HOT_DEAL' | 'NEW_LOW' | 'BULK_VALUE'
```

**ADR-006 Analysis:**

| Label | Verdict | Reasoning |
|-------|---------|-----------|
| `HOT_DEAL` | VIOLATES | Implies urgency, recommendation to act |
| `NEW_LOW` | BORDERLINE | Factual observation, but "low" implies value |
| `BULK_VALUE` | VIOLATES | "Value" is a judgment |

**Question:**
Should we:
- **A:** Remove deal labels entirely (cleanest ADR-006 compliance)
- **B:** Replace with purely factual tags: `PRICE_DROP`, `HIGH_VOLUME`, `NEW_LISTING`
- **C:** Keep `NEW_LOW` only, remove others

**Resolution:**
- [ ] Pending - DECISION NEEDED

---

### Q5: Savings Attribution

**Context:**
The audit flags:
- "Premium paid for itself this month" - referenced via `UPGRADE_COPY.SAVINGS_VERIFIED`
- Savings tracking with "verified savings"

**Current State:**
- `UPGRADE_COPY.SAVINGS_VERIFIED` does not exist in current `dashboard.ts` (broken reference)
- `savings-card.tsx:74-78` tries to show ROI message when `thisMonth > 7.99` (subscription price)
- The feature exists but the copy constant was removed

**Specific Violations:**
1. `savings.verifiedSavings!.thisMonth > 7.99` - Implies ROI calculation
2. Missing `SAVINGS_VERIFIED` copy - Was likely "Premium paid for itself"
3. "Verified savings" terminology - Implies guarantee

**Question:**
How to handle savings tracking?

**Options:**
- **A:** Remove savings feature entirely
- **B:** Keep potential savings (factual: "X alerts are below your target price"), remove "verified" and ROI claims
- **C:** Keep all tracking but add disclaimer and remove ROI comparison logic

**ADR-006 Concern:**
"Verified savings" and ROI claims suggest IronScout guarantees outcomes, which violates ADR-007 ("Premium = information density, not better outcomes").

**Resolution:**
- [ ] Pending - DECISION NEEDED

---

### Q6: "Why this deal was recommended" Language

**Context:**
Multiple places still use "recommendation" language:

**Violations Found:**
1. `deal-card.tsx:150` - `{UPGRADE_COPY.DEAL_EXPLANATION}` (constant doesn't exist - broken)
2. `ai-explanation-banner.tsx:63` - "AI-powered recommendations based on your specific needs"
3. `todays-best-moves.tsx:19-22` - JSDoc says "top recommendation"
4. `todays-best-moves.tsx:79` - "get personalized recommendations"

**Already Fixed:**
- `dashboard.ts:8` - Comment explicitly says no "recommendation" terminology
- `context-chip.tsx:15,54` - Comments say "no recommendations or verdicts"

**Question:**
How to handle remaining recommendation language?

**Required Changes:**
1. Remove `DEAL_EXPLANATION` reference or add compliant copy
2. Reframe `ai-explanation-banner.tsx` - change "recommendations" to "context" or "insights"
3. Update `todays-best-moves.tsx` copy - change "recommendations" to "matches" or "items"

**Resolution:**
- [ ] Pending - Clear violations, need to fix

---

## ADR-003 Violations

### Q7: AI Explanation Language in premium-ranking.ts

**Context:**
`generateRankingExplanation()` at `premium-ranking.ts:430-495` produces explanatory text.

**Current Explanations:**

| Statement | ADR-003 Analysis |
|-----------|------------------|
| "Optimized for short-barrel performance" | COMPLIANT - Technical product characteristic |
| "Bonded jacket ensures reliable expansion through barriers" | COMPLIANT - Technical description |
| "Federal HST is a proven defensive load" | BORDERLINE - "proven" implies endorsement |
| "Gold Dot is trusted by law enforcement" | BORDERLINE - "trusted" implies endorsement |
| "+P loading provides higher velocity" | COMPLIANT - Technical fact |
| "Priced below recent observations for similar ammunition" | COMPLIANT - Comparative, no recommendation |
| "Designed to minimize overpenetration risk" | COMPLIANT - Technical characteristic |
| "Reliable FMJ for training and practice" | BORDERLINE - "reliable" is subjective |
| "Good match for your search criteria" | COMPLIANT - Neutral, describes relevance |

**Question:**
Should we reframe the borderline statements?

**Options:**
- **A:** Keep all - these are industry-standard descriptions, not purchase advice
- **B:** Reframe to remove endorsement-like language:
  - "Federal HST is a proven defensive load" → "Federal HST is commonly used for defensive applications"
  - "Gold Dot is trusted by law enforcement" → "Gold Dot is widely used by law enforcement agencies"
  - "Reliable FMJ" → "Standard FMJ"
- **C:** Remove brand-specific statements entirely

**My Assessment:**
These statements describe product characteristics and market positioning, not purchase recommendations. They don't say "buy this" - they explain why the product matches the search intent. Option A or B seems reasonable.

**Resolution:**
- [ ] Pending - DECISION NEEDED

---

## Meta Questions

### Q8: Overall Approach - Remove vs Reframe

**Context:**
The audit offers two remediation approaches, but the current state is more nuanced.

**Current Reality:**
- Types in `dashboard.ts` were already refactored (ADR-006 compliant)
- Components were NOT updated → 23 type errors, app won't build
- Some features are half-migrated (new `ContextChip` exists alongside old `VerdictChip`)

**Option A: Complete the Migration (Recommended)**
The types are already fixed. We need to:
1. Delete old components: `verdict-chip.tsx`, `deal-tag.tsx`
2. Update components to use `ContextChip` instead of `VerdictChip`
3. Remove deal label concepts entirely
4. Fix broken `UPGRADE_COPY` references
5. Reframe recommendation language

**Option B: Rollback Types, Plan Later**
Restore old types to fix build, defer compliance work.

**Option C: Remove Dashboard Entirely**
Delete dashboard feature for v1 launch.

**My Assessment:**
Option A is the right path. The hard work (type definitions) was already done.
We just need to finish updating the components. This is mechanical work, not design decisions.

The real decisions needed are:
- Q4: What to do about deal labels (remove vs reframe)
- Q5: What to do about savings tracking
- Q7: Whether to reframe AI explanations

**Resolution:**
- [ ] Pending - Recommend Option A, need decisions on Q4, Q5, Q7

---

## Resolution Log

| Q# | Date | Decision | Rationale |
|----|------|----------|-----------|
| Q1 | 2025-12-21 | RESOLVED | best-value-score.ts confirmed deleted |
| Q2 | 2025-12-21 | Option A | Deleted verdict-chip.tsx, migrated to ContextChip |
| Q3 | 2025-12-21 | COMPLIANT | priceContext terminology is descriptive, not prescriptive |
| Q4 | 2025-12-21 | Option A | Removed deal labels entirely (HOT_DEAL, etc.) |
| Q5 | 2025-12-21 | Option B | Kept price difference tracking, removed "verified savings" and ROI claims |
| Q6 | 2025-12-21 | FIXED | Changed "recommendations" to "matches", "insights", "context" |
| Q7 | 2025-12-21 | Option B | Reframed to neutral: "proven" → "commonly used", "trusted" → "widely used" |
| Q8 | 2025-12-21 | Option A | Completed the migration (types were already done) |

---

## Next Steps

1. Resolve each question above
2. Update this file with decisions
3. Implement fixes based on decisions
4. Re-audit after changes
5. Update `compliance_audit.md` with current status
# Status: Historical Audit Notes (Archived)
This document is historical and non-authoritative.

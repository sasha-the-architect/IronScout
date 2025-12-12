# IronScout Premium Features - Implementation Status

**Last Updated:** December 12, 2025

## Pricing Overview

| Plan | Price | Billing |
|------|-------|---------|
| Free | $0 | - |
| Premium Monthly | $4.99/mo | Monthly |
| Premium Annual | $49.99/yr | Annual (~$4.17/mo, 17% savings) |

---

## Feature Implementation Status

### ✅ IMPLEMENTED - Working in Production

| Feature | Free | Premium | Implementation Location |
|---------|------|---------|------------------------|
| **Search by caliber, brand, grain & more** | ✓ | ✓ | `apps/api/src/routes/search.ts` |
| **Price-per-round breakdown** | ✓ | ✓ | `apps/web/components/product-card.tsx` |
| **Purpose badges (range, defense, hunting)** | ✓ | ✓ | `apps/api/src/services/ai-search/intent-parser.ts` |
| **Basic AI search assistance** | ✓ | ✓ | `apps/api/src/services/ai-search/search-service.ts` |
| **Alert limit enforcement** | 3 alerts | Unlimited | `apps/api/src/routes/alerts.ts`, `apps/api/src/config/tiers.ts` |
| **Alert delay** | Daily digest | Instant | `apps/api/src/config/tiers.ts` (configured), `apps/harvester/src/alerter/` |
| **Premium filters UI** | Locked | ✓ | `apps/web/components/premium/premium-filters.tsx` |
| **Bullet type filter** | Locked | ✓ | `apps/api/src/routes/search.ts` |
| **Pressure rating filter** | Locked | ✓ | `apps/api/src/routes/search.ts` |
| **Subsonic filter** | Locked | ✓ | Premium filters |
| **Short barrel optimized filter** | Locked | ✓ | Premium filters |
| **Suppressor safe filter** | Locked | ✓ | Premium filters |
| **Low flash filter** | Locked | ✓ | Premium filters |
| **Low recoil filter** | Locked | ✓ | Premium filters |
| **Match grade filter** | Locked | ✓ | Premium filters |
| **Purpose-optimized ranking** | ✗ | ✓ | `apps/api/src/services/ai-search/premium-ranking.ts` |
| **Best Value scoring** | ✗ | ✓ | `apps/api/src/services/ai-search/best-value-score.ts` |
| **AI explanations** | ✗ | ✓ | `premium-ranking.ts` → `generateRankingExplanation()` |
| **Performance badges** | ✗ | ✓ | `apps/api/src/types/product-metadata.ts` → `extractPerformanceBadges()` |
| **Stripe subscription integration** | - | ✓ | `apps/api/src/routes/payments.ts`, `apps/web/lib/api.ts` |

### ⚠️ PARTIALLY IMPLEMENTED - Needs Work

| Feature | Status | Notes |
|---------|--------|-------|
| **Price history charts** | Backend exists, UI unclear | Need to verify `apps/web` has price history visualization for Premium |
| **"What should I buy?" personalization** | AI ranking works | Need explicit "recommendation mode" in UI |
| **Instant alerts** | Config exists | Need to verify harvester/alerter respects tier delay |

### ❌ NOT IMPLEMENTED - Marketing Claims Need Code

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| **"Know if now is a good time to buy"** | High | Medium | Need price trend indicator/recommendation |
| **Daily digest for Free tier** | Medium | Medium | Currently just delayed, not batched into digest |

---

## Detailed Feature Analysis

### 1. Alerts System

**Current Implementation:**
```typescript
// apps/api/src/config/tiers.ts
FREE: {
  maxActiveAlerts: 5,      // Pricing says 3!
  alertDelayMinutes: 60,   // 1 hour delay
}
PREMIUM: {
  maxActiveAlerts: -1,     // Unlimited ✓
  alertDelayMinutes: 0,    // Real-time ✓
}
```

**Issue Found:** Config says 5 alerts for Free, but pricing page says 3!

**Action Required:**
- [ ] Update `tiers.ts` to set `maxActiveAlerts: 3` for FREE tier
- [ ] Verify alerter worker respects `alertDelayMinutes`

### 2. Price History

**Current Implementation:**
```typescript
// apps/api/src/config/tiers.ts
FREE: { priceHistoryDays: 0 }     // No history
PREMIUM: { priceHistoryDays: 365 } // Full year
```

**UI Status:** Need to verify price history charts exist and are gated properly.

### 3. AI Features

**Fully Working:**
- Intent parsing with purpose detection
- Premium ranking with performance boosts
- Best Value score calculation
- AI explanations generation
- Performance badge extraction

**Exposed in API:**
- `POST /api/search/semantic` - Main search with tier-aware ranking
- `GET /api/search/premium-filters` - Filter definitions

### 4. Premium Filters

**UI Implementation:** Complete in `premium-filters.tsx`
- Shows locked state for Free users
- Upgrade CTA in filter panel
- All filter types implemented

**Backend:** Filters applied in `search.ts` only for Premium users.

---

## Configuration Discrepancies

| Item | Config Value | Pricing Page Value | Action |
|------|--------------|-------------------|--------|
| Free alert limit | 5 | 3 | **Fix config to 3** |
| Alert delay description | 60 minutes | "Daily digest" | **Update pricing copy or implement digest** |

---

## Recommended Fixes

### Priority 1: Fix Alert Limit Mismatch

```typescript
// apps/api/src/config/tiers.ts
FREE: {
  maxActiveAlerts: 3,  // Changed from 5 to match pricing
}
```

### Priority 2: Verify Price History UI

Check these files exist and work:
- `apps/web/components/price-history-chart.tsx` (or similar)
- Verify it's only shown for Premium users

### Priority 3: Add "Good Time to Buy" Indicator

For Premium users, show:
- Current price vs 30-day average
- "Below average" / "Above average" / "At average" badge
- Optional: Price trend arrow

---

## Documentation Updates Needed

### CLAUDE.md Updates

1. Update Tier System section with correct alert limits
2. Add note about pricing page location
3. Document which features are UI vs API gated

### Pricing Page Accuracy

Current `pricing-plans.tsx` is accurate EXCEPT:
- Free tier says "up to 3" alerts - matches intent but config says 5
- "Daily digest" messaging - config only does 60min delay, not true digest

---

## Testing Checklist

- [ ] Create Free account, verify can only create 3 alerts
- [ ] Verify Premium filters are locked for Free users
- [ ] Verify Premium filters work for Premium users
- [ ] Verify AI explanations appear for Premium search results
- [ ] Verify Best Value scores appear for Premium users
- [ ] Test Stripe subscription flow
- [ ] Verify subscription status updates user tier

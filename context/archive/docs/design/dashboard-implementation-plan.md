# Dashboard UI Implementation Plan

**Based on:** `docs/design/dashboard-ui-spec.md`
**Status:** Ready for Implementation
**Date:** December 19, 2025

---

## Current State Analysis

### Existing Infrastructure ✅

| Component | Status | Location |
|-----------|--------|----------|
| Dark mode theme | ✅ Ready | `apps/web/app/globals.css` - "Night Recon" theme with cyan accent |
| Shadcn UI primitives | ✅ Ready | `apps/web/components/ui/` - Card, Badge, Button, etc. |
| Dashboard layout | ✅ Ready | `apps/web/app/dashboard/layout.tsx` - Sidebar nav with tier detection |
| Dashboard page | ⚠️ Needs Update | `apps/web/app/dashboard/page.tsx` - Basic stats layout |
| API endpoints | ✅ Ready | `/api/dashboard/*` and `/api/watchlist/*` routes created |

### Gaps to Fill

1. **Verdict chips** (BUY NOW / WAIT / STABLE) - New component needed
2. **Deal tags** (HOT DEAL / NEW LOW / BULK VALUE) - New component needed
3. **Sparkline charts** - Need lightweight chart component
4. **API hooks** - Need hooks for dashboard/watchlist endpoints
5. **Premium gating UI** - Locked overlays and upgrade CTAs

---

## Component Architecture

### Atomic Components (New)

```
components/dashboard/
├── atoms/
│   ├── verdict-chip.tsx       # BUY NOW / WAIT / STABLE
│   ├── deal-tag.tsx           # HOT DEAL / NEW LOW / BULK VALUE
│   ├── price-delta.tsx        # ▼ 3% this week (red/green)
│   ├── sparkline.tsx          # Mini trend chart
│   └── locked-overlay.tsx     # Premium feature teaser
├── molecules/
│   ├── deal-card.tsx          # Product card with verdict + CTA
│   ├── pulse-row.tsx          # Single caliber market status
│   ├── savings-card.tsx       # Monthly/all-time savings
│   └── watchlist-item.tsx     # Single watchlist entry
├── organisms/
│   ├── todays-best-moves.tsx  # Hero section with top recommendations
│   ├── deals-for-you.tsx      # Main deal feed
│   ├── market-pulse.tsx       # Right sidebar caliber status
│   ├── savings-tracker.tsx    # Savings proof section
│   └── watchlist-preview.tsx  # Compact watchlist view
```

### Design Token Mapping

The spec defines tokens that map to our existing theme:

| Spec Token | Our CSS Variable | Value |
|------------|-----------------|-------|
| bg/0 | `--background` | Deep Ops Black #121418 |
| bg/1 | `--card` | Slate Armor #2C333A |
| bg/2 | `--muted` | Slightly darker slate |
| text/primary | `--foreground` | Vapor Grey #DCE3E8 |
| text/secondary | `--muted-foreground` | Cool Steel #8A97A6 |
| accent/primary | `--primary` | Tactical Cyan #00C2CB |
| status/buy | Custom | Green (needs addition) |
| status/wait | Custom | Amber (needs addition) |
| status/stable | Custom | Neutral gray |
| border/1 | `--border` | Cool Steel darker |

**CSS Variables to Add:**
```css
--status-buy: 142 76% 36%;        /* Green #22c55e */
--status-wait: 38 92% 50%;        /* Amber #f59e0b */
--status-stable: 209 16% 60%;     /* Neutral gray */
```

---

## Implementation Phases

### Phase 1: Foundation (Atoms + Hooks)

**Goal:** Build atomic components and API connectivity

1. **Add status color tokens** to `globals.css`
2. **Create VerdictChip component**
   - Variants: BUY, WAIT, STABLE
   - Tooltip on hover explaining verdict
   - Pulse animation on load
3. **Create DealTag component**
   - Variants: HOT_DEAL, NEW_LOW, BULK_VALUE
4. **Create Sparkline component**
   - Simple 7-point SVG sparkline
   - Color based on trend direction
5. **Create API hooks**
   - `useMarketPulse(userId)` → `/api/dashboard/pulse/:userId`
   - `useDealsForYou(userId)` → `/api/dashboard/deals/:userId`
   - `useSavings(userId)` → `/api/dashboard/savings/:userId`
   - `useWatchlist(userId)` → `/api/watchlist/:userId`

### Phase 2: Molecules

**Goal:** Build composite components

1. **DealCard** - Full deal card with:
   - Deal tag (top left)
   - Product name + caliber
   - Price/rd prominent
   - Delta vs target (if set)
   - Urgency signals (max 2)
   - Buy Now CTA
   - Premium: "Why you're seeing this" expandable

2. **PulseRow** - Market status row with:
   - Caliber name
   - Current avg price
   - Sparkline (7-day)
   - Verdict chip
   - Click → modal (Premium only)

3. **SavingsCard** - Savings display with:
   - This month / All time amounts
   - Free: "Potential savings"
   - Premium: "Confirmed savings"

4. **LockedOverlay** - Premium gate with:
   - Blur/dim effect
   - Lock icon
   - Value-focused upgrade copy

### Phase 3: Organisms

**Goal:** Assemble page sections

1. **TodaysBestMoves** (Hero)
   - Grid: Full width
   - Single "Buy Now" recommendation card
   - Verdict chip + product + price + CTA
   - Premium: Delta % + historical context

2. **DealsForYou** (Main Feed)
   - Grid: 8 cols (desktop)
   - Free: 5 cards
   - Premium: 20 cards + flash deals badge
   - Load more button

3. **MarketPulse** (Sidebar)
   - Grid: 4 cols (desktop)
   - PulseRow list for user's calibers
   - Free: 2 calibers max
   - Premium: Unlimited + click for chart

4. **SavingsTracker**
   - Grid: Full width
   - SavingsCard + upgrade CTA (Free)
   - SavingsCard + breakdown (Premium)

5. **WatchlistPreview**
   - Grid: Full width
   - 3-5 items max
   - Inline price change indicator
   - "View full watchlist" CTA

### Phase 4: Page Assembly

**Goal:** Wire it all together

1. **Update `/dashboard/page.tsx`**
   - Remove old DashboardOverview
   - Add new section hierarchy:
     - TodaysBestMoves (hero)
     - DealsForYou + MarketPulse (2-col)
     - SavingsTracker
     - WatchlistPreview

2. **Add tier context provider**
   - Pass `isPremium` from layout
   - Components read tier to show/hide features

3. **Mobile layout**
   - Stack all sections vertically
   - MarketPulse becomes collapsible
   - Deals feed is primary scroll area

---

## File Creation Order

```
1. apps/web/app/globals.css           # Add status colors
2. apps/web/lib/api.ts                # Add dashboard API functions
3. apps/web/hooks/use-market-pulse.ts
4. apps/web/hooks/use-deals-for-you.ts
5. apps/web/hooks/use-savings.ts
6. apps/web/hooks/use-watchlist.ts
7. apps/web/components/dashboard/atoms/verdict-chip.tsx
8. apps/web/components/dashboard/atoms/deal-tag.tsx
9. apps/web/components/dashboard/atoms/price-delta.tsx
10. apps/web/components/dashboard/atoms/sparkline.tsx
11. apps/web/components/dashboard/atoms/locked-overlay.tsx
12. apps/web/components/dashboard/molecules/deal-card.tsx
13. apps/web/components/dashboard/molecules/pulse-row.tsx
14. apps/web/components/dashboard/molecules/savings-card.tsx
15. apps/web/components/dashboard/organisms/todays-best-moves.tsx
16. apps/web/components/dashboard/organisms/deals-for-you.tsx
17. apps/web/components/dashboard/organisms/market-pulse.tsx
18. apps/web/components/dashboard/organisms/savings-tracker.tsx
19. apps/web/components/dashboard/organisms/watchlist-preview.tsx
20. apps/web/app/dashboard/page.tsx   # Update with new layout
```

---

## Type Definitions

```typescript
// types/dashboard.ts

export type Verdict = 'BUY' | 'WAIT' | 'STABLE'
export type DealLabel = 'HOT_DEAL' | 'NEW_LOW' | 'BULK_VALUE'
export type Trend = 'UP' | 'DOWN' | 'STABLE'

export interface MarketPulseItem {
  caliber: string
  currentAvg: number | null
  trend: Trend
  trendPercent: number
  buyWaitScore?: number  // Premium only
  verdict: Verdict
}

export interface DealItem {
  id: string
  product: {
    id: string
    name: string
    caliber: string
    brand: string
    imageUrl?: string
    roundCount?: number
  }
  retailer: {
    id: string
    name: string
    tier: string
    logoUrl?: string
  }
  price: number
  pricePerRound: number | null
  url: string
  inStock: boolean
  isWatched: boolean
  bestValueScore?: number  // Premium only
  explanation?: string     // Premium only
}

export interface SavingsData {
  potentialSavings: number
  breakdown: Array<{
    productId: string
    productName: string
    targetPrice: number
    currentPrice: number
    savings: number
  }>
  alertsWithSavings: number
  totalAlerts: number
  verifiedSavings?: {  // Premium only
    thisMonth: number
    allTime: number
    purchaseCount: number
  }
}

export interface WatchlistItem {
  id: string
  productId: string
  targetPrice: number | null
  product: {
    id: string
    name: string
    caliber: string
    brand: string
    imageUrl?: string
    currentPrice: number | null
    retailer: { name: string } | null
    inStock: boolean
  }
  lowestPriceSeen: number | null
  lowestPriceSeenAt: string | null
  isLowestSeen: boolean
  savingsVsTarget: number | null
}
```

---

## Estimated Effort

| Phase | Components | Estimated Size |
|-------|------------|----------------|
| Phase 1 | 6 files | ~300 LOC |
| Phase 2 | 4 files | ~400 LOC |
| Phase 3 | 5 files | ~600 LOC |
| Phase 4 | 1 file + updates | ~200 LOC |
| **Total** | **16 new files** | **~1500 LOC** |

---

## Questions for Clarification

1. **Sparkline data source:** The API returns trend direction but not daily price points. Should we:
   - (A) Add sparkline data to `/api/dashboard/pulse` endpoint
   - (B) Generate mock sparkline from trend direction
   - (C) Skip sparklines for MVP

2. **"Today's Best Moves" algorithm:** Currently the API returns deals sorted by retailer tier + price. Should we:
   - (A) Use the top deal as the hero recommendation
   - (B) Create a separate "recommendation" endpoint with smarter logic
   - (C) Use a weighted score (price delta + stock + retailer trust)

3. **Mobile priority:** The spec mentions mobile-first. Should we:
   - (A) Build mobile layouts first, then desktop
   - (B) Build desktop first (matches existing patterns), then mobile
   - (C) Build both simultaneously with responsive breakpoints

4. **Premium upgrade moment copy:** The spec lists specific copy like "Unlock price timing and savings context →". Should these be:
   - (A) Hardcoded in components
   - (B) Centralized in a constants file for easy A/B testing
   - (C) Fetched from API for dynamic experimentation

---

## Ready to Proceed

Once questions are answered, implementation will follow the file creation order above. Each component will include:
- TypeScript types
- Storybook stories (if time permits)
- Mobile-responsive styling
- Loading/error states
- Tier-aware feature gating

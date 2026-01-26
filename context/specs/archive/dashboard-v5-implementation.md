# Dashboard v5 — Implementation Specification

**Status:** Implementation-Ready
**Source of Truth:** ADR-020, dashboard-product-spec-v5.md, v5-patch-001
**Date:** 2026-01-24

---

## A. Updated Dashboard Layout

### Top-to-Bottom Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER REGION (Persistent)                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Your Watchlist                                              │ │
│ │ Monitoring 8 items across 47 retailers · Updated 2h ago    │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ SPOTLIGHT REGION (Ephemeral — renders only when qualifying)    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ℹ Federal 9mm 124gr is at its lowest price in 90 days [×]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ WATCHLIST TABLE (Primary Surface — always rendered if items)   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Product           │ $/rd   │ Trend │ 24h │ Status │ Watch │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Federal 9mm 124gr │ $0.28  │ ▁▂▃▂▁ │  ↓  │ 90d low│   ★   │ │
│ │ Hornady .308 168  │ $1.42  │ ▂▂▂▂▂ │  —  │        │   ★   │ │
│ │ CCI .22LR 40gr    │ $0.08  │ ▃▂▁▂▃ │  —  │        │   ★   │ │
│ │ Winchester 5.56   │ $0.52  │ ▂▂▂▁▁ │  ↓  │        │   ★   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [View all watchlist →]                                          │
├─────────────────────────────────────────────────────────────────┤
│ PRICE MOVEMENT (Collapsed — expands on click)                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ▸ 2 price changes in the last 24 hours                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ FOOTER REGION (Persistent vitality)                             │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 9mm prices are 8% below the 30-day average · 12/15 in stock │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Persistence Model

| Region | Persistence | Renders When |
|--------|-------------|--------------|
| Header (title + monitoring summary) | **Always** | Items exist in watchlist |
| Spotlight | Ephemeral | Qualifying signal in last 7 days, not dismissed |
| Watchlist Table | **Always** | Items exist in watchlist |
| Price Movement | Ephemeral | Price changes exist in last 24h |
| Footer (market context) | **Always** | Items exist in watchlist |

### Quiet Day vs Active Day

| Element | Quiet Day | Active Day |
|---------|-----------|------------|
| Monitoring summary | ✓ Visible | ✓ Visible |
| Spotlight | ✗ Not rendered | ✓ Single notice |
| Watchlist rows | ✓ No status badges | ✓ Badges on exceptions |
| 24h column | All show "—" | ↓/↑ on changes |
| Price Movement | ✗ Hidden or "No changes" | ✓ Collapsed with count |
| Market context | ✓ Visible (rotates) | ✓ Visible (rotates) |

---

## B. Component-Level Definitions

### B.1 Header Region

```tsx
interface HeaderRegionProps {
  title: string              // "Your Watchlist"
  monitoringSummary: {
    itemCount: number        // 8
    retailerCount: number    // 47
    lastUpdated: Date        // for relative time
  }
}
```

**Layout:**
```
Your Watchlist
Monitoring {itemCount} items across {retailerCount} retailers · Updated {relativeTime}
```

**Styling:**
- Title: `text-xl font-semibold text-foreground`
- Summary: `text-sm text-muted-foreground`
- Single line, no wrapping
- No icons, no badges

**Relative Time Format:**
| Elapsed | Display |
|---------|---------|
| < 1 hour | "Updated just now" |
| 1-23 hours | "Updated {n}h ago" |
| 1-6 days | "Updated {n}d ago" |
| > 7 days | "Updated {date}" |

---

### B.2 Spotlight Notice

```tsx
interface SpotlightNoticeProps {
  productName: string        // "Federal 9mm 124gr"
  reason: SpotlightReason    // '90d_low' | 'back_in_stock' | 'significant_drop'
  productId: string          // for navigation
  onDismiss: () => void
}

type SpotlightReason = '90d_low' | 'back_in_stock' | 'significant_drop'
```

**Copy Templates:**
| Reason | Template |
|--------|----------|
| `90d_low` | "{productName} is at its lowest price in 90 days" |
| `back_in_stock` | "{productName} is back in stock" |
| `significant_drop` | "{productName} dropped {percent}% since last week" |

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ℹ {copy}                                               [×]  │
└─────────────────────────────────────────────────────────────┘
```

**Styling:**
- Container: `h-10 bg-muted/50 border-0 rounded-md px-4 flex items-center`
- Icon: `text-muted-foreground` (info icon, 16px)
- Text: `text-sm text-foreground flex-1`
- Dismiss: `text-muted-foreground hover:text-foreground` (X icon, 16px)
- No shadow, no border emphasis

**Behavior:**
- Click anywhere (except dismiss) → Navigate to product detail
- Click dismiss → Remove from DOM, set session flag
- Max 1 spotlight per session

---

### B.3 Watchlist Table

```tsx
interface WatchlistTableProps {
  items: WatchlistItem[]
  maxVisible: number         // 10
}

interface WatchlistItem {
  id: string
  productName: string        // truncate at 40 chars
  pricePerRound: number
  sparklineData: number[]    // last 30 days, normalized 0-1
  change24h: 'up' | 'down' | 'none'
  status: WatchlistStatus | null
  isWatched: boolean
}

type WatchlistStatus = '90d_low' | 'back_in_stock'
```

**Columns:**

| Column | Width | Content | Alignment |
|--------|-------|---------|-----------|
| Product | flex-1 | Name (truncated) | Left |
| $/rd | 80px | Price formatted | Right |
| Trend | 60px | Sparkline | Center |
| 24h | 40px | Arrow or dash | Center |
| Status | 80px | Badge or empty | Center |
| Watch | 40px | Star toggle | Center |

**Row Styling:**
- Height: `h-12` (48px)
- Hover: `hover:bg-muted/30`
- No borders between rows (use alternating subtle bg if needed)
- No shadow, no card treatment

**Sparkline Spec:**
- Size: `w-14 h-4` (56px × 16px)
- Color: `stroke-muted-foreground/50`
- No axes, no labels, no interactivity
- Stroke width: 1.5px

**24h Column:**
| State | Display | Color |
|-------|---------|-------|
| Price decreased | ↓ | `text-muted-foreground` |
| Price increased | ↑ | `text-muted-foreground` |
| No change | — | `text-muted-foreground/50` |

**Status Badge:**
- Only render when status is non-null
- Style: `text-xs px-2 py-0.5 rounded bg-muted text-foreground`
- Copy: "90d low" or "Back in stock"
- No color coding (no green/red)

**Status Collapse Rule:**
If 3+ items share the same status, replace per-row badges with footer summary:
```
{count} items at 90-day lows
```

---

### B.4 Price Movement Accordion

```tsx
interface PriceMovementProps {
  changes: PriceChange[]
  isExpanded: boolean
  onToggle: () => void
}

interface PriceChange {
  productId: string
  productName: string
  direction: 'up' | 'down'
  pricePerRound: number
  source?: 'watchlist' | 'gun_locker'
  caliber?: string           // for gun locker attribution
}
```

**Collapsed State:**
```
┌─────────────────────────────────────────────────────────────┐
│ ▸ {count} price change(s) in the last 24 hours              │
└─────────────────────────────────────────────────────────────┘
```

**Expanded State:**
```
┌─────────────────────────────────────────────────────────────┐
│ ▾ 2 price changes in the last 24 hours                      │
├─────────────────────────────────────────────────────────────┤
│ ↓ Federal 9mm 124gr        $0.28/rd                    [→] │
│ ↓ Winchester 5.56 M855     $0.52/rd   Matches 5.56    [→] │
└─────────────────────────────────────────────────────────────┘
```

**Styling:**
- Header: `text-sm text-muted-foreground cursor-pointer`
- Chevron: rotates on expand
- Row: `h-10 text-sm`
- Arrow: `text-muted-foreground` (no color coding)
- Action: `[→]` navigates to product

**Limits:**
- Max 3 visible after expansion
- If > 3: show "Show {n} more" link
- Max 5 total

**Gun Locker Attribution:**
- Append: `Matches {caliber}` in muted text
- Only for gun_locker sourced items

---

### B.5 Footer Market Context

```tsx
interface MarketContextProps {
  observations: MarketObservation[]
  stockSummary: {
    inStock: number
    total: number
  }
}

interface MarketObservation {
  id: string
  type: 'caliber_trend' | 'availability' | 'coverage'
  copy: string
}
```

**Layout:**
```
{observation.copy} · {inStock}/{total} in stock
```

**Example Copy:**
| Type | Example |
|------|---------|
| caliber_trend | "9mm prices are 8% below the 30-day average" |
| availability | "Availability improved across tracked items" |
| coverage | "Monitoring prices from 47 retailers" |

**Rotation Logic:**
- Select one observation per page load
- Prefer variety: don't repeat same type consecutively
- Cycle through available observations

**Styling:**
- Container: `py-4 text-center`
- Text: `text-xs text-muted-foreground`
- No icons, no emphasis

---

## C. Conditional Logic

### C.1 Render Conditions

```typescript
function shouldRenderSpotlight(signals: Signal[]): boolean {
  const validSignals = signals.filter(s =>
    s.eventAt > Date.now() - 7 * 24 * 60 * 60 * 1000 &&
    !isSessionDismissed(s.id)
  )
  return validSignals.length > 0
}

function shouldRenderPriceMovement(changes: PriceChange[]): boolean {
  return changes.filter(c =>
    c.changedAt > Date.now() - 24 * 60 * 60 * 1000
  ).length > 0
}

function getWatchlistStatusBadge(item: WatchlistItem): string | null {
  if (item.isAt90DayLow) return '90d low'
  if (item.justRestocked) return 'Back in stock'
  return null  // silence is default
}

function shouldCollapseStatus(items: WatchlistItem[]): boolean {
  const withStatus = items.filter(i => getWatchlistStatusBadge(i) !== null)
  const statusCounts = groupBy(withStatus, i => getWatchlistStatusBadge(i))
  return Object.values(statusCounts).some(group => group.length >= 3)
}
```

### C.2 Quiet Day Rendering

When no exceptional events exist:

```tsx
function QuietDayDashboard({ items, marketContext }: Props) {
  return (
    <div>
      {/* Header - ALWAYS */}
      <HeaderRegion
        title="Your Watchlist"
        monitoringSummary={monitoringSummary}
      />

      {/* Spotlight - NOT RENDERED */}
      {/* No placeholder, no empty state */}

      {/* Watchlist - ALWAYS */}
      <WatchlistTable
        items={items}
        // All items have status: null (silence)
        // All items have change24h: 'none' (dash)
      />

      {/* Price Movement - HIDDEN */}
      {/* Could show: "No price changes in the last 24 hours" */}
      {/* Or: simply not rendered */}

      {/* Footer - ALWAYS */}
      <MarketContext observation={marketContext} />
    </div>
  )
}
```

### C.3 Active Day Rendering

When exceptional events exist:

```tsx
function ActiveDayDashboard({ items, signals, changes, marketContext }: Props) {
  const spotlightSignal = selectSpotlightSignal(signals)
  const shouldCollapse = shouldCollapseStatus(items)

  return (
    <div>
      {/* Header - ALWAYS */}
      <HeaderRegion
        title="Your Watchlist"
        monitoringSummary={monitoringSummary}
      />

      {/* Spotlight - CONDITIONAL */}
      {spotlightSignal && (
        <SpotlightNotice
          productName={spotlightSignal.productName}
          reason={spotlightSignal.reason}
          onDismiss={() => dismissSpotlight(spotlightSignal.id)}
        />
      )}

      {/* Watchlist - ALWAYS */}
      <WatchlistTable
        items={items}
        collapseStatus={shouldCollapse}
      />

      {/* Status Summary (if collapsed) */}
      {shouldCollapse && (
        <StatusSummary items={items} />
      )}

      {/* Price Movement - CONDITIONAL */}
      {changes.length > 0 && (
        <PriceMovementAccordion changes={changes} />
      )}

      {/* Footer - ALWAYS */}
      <MarketContext observation={marketContext} />
    </div>
  )
}
```

### C.4 Cold Start Rendering

When user has no watchlist items:

```tsx
function ColdStartDashboard() {
  return (
    <div>
      {/* Header - simplified */}
      <HeaderRegion
        title="Your Watchlist"
        monitoringSummary={null}  // no summary when empty
      />

      {/* Onboarding */}
      <OnboardingCard>
        <p>You haven't started tracking yet.</p>
        <p>Search ammo and save items to monitor price and availability over time.</p>
        <div>
          <Button href="/search">Search ammo</Button>
          <Link href="/help/tracking">How tracking works</Link>
        </div>
      </OnboardingCard>

      {/* No Spotlight, no Price Movement, no Footer */}
    </div>
  )
}
```

---

## D. "Excitement Without Pressure" Checklist

### For Engineers

Before shipping, verify each item:

| # | Check | Pass |
|---|-------|------|
| 1 | Spotlight is ≤40px tall and has no shadow/border | ☐ |
| 2 | Spotlight can be dismissed and does not reappear until next session | ☐ |
| 3 | Watchlist renders as a table, not cards | ☐ |
| 4 | Watchlist row height is ≤48px | ☐ |
| 5 | Status badges appear only on exceptional items (not every row) | ☐ |
| 6 | 3+ items with same status collapse to summary footnote | ☐ |
| 7 | Price Movement is collapsed by default | ☐ |
| 8 | No "PRICE DROP" or equivalent labels appear anywhere | ☐ |
| 9 | No red/green color coding for price direction | ☐ |
| 10 | Monitoring summary appears on every non-cold-start load | ☐ |
| 11 | Market context line appears on every non-cold-start load | ☐ |
| 12 | Quiet day dashboard shows vitality elements (summary, context) | ☐ |
| 13 | No countdown timers or animated attention indicators | ☐ |
| 14 | No "deals," "recommended," "best," or "top" language | ☐ |

### For Designers

| # | Check | Pass |
|---|-------|------|
| 1 | No element visually dominates over the Watchlist | ☐ |
| 2 | Spotlight feels like a notice, not a hero | ☐ |
| 3 | Quiet day feels intentional, not broken | ☐ |
| 4 | Active day feels informative, not urgent | ☐ |
| 5 | User can learn "what changed" without feeling told "what to do" | ☐ |
| 6 | Return visits feel rewarded (vitality varies) | ☐ |

### For Product

| # | Check | Pass |
|---|-------|------|
| 1 | Dashboard answers "what is the state?" not "what should I buy?" | ☐ |
| 2 | No recommendation creep has been introduced | ☐ |
| 3 | ADR-020 constraints are fully honored | ☐ |
| 4 | Acceptance test passes: "Patient buyer feels informed, not nudged" | ☐ |

---

## E. Implementation Notes

### State Management

```typescript
interface DashboardState {
  // Persisted
  watchlistItems: WatchlistItem[]

  // Session-only
  dismissedSpotlightIds: Set<string>
  priceMovementExpanded: boolean

  // Derived
  monitoringSummary: MonitoringSummary
  marketContext: MarketObservation
  spotlightSignal: Signal | null
  recentChanges: PriceChange[]
}
```

### API Requirements

```typescript
// GET /api/dashboard/v5
interface DashboardV5Response {
  watchlist: {
    items: WatchlistItem[]
    summary: {
      itemCount: number
      retailerCount: number
      lastUpdated: string  // ISO timestamp
    }
  }

  signals: {
    spotlight: Signal | null
    priceChanges: PriceChange[]
  }

  context: {
    observations: MarketObservation[]
    stockSummary: {
      inStock: number
      total: number
    }
  }
}
```

### Performance Targets

| Metric | Target |
|--------|--------|
| Initial render | < 100ms after data |
| Sparkline render | < 16ms per row |
| Accordion expand | < 50ms |
| Total bundle size | < 15kb gzipped |

---

## F. Acceptance Validation

Before launch, the dashboard must pass this test:

> **"A patient ammo buyer should feel informed, oriented, and rewarded for checking — without feeling nudged."**

Validation method:
1. Load dashboard on quiet day (no signals)
2. Verify: monitoring summary visible, market context visible, no urgency
3. Load dashboard on active day (1 spotlight, 2 price changes)
4. Verify: spotlight is subtle, watchlist is calm, changes are collapsed
5. Ask: "Does this feel like a deal feed?" If yes, fail.
6. Ask: "Does this feel dead?" If yes, fail.
7. Ask: "Do I know what changed?" If no, fail.
8. Ask: "Do I feel told what to do?" If yes, fail.

All four must pass for launch approval.
# Status: Superseded
Superseded by ADR-020. Do not use for v1 behavior.

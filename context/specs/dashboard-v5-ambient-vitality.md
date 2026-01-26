# Dashboard v5 — Ambient Vitality Design Revision

**Status:** Design Specification
**Problem:** Dashboard feels "quiet but empty" rather than "quiet but alive"
**Date:** 2026-01-24

---

## 1. Diagnosis

The current implementation has correct structure but insufficient **ambient vitality**:

| What Works | What's Missing |
|------------|----------------|
| Watchlist is table-based, not cards | No sense of ongoing activity |
| Spotlight is demoted to notice bar | Static feel on quiet days |
| Status appears only on exceptions | Nothing rewards returning when stable |
| Price Movement is collapsed | Monitoring feels passive, not active |

**Root cause:** The page communicates *state* but not *activity*. Users see what exists but don't feel that the system is working for them.

---

## 2. Revised Layout Model

### Visual Hierarchy (Top → Bottom)

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Your Watchlist                                              │ │
│ │ ● Actively monitoring · Last scan 12 min ago                │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ SPOTLIGHT (ephemeral, only when qualifying)                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ℹ Federal 9mm is at its lowest price in 90 days        [×]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ MARKET PULSE (ambient vitality — always visible)                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  9mm ▁▂▃▂▁ stable    .308 ▂▃▄▃▂ +3%    5.56 ▃▂▁▂▃ -2%     │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ WATCHLIST TABLE (primary surface)                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Product           │ $/rd   │ Trend │ 24h │ Status │ ☆     │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Federal 9mm 124gr │ $0.28  │ ▁▂▃▂▁ │  ↓  │ 90d low│ ★     │ │
│ │ Hornady .308 168  │ $1.42  │ ▂▂▂▂▂ │  —  │        │ ★     │ │
│ │ CCI .22LR 40gr    │ $0.08  │ ▃▂▁▂▃ │  —  │        │ ★     │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ ACTIVITY LOG (collapsed, optional)                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ▸ 2 price changes in the last 24 hours                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ FOOTER (market context — rotates daily)                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Prices checked across 47 retailers · 12/15 items in stock   │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Ambient Vitality Components

### 3.1 Active Monitoring Indicator (Header)

**Before:** "Monitoring 8 items across 47 retailers · Updated 2h ago"
**After:** "● Actively monitoring · Last scan 12 min ago"

| Element | Treatment |
|---------|-----------|
| Pulse dot | `●` in muted green (`text-emerald-600/60`), no animation |
| "Actively monitoring" | Communicates ongoing work, not static state |
| "Last scan X ago" | Dynamic freshness, not timestamp |

**Copy variants:**
- "● Actively monitoring · Last scan 12 min ago"
- "● Actively monitoring · Checked 47 retailers today"
- "● Actively monitoring · 3 scans completed today"

**Why this works:** Users feel the system is *working*, not *waiting*.

---

### 3.2 Market Pulse Strip (New Component)

A single-line horizontal strip showing **caliber-level trends** for tracked calibers.

```
  9mm ▁▂▃▂▁ stable    .308 ▂▃▄▃▂ +3%    5.56 ▃▂▁▂▃ -2%
```

| Element | Spec |
|---------|------|
| Position | Below header, above Watchlist |
| Height | 32px single line |
| Content | Mini sparkline + trend label per tracked caliber |
| Max calibers | 4 (scroll if more) |
| Trend labels | "stable", "+X%", "-X%" vs 7-day avg |
| Styling | `text-xs text-muted-foreground`, no emphasis |

**Why this works:**
- Shows market is moving even when individual items aren't
- Provides context without product-specific recommendations
- Changes daily, rewarding return visits
- Not actionable — purely observational

**What this is NOT:**
- Not rankings ("best caliber to buy")
- Not recommendations ("prices dropping, buy now")
- Not urgency ("act before prices rise")

---

### 3.3 Scan Activity Indicator

Subtle indicator that monitoring is actively running:

| State | Display |
|-------|---------|
| Scan in progress | "Checking prices..." (appears briefly) |
| Scan complete | "Prices up to date" (fades after 3s) |
| Last scan > 1h | "Last checked 2h ago" |

**Implementation:**
- Appears in header subtitle area
- Muted text, no animation except brief fade
- Never interrupts or demands attention

---

### 3.4 Coverage Context (Footer)

Rotating factual observations about monitoring scope:

| Day | Example |
|-----|---------|
| Mon | "Prices checked across 47 retailers · 12/15 items in stock" |
| Tue | "Tracking 847 products matching your calibers" |
| Wed | "Coverage: 47 retailers across 23 states" |
| Thu | "9mm availability improved 12% this week" |
| Fri | "Your tracked items span 6 calibers" |

**Rules:**
- One observation per visit (rotates)
- Purely factual, no implications
- Stock summary always appended when available
- Muted styling (`text-xs text-muted-foreground`)

---

## 4. Component Definitions

### 4.1 Header Region

```tsx
interface HeaderRegionProps {
  isActivelyMonitoring: boolean
  lastScanAt: Date
  scanVariant: 'time' | 'count' | 'retailers'
}

// Renders:
// Your Watchlist
// ● Actively monitoring · Last scan 12 min ago
```

**Variants:**
```
● Actively monitoring · Last scan 12 min ago
● Actively monitoring · Checked 47 retailers today
● Actively monitoring · 3 scans completed today
```

---

### 4.2 Market Pulse Strip

```tsx
interface MarketPulseProps {
  calibers: Array<{
    name: string           // "9mm"
    sparkline: number[]    // normalized 0-1
    trend: 'stable' | 'up' | 'down'
    percentChange: number  // vs 7-day avg
  }>
  maxVisible?: number      // default 4
}

// Renders:
// 9mm ▁▂▃▂▁ stable    .308 ▂▃▄▃▂ +3%    5.56 ▃▂▁▂▃ -2%
```

**Styling:**
- Container: `h-8 flex items-center gap-6 overflow-x-auto`
- Caliber: `text-xs font-medium text-foreground`
- Sparkline: `w-10 h-3` inline SVG
- Trend: `text-xs text-muted-foreground` (no color coding)

---

### 4.3 Watchlist Row (Final)

```tsx
interface WatchlistRowProps {
  productName: string
  pricePerRound: number
  sparkline: number[]
  change24h: 'up' | 'down' | 'none'
  status: '90d_low' | 'back_in_stock' | null
  isWatched: boolean
}
```

**Columns:**
| Column | Width | Content |
|--------|-------|---------|
| Product | flex | Name (40 char max) |
| $/rd | 70px | Price |
| Trend | 50px | Sparkline |
| 24h | 30px | Arrow or dash |
| Status | 70px | Badge or empty |
| Watch | 30px | Star toggle |

**Row height:** 44px
**Hover:** `bg-muted/30`
**Default status:** Empty (silence)

---

### 4.4 Activity Log (Collapsed)

```tsx
interface ActivityLogProps {
  changes: PriceChange[]
  isExpanded: boolean
  onToggle: () => void
}

// Collapsed:
// ▸ 2 price changes in the last 24 hours

// Expanded:
// ▾ 2 price changes in the last 24 hours
// ↓ Federal 9mm 124gr        $0.28/rd    →
// ↓ Winchester 5.56 M855     $0.52/rd    →
```

**Rules:**
- Collapsed by default
- Max 3 visible when expanded
- No "PRICE DROP" labels
- Arrows only (↓ ↑)

---

## 5. Before vs After

### Before (Current)

```
┌─────────────────────────────────────┐
│ Your Watchlist                      │
│ Monitoring 8 items...               │  ← Static, feels passive
├─────────────────────────────────────┤
│                                     │  ← No ambient context
├─────────────────────────────────────┤
│ [Watchlist rows...]                 │  ← Correct but lonely
├─────────────────────────────────────┤
│ ▸ 0 price changes                   │  ← Nothing to see
├─────────────────────────────────────┤
│ 12/15 in stock                      │  ← Minimal context
└─────────────────────────────────────┘

User thinks: "Nothing's happening. Why did I come here?"
```

### After (Revised)

```
┌─────────────────────────────────────┐
│ Your Watchlist                      │
│ ● Actively monitoring · 12 min ago  │  ← Feels alive
├─────────────────────────────────────┤
│ 9mm ▁▂▃▂▁ stable  .308 ▂▃▄▃▂ +3%   │  ← Market is moving
├─────────────────────────────────────┤
│ [Watchlist rows with sparklines]    │  ← Rich but calm
├─────────────────────────────────────┤
│ ▸ No price changes today            │  ← Explicitly peaceful
├─────────────────────────────────────┤
│ Tracking 847 products · 12/15 stock │  ← Scope is impressive
└─────────────────────────────────────┘

User thinks: "System's running, market's stable, my items are covered."
```

---

## 6. Why This Works

### Creates Life Without Urgency

| Element | Creates Life | Avoids Urgency |
|---------|--------------|----------------|
| "Actively monitoring" | System is working | No action implied |
| Market Pulse sparklines | Market is moving | No "buy now" signal |
| "Last scan 12 min ago" | Fresh data | Not a countdown |
| Coverage facts | Scope is broad | No FOMO |
| Rotating context | Each visit is different | No rankings |

### Rewards Returning Without Pushing Action

| Visit Type | What User Sees | What User Feels |
|------------|----------------|-----------------|
| Active day | Spotlight + price changes | "Good to know" |
| Quiet day | Market pulse + coverage | "System's working" |
| Week later | Different context fact | "Still valuable" |

---

## 7. Failure Mode Checks

### How This Avoids Boredom

| Risk | Mitigation |
|------|------------|
| Same content every visit | Context rotates daily |
| Nothing to look at | Market Pulse always shows caliber trends |
| Feels pointless | "Actively monitoring" confirms value |
| No reason to return | Different facts each visit |

### How This Avoids Recommendation Creep

| Risk | Mitigation |
|------|------------|
| Market Pulse becomes "buy signal" | Shows all calibers equally, no ranking |
| Trends imply action | Uses "stable/+X%/-X%" not "rising/falling" |
| Coverage becomes bragging | Purely factual, no superlatives |
| Activity Log becomes feed | Collapsed by default, limited to 3 |

---

## 8. Implementation Changes

### New Components Required

1. **MarketPulseStrip** — Horizontal caliber trend strip
2. **ActiveMonitoringIndicator** — Pulse dot + dynamic text
3. **ScanActivityIndicator** — Brief "checking prices" feedback

### Modified Components

1. **MonitoringSummary** → **ActiveMonitoringHeader**
   - Add pulse dot
   - Dynamic scan recency
   - Rotate copy variants

2. **MarketContext** → **CoverageContext**
   - More varied observations
   - Daily rotation logic
   - Scope-focused messaging

### Data Requirements

```typescript
interface DashboardVitalityData {
  // Monitoring status
  isActivelyMonitoring: boolean
  lastScanAt: string
  scansToday: number
  retailersChecked: number

  // Market pulse
  caliberTrends: Array<{
    caliber: string
    sparkline: number[]
    trendVs7Day: number
  }>

  // Coverage context (one per day)
  coverageObservation: {
    type: 'retailers' | 'products' | 'coverage' | 'availability'
    copy: string
  }

  // Stock summary
  stockSummary: {
    inStock: number
    total: number
  }
}
```

---

## 9. Final Acceptance Test

### Does this dashboard ever feel like something I should "scan" for opportunities?

**No.**
- Watchlist is a status table, not a deal list
- Market Pulse shows trends, not recommendations
- No rankings, no "best," no emphasized prices
- Spotlight is ephemeral and dismissible

### Does it still feel useful on a day when no prices changed?

**Yes.**
- "Actively monitoring" confirms system is working
- Market Pulse shows caliber-level movement
- Coverage context provides new information
- Sparklines show 30-day trends even if today is flat

### Does it reward returning without pushing action?

**Yes.**
- Coverage context rotates daily
- Market Pulse changes with market
- Scan recency confirms freshness
- No urgency, no "act now," no FOMO

---

## 10. Summary

The revised design introduces **ambient vitality** through:

1. **Active monitoring indicator** — System is working for you
2. **Market Pulse strip** — Market is moving even when items aren't
3. **Rotating coverage context** — Each visit reveals something new
4. **Scan freshness** — Data is current and actively refreshed

These elements create a sense of **ongoing value** without introducing urgency, recommendations, or feed-like behavior.

The dashboard becomes a **living monitoring console** rather than a **static list waiting for deals**.

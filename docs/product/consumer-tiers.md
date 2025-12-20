# IronScout Consumer Tier Model

**Last Updated:** December 19, 2025

## Core Principle

> **Free helps you find deals.**
> **Premium helps you win deals.**

Free users see what exists. Premium users see why it matters.

---

## Pricing

| Plan | Price | Value Proposition |
|------|-------|-------------------|
| Free | $0 | Smart discovery, baseline usefulness |
| Premium Monthly | $7.99/mo | Decision advantage, pays for itself |
| Premium Annual | $69.99/yr | ~$5.83/mo, 27% savings |

**Pricing Anchor:** "Average Premium user saves $X/month" - display prominently.

---

## FREE TIER — "Smart Discovery"

**Goal:** Habit formation. Trust. Baseline usefulness.
**User Mindset:** "This is already better than AmmoSeek."

### Dashboard (Limited)

| Feature | What Free Gets | What's Withheld |
|---------|----------------|-----------------|
| **Today's Best Moves** | Verdict only (Buy / Wait / Stable) | No quantified savings, no historical context |
| **Deals for You** | 5 deals max | No urgency signals, no stock countdowns |
| **Market Pulse** | 2 calibers max, current avg + 7-day arrow | No historical charts, no buy/wait score |

### Search

| Feature | Free Access |
|---------|-------------|
| Full search | Yes |
| Canonicalized products | Yes |
| Basic filters (caliber, brand, round count) | Yes |
| Best current price per SKU | Yes |
| Premium filters (bullet type, subsonic, etc.) | Locked |
| Purpose-optimized ranking | Basic only |
| Best Value scoring | Hidden |
| AI explanations | Hidden |

### Alerts (Basic)

| Feature | Free Limit |
|---------|------------|
| Alert type | Caliber-level only (not product-specific) |
| Alert count | 3 max |
| Notification speed | Delayed (60 minutes) |
| Conditions | Price only (no stock triggers) |

### Watchlist (Lite)

| Feature | Free Limit |
|---------|------------|
| Items tracked | 5 max |
| Price history charts | None (locked teaser) |
| "Buy Best" CTA | Hidden |
| Collections/Loadouts | Not available |

### Trust Signals (Read-Only)

| Feature | Free Access |
|---------|-------------|
| Retailer ratings | View only |
| Community saves | View only |
| Retailer exclusions | Not available |

### Free Tier Hard Limits

**Free users CANNOT:**
- View historical price charts
- See price delta vs average ("15% below target")
- Get "why now" explanations
- Receive AI recommendations
- Create collections or loadouts
- Track savings
- Set product-level alerts
- Get real-time notifications

> **Free users can browse and wait. They cannot optimize.**

---

## PREMIUM TIER — "Decision Advantage"

**Goal:** Make money feel left on the table without it.
**User Mindset:** "This pays for itself."

### Full Dashboard Experience

| Feature | Premium Gets |
|---------|--------------|
| **Today's Best Moves** | Buy/Wait verdicts + quantified savings + time-based urgency |
| **Deals for You** | 20 deals + flash deals + stock depletion indicators |
| **Market Intelligence** | All calibers + Buy/Wait score (1-100) + 30/90/365-day history + volatility |

### Market Intelligence (Full)

| Feature | Description |
|---------|-------------|
| Buy/Wait Score | 1-100 score indicating optimal purchase timing |
| Price History | 30, 90, and 365-day charts |
| "Best Time to Buy" | Historical pattern insights |
| Volatility Indicators | Price stability metrics |

> This is where we outclass competitors.

### Watchlist 2.0

| Feature | Premium Gets |
|---------|--------------|
| Item limit | Unlimited |
| Collections/Loadouts | Yes (e.g., "Home Defense Kit", "Range Day") |
| Price history sparklines | Inline 30-day charts |
| Lowest price badges | "Lowest in X days" indicators |
| Buy Best CTA | Direct purchase optimization |
| Retailer controls | Inclusion/exclusion preferences |

> This is the strongest upgrade driver.

### Alerts (Advanced)

| Feature | Premium Gets |
|---------|--------------|
| Alert type | Product-level (specific SKUs) |
| Alert count | Unlimited |
| Notification speed | Real-time (instant) |
| Conditions | Multi-condition (price + stock) |
| Processing | Priority queue |

> Alerts go from "FYI" to "weaponized."

### AI Recommendations

| Feature | Description |
|---------|-------------|
| Context-aware suggestions | Based on user history and preferences |
| Use-case guidance | Range, defense, competition, hunting |
| Price-aware recommendations | Factors in current market conditions |
| "Why this / why now" | Explanations for every recommendation |

> AI is advice, not discovery.

### Savings & ROI Tracking

| Feature | Description |
|---------|-------------|
| Verified savings | Actual savings with purchase confirmation + attribution |
| Monthly/Lifetime savings | Running totals with deal attribution |
| Achievement milestones | Lightweight gamification |
| "Paid for itself" | Messaging when savings > subscription cost |

> Free tier shows "potential savings" only. Premium shows verified savings with purchase tracking. This neutralizes churn.

### Trust & Control (Premium)

| Feature | Description |
|---------|-------------|
| Retailer inclusion/exclusion | Personalize which retailers appear |
| Trust-weighted ranking | Deals sorted by retailer reliability |
| Faster refresh cadence | Priority updates for watched SKUs |
| High-confidence dealers | Priority access to verified retailers |

---

## Feature Comparison Matrix

| Category | Feature | Free | Premium |
|----------|---------|------|---------|
| **Dashboard** | Today's Best Moves verdict | Yes | Yes |
| | Quantified savings | No | Yes |
| | Urgency signals | No | Yes |
| | Deals for You | 5 deals | 20 deals + Flash |
| | Market Pulse calibers | 2 max | Unlimited |
| | Market Pulse (current price) | Yes + 7-day arrow | Yes + charts |
| | Price history charts | No (locked teaser) | 30/90/365 days |
| | Buy/Wait score | No | Yes (1-100) |
| **Search** | Full search access | Yes | Yes |
| | Basic filters | Yes | Yes |
| | Premium filters | No | Yes |
| | Purpose-optimized ranking | Basic | Advanced |
| | Best Value scoring | No | Yes |
| | AI explanations | No | Yes |
| **Alerts** | Alert type | Caliber | Product |
| | Max alerts | 3 | Unlimited |
| | Speed | 60-min delay | Real-time |
| | Multi-condition | No | Yes |
| **Watchlist** | Max items | 5 | Unlimited |
| | Price history | No (locked teaser) | Sparklines |
| | Collections | No | Yes |
| | Buy Best CTA | No | Yes |
| | Retailer controls | No | Yes |
| **AI** | Recommendations | No | Yes |
| | "Why now" explanations | No | Yes |
| **Tracking** | Savings tracker | Potential only | Verified + attribution |
| | Achievements | No | Yes |
| **Trust** | Retailer ratings | View | View + Control |
| | Exclusion controls | No | Yes |

---

## Psychological Design

| User State | Free Experience | Premium Experience |
|------------|-----------------|-------------------|
| Sees a deal | "Good price" | "15% below your target, lowest in 30 days" |
| Misses a deal | Doesn't know | Gets notified instantly |
| Wants to buy | Searches manually | Gets "Buy Best" with optimal retailer |
| Tracks prices | Manual checking | Automatic sparklines + alerts |
| Evaluates timing | Guesses | Sees historical data + Buy/Wait score |

> The moment a user waits too long or misses a deal, Premium becomes obvious.

---

## Implementation Status

### Implemented

- [x] Search with basic/premium filter gating
- [x] Alert limit enforcement (3 Free / Unlimited Premium)
- [x] Alert delay (60-min Free / Instant Premium)
- [x] Premium filters UI with locked state
- [x] Purpose-optimized ranking
- [x] Best Value scoring
- [x] AI explanations
- [x] Performance badges
- [x] Stripe subscription integration
- [x] Price history backend

### Partially Implemented

- [ ] Dashboard Market Pulse (needs Buy/Wait score)
- [ ] Today's Best Moves (needs verdicts + savings)
- [ ] Deals for You feed (needs personalization)
- [ ] Watchlist with sparklines
- [ ] Product-level alerts (currently caliber-only)

### Not Implemented

- [ ] Collections/Loadouts
- [ ] Savings tracker (verified with attribution)
- [ ] Achievement milestones
- [ ] Retailer exclusion controls
- [ ] Flash deals system
- [ ] Stock depletion indicators
- [ ] Multi-condition alerts

### Phase 3 (Later)

- [ ] Community saves and trending
- [ ] Trust signals (verified purchases, retailer ratings)
- [ ] Community-driven deal discovery

> Community/Trust features ship after the core "decide + buy" loop works. They add value but also introduce moderation and fraud surface area.

---

## Configuration

```typescript
// apps/api/src/config/tiers.ts
FREE: {
  maxActiveAlerts: 3,
  alertDelayMinutes: 60,
  priceHistoryDays: 0,
  maxWatchlistItems: 5,
  searchResultsLimit: 20,
  features: {
    premiumFilters: false,
    aiRecommendations: false,
    savingsTracker: false,
    collections: false,
    retailerControls: false,
  }
}

PREMIUM: {
  maxActiveAlerts: -1,  // Unlimited
  alertDelayMinutes: 0, // Real-time
  priceHistoryDays: 365,
  maxWatchlistItems: -1, // Unlimited
  searchResultsLimit: 100,
  features: {
    premiumFilters: true,
    aiRecommendations: true,
    savingsTracker: true,
    collections: true,
    retailerControls: true,
  }
}
```

---

## Key Changes from Previous Model

| Area | Previous | New |
|------|----------|-----|
| Pricing | $4.99/mo, $49.99/yr | $7.99/mo, $69.99/yr |
| Free price history | Some access | None (locked teaser) |
| Free AI recommendations | Some access | None |
| Dashboard verdicts | Not defined | Free gets verdict, Premium gets context |
| Watchlist | Not defined | 5 Free, Unlimited Premium |
| Market Pulse calibers | Not defined | 2 Free, Unlimited Premium |
| Deals for You | Not defined | 5 Free, 20 Premium |
| Product alerts | Both tiers | Premium only |
| Savings tracking | Not defined | Potential (Free), Verified (Premium) |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Free → Premium conversion | 5-10% |
| Premium churn (monthly) | < 5% |
| Avg savings displayed | > $20/month |
| "Paid for itself" achievement rate | > 50% in first month |

---

*This document drives product development priorities. Features should be built to maximize the perceived value gap between Free and Premium while ensuring Free tier remains genuinely useful.*

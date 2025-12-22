# IronScout Dashboard v1.0

**Positioning:** Your daily ammo buying command center.

**Core promise:** Open IronScout. Know what to buy today.

The dashboard is a **decision engine**, not an alert inbox. Every module drives toward confident, high-intent clicks while reinforcing trust and long-term value.

---

## 1. TODAY'S BEST MOVES (Primary Hero)

**Purpose:** Immediate action guidance.

This is the first thing users see. Verdicts first, data second.

```
🔥 TODAY'S BEST MOVES
────────────────────────────────────
✅ BUY NOW
9mm FMJ — $0.21/rd (▼3% this week)
15% below your target • Trusted dealer
[Buy Now →]

⏳ WAIT
.223 Rem — $0.38/rd (▲7% this week)
Above 30-day average • Historically better in 2–3 weeks

➖ STABLE
.45 ACP — $0.42/rd
Normal pricing range • No urgency
```

**Key characteristics**

* Clear Buy / Wait / Stable verdicts
* Language optimized for action, not analysis
* Primary surface for outcome-aligned dealer placements

---

## 2. WATCHLIST & COLLECTIONS (High-Intent Core)

**Purpose:** Manage buying intent over time.

Alerts trigger attention. The watchlist drives decisions.

```
👁️ YOUR WATCHLIST
────────────────────────────────────
Home Defense Loadout (2 items)

Hornady Critical Defense 9mm
Current: $28.99 • Target: $24.99
Lowest in 45 days • ▼$2 yesterday
[Buy Best] [Set Alert] [History]

Range Ammo (3 items)

Federal AE .223 500rd
Current: $219 • Target: $189
Best was $195 on Nov 15
[Track] [View Options]
```

**Key characteristics**

* Grouped by intent or use-case, not just SKUs
* "Buy Best" is the dominant CTA
* Alerts are secondary controls, not the main experience

---

## 3. DEALS FOR YOU (Personalized Deal Stream)

**Purpose:** Surface high-probability conversions.

Personalized using watchlist, alerts, and interaction history.

```
🎯 DEALS FOR YOU
Based on your watchlist and alerts

⚡ HOT DEAL
Federal 9mm 1000rd — $189 ($0.19/rd)
15% below your target • 47 left
[Buy Now →]

📦 BULK VALUE
CCI .22LR 5000rd — $289
Free shipping over $250
[View →]
```

**Key characteristics**

* Explicit tie to user intent
* Urgency without spam
* Prime surface for dealer monetization

---

## 4. MARKET PULSE (Context, Not the Hero)

**Purpose:** Support decisions already made above.

Market intelligence is secondary to action.

```
📊 MARKET PULSE
────────────────────────────────────
9mm FMJ    $0.21/rd ▃▂▃▄▃▂ ▸ Good time
.223 Rem   $0.38/rd ▆▇█▇▆ ▸ Wait
.45 ACP    $0.42/rd ▃▃▃▃▃ ▸ Stable
[View full trends →]
```

**Key characteristics**

* Price trends for preferred calibers
* Buy / Wait reinforcement
* Optional deep dive, never required

---

## 5. TRUST & TRENDING DEALS

**Purpose:** Reduce friction and increase confidence.

Trust converts better than discounts.

```
🔥 TRENDING & TRUSTED
────────────────────────────────────
#1 Palmetto State — 9mm 1000rd @ $179
⭐⭐⭐⭐⭐ • 127 saves • Fast shipping

#2 Natchez — .223 Rem 500rd @ $185
⭐⭐⭐⭐ • 89 saves
```

**Key characteristics**

* Community saves and verified purchases
* Retailer trust signals
* No comments or discussion initially

---

## 6. AI RECOMMENDATIONS (Premium)

**Purpose:** High-trust expert guidance.

AI recommendations must always answer why this and why now.

```
🤖 AI RECOMMENDATIONS  ✨ Premium
────────────────────────────────────
For "home defense 9mm":

Federal HST 147gr — $0.95/rd
23% below 90-day average
Reliable expansion • FBI standard
[View Best Offer →]
```

**Key characteristics**

* Contextual justification
* Explicit price advantage
* Premium differentiation without feature bloat

---

## 7. SAVINGS & MOMENTUM (Footer Module)

**Purpose:** Reinforce value and habit formation.

```
💵 YOUR IMPACT
────────────────────────────────────
This month: $47 saved
All-time: $312 saved
🏆 10 buys below target
```

**Key characteristics**

* Lightweight gamification
* Reinforces ROI
* Never competes with buying CTAs

---

## Alerts Page (Clear Separation of Roles)

After consolidation:

* **Dashboard:** Decide and act
* **Alerts:** Configure thresholds, channels, schedules, and history

No duplicated content. No confusion.

---

## Design Principles

* Verdicts over raw data
* Action before analysis
* Trust signals before discounts
* Personalization without creepiness
* Monetization aligned with user outcomes

---

## Success Metrics

* Dashboard click-through rate to retailers
* Watchlist adds per user per week
* Return visits to dashboard (D1, D7)
* Alerts that lead to dashboard sessions
* Dealer impressions → clicks → downstream conversion proxy

---

## Summary

This dashboard design combines:

* Your strongest market intelligence and deal concepts
* Proven watchlist and price-history mechanics
* A decision-cockpit structure optimized for conversion

**Result:** A dashboard that earns daily opens, justifies premium, and drives high-intent traffic to dealers.

# Dashboard: best-of-both-worlds plan + tiering (mapped to existing code paths)

## Current state (why Dashboard feels like Alerts 2.0)

- **Dashboard page** is a thin wrapper around three components: `DashboardOverview`, `RecentAlerts`, `QuickActions`.
- **Alerts page** is effectively the full alerts UI via `AlertsManager`.
- Result: users do "work" on **Alerts**, and Dashboard is mostly "status + shortcuts".

## The combined target: Dashboard = "decide + buy" (Alerts = "configure")

**Dashboard mission:** turn intent into purchases. It should answer 3 questions in under 10 seconds:

1. *Should I buy now or wait?* (market timing + trend context)
2. *What should I buy today?* (personalized high-intent deal feed)
3. *Did IronScout save me money?* (savings + proof)

Your proposals already cover the right primitives. The "best of both worlds" is to unify them into a small set of high-leverage modules that directly drive clicks to product pages.

---

# Dashboard modules (final recommended set)

## 1) Market Pulse (timing intelligence) ✅

**What it is:** "Buy/Wait" indicators for a user's top calibers + quick trend read.
**Why it wins:** It gives users a reason to open the Dashboard *even when no alert fired*.

**Free:** Current price + 7-day arrow indicator for up to 2 calibers.
**Premium:** Unlimited calibers + Buy/Wait **score** (1-100) + "best time to buy" recommendation + 30/90/365-day charts.

**Code path mapping**

- Tier primitives already exist: `priceHistoryDays` and `hasPriceHistoryAccess()` in `apps/api/src/config/tiers.ts`.
- Premium vs Free price history limits already defined (0 vs 365 days).
- Dashboard UI currently has no market section. Add a new component (example: `apps/web/components/dashboard/market-pulse.tsx`) and back it with a new API route (example: `apps/api/src/routes/market.ts`).

**Implementation note:** start "dumb but useful" (avg/median vs current) before "pattern prediction".

---

## 2) Deals For You (personalized deal feed) ✅

**What it is:** a ranked feed of deals that match the user's alerts, intent, and filters with strong CTAs.
**Why it wins:** It is the click engine. It also becomes the sponsored placement surface for dealers/retailers.

**Free:** 5 deals max with basic ranking.
**Premium:** 20 deals + flash deals + stock indicators + better ranking + richer explanations.

**Code path mapping**

- You already have tier-aware AI capability switches via `hasFeature()` and `TIER_CONFIG.features`.
- Premium ranking and "best value score" are explicitly in the tier config.
- Dashboard already fetches alerts for stats and "Recent Alerts" using `getUserAlerts()`.
- Reuse the same user-alert signal as the personalization seed: alert calibers, target prices, "triggered" status.

**Dealer/retailer monetization hooks**

- Add "Featured" or "Sponsored" slots to the feed with clear labeling.
- Add "Only X left" or "Ships free over $Y" scarcity signals when available.
- Track feed impressions and clicks for attribution.

---

## 3) Your Calibers Trends (sparklines + chart drilldown) ✅

**What it is:** Price history charts per caliber, with premium expanding to 365 days.
**Why it wins:** It converts "price history" from a feature into a daily habit.

**Free:** Locked teaser card only (no price history access).
**Premium:** 30-day sparkline + 30/90/365-day chart drilldown.

**Code path mapping**

- Premium history length is already in `tiers.ts` (`priceHistoryDays: 365`).
- The consumer tiers doc explicitly notes price history is integrated and premium-gated.
- Add UI module adjacent to `DashboardOverview` since that already occupies the "Stats Cards" slot.

---

## 4) Watchlist / Droplist (product-level tracking) ✅

**What it is:** explicit "I care about this exact SKU" tracking with "lowest in X days" badges.
**Why it wins:** It's sticky and drives repeat purchase consideration, not just one-off alerts.

**Free:** 5 items max with locked history teaser (no price charts).
**Premium:** Unlimited items + full sparklines + "lowest since" badges + collections/loadouts.

**Code path mapping**

- Today, "Products Tracked" is inferred from alert count in dashboard stats.
- If you want a true watchlist separate from alerts, introduce a dedicated model and routes (example: `watchlist.ts`) but you can phase 1 by reusing alerts as "watchlist items".

---

## 5) Savings Tracker (proof + upsell) ✅

**What it is:** "You saved $X" with attribution to buys and price drops.
**Why it wins:** It is the best subscription justification. Users pay for *results*, not features.

**Free:** "Potential savings" display only (calculated from watchlist vs. market avg).
**Premium:** "Verified savings" with purchase confirmations, deal attribution, and monthly rollups.

**Code path mapping**

- Dashboard already computes "Potential Savings" from (target - current) across alerts.
- Upgrade path: add click-to-buy attribution and purchase confirmation to turn "potential" into "verified".

---

## 6) Community + Trust (Phase 3) ⚠️

**What it is:** trending deals, retailer trust, verified buys, community saves.
**Why it matters:** it can lift conversion, but it adds moderation and fraud surface area.

**Recommendation:** Ship later (Phase 3), after the core "decide + buy" loop works. See `consumer-tiers.md` Phase 3 section.

---

# Free vs Premium: recommended split (aligning with current tier config)

## Free (activation)

Goal: prove value fast, then nudge upgrades.

- Alerts: **max 3**, caliber-level only, delayed notifications (60 min)
- Market Pulse: **2 calibers max**, current price + 7-day arrow
- Deals for You: **5 deals max** with basic ranking
- Watchlist: **5 items max**, no price history (locked teaser)
- Savings: **Potential only** (no verified tracking)
- No price history charts, no Best Value score, no AI explanations

## Premium (conversion + retention)

Goal: maximize savings and certainty.

- Alerts: **unlimited**, product-level, real-time notifications
- Market Pulse: **all calibers** + Buy/Wait score (1-100) + charts
- Deals for You: **20 deals** + flash deals + stock indicators
- Watchlist: **unlimited** + sparklines + collections/loadouts
- Savings: **Verified** with purchase attribution + achievements
- Full price history (30/90/365 days), Best Value score, AI explanations

> See `consumer-tiers.md` for full feature comparison matrix.

---

# Concrete "map onto code paths" checklist (lowest effort first)

## Phase 1: Make Dashboard materially different

1. **Add Deals For You card** on Dashboard
   - New component next to `RecentAlerts` and `QuickActions`.
   - Reuse `getUserAlerts()` signal for personalization.
2. **Add Market Pulse lite** (no history dependency)
   - Start with current price vs target vs "avg of latest offers".
3. **Upgrade CTAs** in-context for locked benefits
   - Use `TIER_CONFIG.features` as the single source of truth.

## Phase 2: Premium value

4. **Enable real price history charts** on Dashboard for Premium (365d)
5. **Best Value + AI explanation surfaced in Deals feed** for Premium
6. **Watchlist / Droplist v1** (either alerts-as-watchlist or new model)

## Phase 3: Community + Trust (Later)

7. Community saves and trending
8. Trust signals (verified purchases, retailer ratings)
9. Community-driven deal discovery

## Phase 4: Dealer monetization (ongoing)

10. Sponsored placements in Deals feed
11. Click and conversion attribution into dealer reporting

---

# One opinionated KPI stack (so we know it worked)

- Dashboard DAU / WAU
- Feed item CTR and product-page CTR
- "Buy now" clicks per user per week
- Free→Premium conversion rate from Dashboard CTAs
- Dealer attributed clicks and conversion proxy (add-to-cart or outbound clicks)

# dashboard-product-spec-v5.md

## Purpose

Defines the authoritative structure and behavior of **Dashboard v5**, an account-bound monitoring surface.

---

## Audience

### Intended
- Users with saved items or calibers
- Longitudinal monitoring behavior

### Non-Audience
- Casual or anonymous users
- Immediate-need buyers

These users are served by **Search** and **Market Context**, not the Dashboard.

---

## Core Question

> "What is the current state of what I care about, and what changed recently?"

---

## Core Invariant

> **The Dashboard must always provide value regardless of how much personalization the user has configured.**

If any implementation violates this invariant, it is incorrect.

---

## Global Rules

- Dashboard provides **context, not advice**
- No recommendations, verdicts, rankings, or deal framing
- Actions are informational only:
  - View price history
  - View details
  - See retailers
- Personalization is **additive**, never required
- The dashboard must **degrade gracefully** from highly personalized → market overview

---

## Dashboard Personalization State Model

The dashboard supports **three distinct user intents** with gradual degradation based on configuration:

### Intent Definitions

| Intent | Surface | Represents | Behavior |
|--------|---------|------------|----------|
| **Replenishment** | Gun Locker | Ammo the user buys regularly | Action-oriented by user delegation |
| **Opportunistic** | Watchlist | Items bought only when price is right | Calm monitoring; silence by default |
| **Awareness** | Market Overview | General market conditions | Aggregated, non-personal, always available |

### State Table (Normative)

| State | Gun Locker | Watchlist | Primary Focus | Rendered Sections (Top → Bottom) | Hidden Sections |
|-------|------------|-----------|---------------|----------------------------------|-----------------|
| **S0** | ❌ | ❌ | Market Orientation | Market Overview (expanded), Onboarding Module | Gun Locker, Watchlist |
| **S1** | ❌ | ✅ | Monitoring | Watchlist (primary), Market Overview (collapsed) | Gun Locker |
| **S2** | ✅ | ❌ | Replenishment | Gun Locker (primary), Market Overview (collapsed) | Watchlist |
| **S3** | ✅ | ✅ | Fully Personalized | Gun Locker (primary), Watchlist (secondary), Market Overview (collapsed) | None |

This table is **authoritative**. Implementations must conform exactly.

### State Transition Rules

- State is computed on each page load based on current configuration
- Users may move between states at any time by adding/removing items
- No state requires onboarding to exit; users configure at their own pace
- The dashboard must never feel empty, broken, or nagging in any state

---

## Section Rendering Rules

### Gun Locker

**Intent:** Replenishment (regular purchases)

| Rule | Requirement |
|------|-------------|
| Visibility | Renders **only if configured** (calibers saved) |
| Represents | Ammo the user buys repeatedly |
| Affordances | Allowed to include quick-action paths (by user delegation, not recommendation) |
| Empty state | Must **never** render empty; hide section if no matches |
| Framing | Must **not** be framed as discovery or recommendation |
| Position | Primary in S2, S3; hidden in S0, S1 |

**Allowed content:**
- Products matching saved calibers
- Current best price per round
- Quick reorder paths (user-delegated)

**Disallowed:**
- "Recommended for you"
- "You might like"
- Discovery-oriented language

---

### Watchlist

**Intent:** Opportunistic / price-sensitive interest

| Rule | Requirement |
|------|-------------|
| Visibility | Renders **only if items exist** |
| Represents | Items the user buys only when the price is right |
| Default state | **Silence**; no status text unless exceptional |
| Signals | Only when price is at 90-day low, item restocked, or significant movement |
| Purchase intent | Must **not** imply the user should buy |
| Position | Primary in S1; secondary in S3; hidden in S0, S2 |

**Allowed status (only when true):**
- Lowest price observed in last 90 days
- Price moved since last check
- Back in stock

**Disallowed:**
- "No change" text
- Badges on every row
- Repeated status text
- Deal framing

---

### Market Overview

**Intent:** Tangential awareness

| Rule | Requirement |
|------|-------------|
| Visibility | **Always eligible to render** |
| Represents | Aggregated market conditions |
| Personalization | Non-personal by default |
| Specificity | Must **not** be item-specific unless derived from Gun Locker calibers |
| Display mode | Expanded in S0; collapsed in S1, S2, S3 |
| Position | Last section in all states |

**Allowed content:**
- Caliber-level price trends
- Aggregate availability observations
- Market texture (non-actionable)

**Disallowed:**
- Specific product recommendations
- "Best deals" framing
- Rankings or scores

---

### Onboarding Module

**Intent:** Value explanation for unconfigured users

| Rule | Requirement |
|------|-------------|
| Visibility | Appears **only in S0** (no Gun Locker, no Watchlist) |
| Quantity | Single module only |
| Tone | Calm; explains value without demanding setup |
| CTAs | Maximum 2; no stacking; no urgency |
| Framing | Must **not** guilt or pressure the user |

**Copy:**
> You haven't started tracking yet.
> Search ammo and save items to monitor price and availability over time.

**Actions:**
- [Search ammo]
- [How tracking works]

---

## Sections (Detailed)

### 1. Spotlight (Conditional)

- Renders only if a qualifying signal exists within last 7 days
- Single item only
- Must be rendered as single-line notice bar (per v5-patch-001)
- Must be dismissible for session

**Qualifying signals:**
- 90-day price low on watched item
- Significant price movement (>10%)
- Restock of previously out-of-stock watched item

**Disallowed:**
- Hero/card treatment
- Price emphasis
- Percent display in primary text

---

### 2. Your Watchlist (Conditional per State Model)

Header:
> Your Watchlist
> Prices we're monitoring for you

**Layout:** Dense table (per v5-patch-001)

**Columns:**
- Product name
- Current price / round
- Sparkline (optional)
- 24h change indicator (↑ ↓ —)
- Status (only when exceptional)
- Watch toggle

**Status rules:**
- Empty by default (silence)
- Show badge only for: 90d low, back in stock
- If 3+ items share status, collapse to summary footnote

**Limits:**
- Max 10 items
- Sorted by most recent change

**Footer (if <5 items):**
> Add more items to track more prices.
> [Search to add items]

---

### 3. Your Gun Locker (Conditional per State Model)

Header:
> Your Gun Locker
> Calibers you shoot regularly

**Layout:** Dense table or compact cards

**Columns:**
- Caliber
- Current best price / round
- Availability indicator
- Quick action (View deals / Reorder)

**Rules:**
- Renders only if calibers configured
- Must never render empty
- Quick actions are user-delegated, not recommendations

**Limits:**
- Max 5 calibers displayed
- Sorted by user preference or recency

---

### 4. Recent Price Movement (Conditional)

Header:
> Recent Price Movement
> Notable price changes observed recently

**Layout:** Collapsed accordion (per v5-patch-001)

**Sources:**
- Watchlist items
- Gun Locker matches (if configured)

**Row content:**
- Directional arrow (↓ ↑)
- Product name
- Price / round
- Source attribution for Gun Locker matches

**Disallowed:**
- "PRICE DROP" labels
- ACTIVE/STALE badges
- Vertical feed layout

**Limits:**
- Max 5 items
- Max 3 visible when expanded
- Collapsed by default

---

### 5. Market Overview (Always Eligible)

Header:
> Market Overview
> Current conditions across tracked calibers

**Content:**
- Caliber-level trend sparklines
- Aggregate availability
- Coverage statistics

**Display modes:**
- **Expanded (S0):** Full section with multiple observations
- **Collapsed (S1, S2, S3):** Single-line market pulse strip

**Disallowed:**
- Product-specific content
- Rankings
- "Best" framing

---

### 6. Back in Stock (Conditional)

Header:
> Back in Stock
> Items that recently became available again

**Limits:**
- Max 5 items
- Sort by most recent restock
- Renders only if qualifying items exist

---

## Section Limits Summary

| Section | Max Items | Visibility |
|---------|-----------|------------|
| Spotlight | 1 | Conditional (signal exists) |
| Watchlist | 10 | Conditional (items exist) |
| Gun Locker | 5 | Conditional (calibers configured) |
| Price Movement | 5 | Conditional (changes exist) |
| Back in Stock | 5 | Conditional (restocks exist) |
| Market Overview | N/A | Always eligible |
| Onboarding | 1 | S0 only |

---

## State-Specific Layouts

### S0: Market Orientation (No Personalization)

```
┌─────────────────────────────────────────────┐
│ Market Overview (expanded)                  │
│ - Caliber trends                            │
│ - Availability summary                      │
│ - Coverage statistics                       │
├─────────────────────────────────────────────┤
│ Onboarding Module                           │
│ "You haven't started tracking yet..."       │
│ [Search ammo] [How tracking works]          │
└─────────────────────────────────────────────┘
```

### S1: Monitoring Focus (Watchlist Only)

```
┌─────────────────────────────────────────────┐
│ Your Watchlist (primary)                    │
│ [Dense table with sparklines]               │
├─────────────────────────────────────────────┤
│ Price Movement (collapsed)                  │
├─────────────────────────────────────────────┤
│ Market Overview (collapsed - pulse strip)   │
└─────────────────────────────────────────────┘
```

### S2: Replenishment Focus (Gun Locker Only)

```
┌─────────────────────────────────────────────┐
│ Your Gun Locker (primary)                   │
│ [Calibers with quick actions]               │
├─────────────────────────────────────────────┤
│ Price Movement (collapsed)                  │
├─────────────────────────────────────────────┤
│ Market Overview (collapsed - pulse strip)   │
└─────────────────────────────────────────────┘
```

### S3: Fully Personalized

```
┌─────────────────────────────────────────────┐
│ Your Gun Locker (primary)                   │
│ [Calibers with quick actions]               │
├─────────────────────────────────────────────┤
│ Your Watchlist (secondary)                  │
│ [Dense table with sparklines]               │
├─────────────────────────────────────────────┤
│ Price Movement (collapsed)                  │
├─────────────────────────────────────────────┤
│ Market Overview (collapsed - pulse strip)   │
└─────────────────────────────────────────────┘
```

---

## Non-Goals

- No deal feeds
- No purchase recommendations
- No transactional CTAs
- No dashboard-as-homepage
- No urgency or FOMO language
- No guilt for unconfigured state

---

## Final Invariants

1. Every row must answer at least one:
   - State of something the user saved
   - What changed recently (with evidence)
   - Why this is relevant to saved context

2. The dashboard must always provide value regardless of personalization level.

3. Personalization is additive; lack of configuration must never feel like a failure state.

4. The dashboard must degrade gracefully across all four states without ever feeling empty, broken, or nagging.

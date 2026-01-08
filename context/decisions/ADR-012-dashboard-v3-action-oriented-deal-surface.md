# ADR-012: Dashboard v3 – Action-Oriented Deal Surface Integrated with Search and Saved Items

**Status:** Accepted
**Date:** 2025-12-29  
**Owners:** Product, UX, Engineering  
**Related ADRs:** ADR-006, ADR-011, ADR-013 (Homepage Guardrails), ADR-014 (Search Guardrails)

---

## Context

The existing dashboard presents duplicated data from Search and Saved Items, resulting in high cognitive load and low conversion. Users are not sophisticated business analysts; they are outdoor consumers seeking confidence and speed when purchasing ammunition and related products.

Search already serves discovery. The dashboard must instead support fast decision-making and drive retailer clicks without introducing subjective scoring, misleading claims, or analytical overhead.

Saved Items exist but were previously re-rendered on the Dashboard, producing redundancy without incremental value, especially on quiet days.

---

## Decision

We will implement **Dashboard v3**, a simplified, action-oriented dashboard that:

1. Surfaces **at most one high-confidence deal recommendation** at a time.
2. Treats the absence of a recommendation as a valid and expected state.
3. Uses Saved Items as the source-of-truth for intent, but avoids duplicating the Saved Items portfolio on the Dashboard.
4. Uses **Recent Changes** (an activity feed) to provide incremental value without analytics or recommendations.
5. Uses **plain, descriptive language** and allows intentional empty states.
6. Avoids scores, rankings, verdicts, charts, and claims of optimality.

The dashboard functions as an **action surface**, not a discovery or analytics surface.

---

## Design Principles

- One clear recommendation is better than many weak ones.
- Silence is preferable to low-confidence signals.
- Confidence beats cleverness.
- Empty states are preferable to filler.
- Every visible element must justify a click.
- Dashboard must add value beyond rehashing Saved Items.

---

## Dashboard Language and UX Guardrails

This section defines **hard constraints** for all current and future Dashboard UI, copy, and features.

The Dashboard is the system’s **point of judgment**, not explanation.

---

### Canonical Role of the Dashboard

The Dashboard exists to answer one question:

> **“Is there something worth buying right now?”**

If a dashboard element does not help answer this question, it does not belong.

---

### Language Guardrails

#### Allowed Language

Dashboard copy may use:
- “Good deal right now”
- “Nothing urgent right now”
- “Nothing changed yet”
- “Lower than usual”
- “Seen this low recently”
- “Price is going down / about the same / going up”
- “Something you’re watching changed”
- “Based on what you’ve been looking for”
- “We’re out scouting prices and availability”

All language must be:
- Plain
- Calm
- Defensible by observable data

#### Restricted Language

The Dashboard **must not**:
- Mention “AI”, “machine learning”, or “models”
- Claim “best”, “optimal”, or “guaranteed” outcomes
- Use verdicts such as BUY, WAIT, or SKIP
- Display scores, grades, rankings, or leaderboards
- Explain system internals or methodology
- Require interpretation or comparison by the user

If copy needs explanation, it is not dashboard copy.

---

### UI Guardrails

The Dashboard **must not**:
- Show more than one primary recommendation at a time
- Surface multiple competing calls to action
- Display charts, graphs, or historical timelines
- Duplicate search result grids or filters
- Duplicate the full Saved Items list or portfolio view
- Fill empty space with generic or popular content

The Dashboard **may**:
- Be partially empty
- Change daily
- Show nothing when no confident signal exists

Empty states are preferred over weak recommendations.

---

### Source-of-Truth Guardrail

Every dashboard element must be traceable to **at least one** of:
- A Saved Item
- A recent user Search
- A deterministic change event

If the system cannot explain “why this is here” in one sentence, the element must be removed.

---

## Specification

### 1. System Status (Always Present)

When no immediate action is required, the Dashboard communicates system state.

Examples:
- “Nothing urgent right now — we’re out scouting prices and availability.”
- “Monitoring active.”

This status is informational only and must not include calls to action.

---

### 2. Hero Section: “Good Deal Right Now”

**Description**  
A single, optional hero recommendation shown only when eligibility criteria are met.

**Eligibility**
- Item must be in stock.
- Price must be meaningfully lower than a defined baseline (e.g., 7-day or 30-day median).
- Baseline logic must be deterministic and auditable.

**Display**
- Item name  
- Price per unit  
- Retailer name  
- Optional single context line:
  - “Lower than most prices this week”
  - “Seen this low only a few times recently”
  - “Matches something you’re watching”
  - “Based on what you’ve been looking for”

**CTA**
- `View at <Retailer>`

**Constraints**
- Never show more than one hero.
- Never use “best”, “guaranteed”, or equivalent language.
- If no item qualifies, the hero does not render.

---

### 3. No-Hero State (Intentional Default)

The absence of a Hero recommendation is the **expected default state**.

“No hero” indicates that:
- Prices are within typical ranges, or
- No confident signal meets eligibility thresholds.

This state must feel intentional and reassuring, not empty or broken.

#### No-Hero Copy (Locked)

**Default**
> **Nothing urgent right now**  
> We’re out scouting prices and availability. We’ll surface deals when something stands out.

**If the user has Saved Items**
> **Nothing changed yet**  
> We’re out scouting prices and availability on the items you’re watching.

**If a minor change occurred since last visit**
> **Minor changes detected**  
> Prices moved slightly, but nothing worth acting on yet.

Only one message may be shown at a time.

#### No-Hero UI Rules

In a no-hero state, the Dashboard must not:
- Show filler recommendations
- Promote popular or trending items
- Encourage random browsing
- Upsell Premium
- Introduce educational or analytical content

---

### 4. Recent Changes (Activity Feed)

The Dashboard may include a **Recent Changes** feed to provide incremental value without duplicating Saved Items.

**Purpose**
Answer one question:
> “What changed recently?”

**Rules**
- Source: Saved Items only
- Show **only** items with a recent price or availability change
- Sort by **most recent change first**
- Hard cap at **3–5 items**
- If no recent changes exist, the feed **does not render**

**Display per item**
- Item name
- Retailer
- Directional delta only (price up/down or availability change)

**Constraints**
- No full Saved Items list
- No stable items
- No charts, sparklines, or timelines
- No aggregates or summaries
- No ranking language or recommendations
- No alert-style urgency

The Activity Feed is a passive scan surface, not a portfolio.

---

### 5. Saved Items Empty State (Dashboard Only)

If the user has no Saved Items, show a simple message:

> “Save items and IronScout will watch prices and availability for you.”

A single exploratory action (e.g., “Find something to watch”) may appear **only** in this empty state.

---

### 6. Premium Integration

A single, soft prompt at the bottom of the dashboard:

> Want alerts when prices drop?  
> Save items and get notified.

CTA:
- `Try Premium`

**Constraints**
- No locked data shown
- No blurred UI
- Premium framed as automation and speed, not exclusive truth

---

## Notifications vs Dashboard Policy (v1)

The Dashboard and Notifications serve distinct roles and must not overlap in purpose.

### Canonical Roles
- **Dashboard:** Passive awareness
- **Notifications:** Interruptions for rare, time-sensitive events

### Notification Eligibility (v1)
Notifications are limited to **explicitly Saved Items only**.  
Notifications are never triggered by inferred or implicit search intent.

See also: `context/operations/alerts_policy_v1.md`

---

## Non-Goals

The dashboard will not:
- Rank items
- Display scores, grades, or verdicts
- Show multiple competing recommendations
- Duplicate search result grids
- Duplicate the Saved Items portfolio view
- Provide charts or analytics views

---

## ADR Compliance

- **ADR-006:** No subjective scoring or verdicts introduced.
- **ADR-011:** Saved Items remain the source of alerts and tracking.
- No promises of optimality or “best price” guarantees.
- Retailer neutrality preserved.

---

## Consequences

### Positive
- Lower cognitive load
- Faster time to first click
- Higher trust and conversion
- Clear separation between Dashboard (news) and Saved Items (portfolio)

### Tradeoffs
- Reduced surface area for exploratory browsing
- Requires discipline to avoid feed bloat
- Quiet days will remain visually sparse by design

---

## Enforcement

Product owns adherence to this ADR.  
Engineering must block merges that violate it.

Conflicting changes must be rejected or escalated via ADR amendment.

---

**Decision Outcome:**  
Proceed with Dashboard v3 implementation under this ADR. Iterate via amendments as thresholds and data confidence mature.


### Canonical Product Specification

The authoritative product-level definition of dashboard behavior lives in:

- **dashboard-product-spec.md**

All dashboard UI and implementation work must conform to this specification.
Conflicting behavior must be resolved by updating the product spec and, if needed, this ADR.

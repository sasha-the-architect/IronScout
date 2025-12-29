# ADR-012: Dashboard v3 – Action-Oriented Deal Surface Integrated with Search and Saved Searches

**Status:** Proposed
**Date:** 2025-12-29
**Owners:** Product, UX, Engineering
**Related ADRs:** ADR-006, ADR-011, ADR-013, ADR-014
**Related Docs:** [UX Charter](../06_ux_charter.md)

---

## Context

The existing dashboard presents duplicated data from Search and Saved Items, resulting in high cognitive load and low conversion. Users are not sophisticated business analysts; they are outdoor consumers seeking confidence and speed when purchasing ammunition and related products.

Search already serves discovery. The dashboard must instead support fast decision-making and drive retailer clicks without introducing subjective scoring, misleading claims, or analytical overhead.

Saved Items and Saved Searches exist but are under-leveraged and overly visible in places where they create friction rather than value.

---

## Decision

We will implement **Dashboard v3**, a simplified, action-oriented dashboard that:

1. Surfaces **at most one high-confidence deal recommendation** at a time.
2. Promotes **Saved Items** as the primary repeat-engagement and conversion surface.
3. Integrates **Saved Searches silently** as signal inputs rather than explicit UI objects.
4. Uses **plain, descriptive language** and allows empty states.
5. Avoids scores, rankings, verdicts, charts, or claims of optimality.

The dashboard will function as an **action surface**, not a discovery or analytics surface.

---

## Design Principles

- One clear recommendation is better than many weak ones.
- Confidence beats cleverness.
- Empty states are preferable to filler.
- Saved searches should feel automatic, not configured.
- Every visible element must justify a click.

---

## Dashboard Language and UX Guardrails

This section defines **hard constraints** for all current and future Dashboard UI, copy, and features.  
All specifications that follow must comply with these guardrails.

The Dashboard is the system’s **point of judgment**, not explanation.

---

### Canonical Role of the Dashboard

The Dashboard exists to answer one question:

> “Is there something worth buying right now?”

If a dashboard element does not help answer this question, it does not belong.

---

### Language Guardrails

#### Allowed Language

Dashboard copy may use:
- “Good deal right now”
- “Lower than usual”
- “Seen this low recently”
- “Price is going down / about the same / going up”
- “Something you’re watching changed”
- “Based on what you’ve been looking for”

All language must be:
- Plain
- Descriptive
- Defensible by observable data

---

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
- List saved searches or configuration controls
- Duplicate search result grids or filters

The Dashboard **may**:
- Be partially empty
- Change daily
- Show nothing when no confident signal exists

Empty states are preferred over weak recommendations.

---

### Source-of-Truth Guardrail

Every dashboard element must be traceable to **at least one** of:
- A Saved Item
- A Saved Search
- A recent user Search

If the system cannot explain “why this is here” in one sentence, the element must be removed.

---

### Relationship to Intelligence and Automation

Intelligence is implicit.

The Dashboard shows outcomes, not reasoning.

The system may:
- Watch prices
- Detect change
- Surface moments

The Dashboard must never claim *how* those detections were made.

---

### Saved Searches Guardrails (Dashboard-Scoped)

These guardrails apply **only to how Saved Searches are surfaced or consumed by the Dashboard**.  
Creation and management remain governed by Search behavior.

Saved Searches exist to **capture intent**, not to expose configuration.

They are an internal system primitive, not a primary UI feature.

---

#### Canonical Role

Saved Searches answer one question:

> “What should the system keep an eye on for this user?”

They do not exist to:
- Teach users how the system works
- Require tuning or management
- Surface analytical insight directly

---

#### UX Guardrails

Saved Searches **must not**:
- Appear as a list on the Dashboard
- Expose query syntax or filters
- Require users to set thresholds
- Introduce advanced configuration by default
- Be framed as a power-user feature

Saved Searches **may**:
- Be created implicitly through repeated searches
- Be created explicitly via “Turn on alerts”
- Drive dashboard hero selection or nudges
- Be managed only in Search or Settings

---

#### Language Guardrails

Primary UI **must not** use the term “Saved Search”.

Use outcome-based language only:
- “We’ll keep an eye on this”
- “Something you’re watching changed”
- “You’re watching this”

The term “Saved Search” may exist only:
- In internal documentation
- In developer-facing code
- In advanced settings, if ever introduced

---

#### Relationship to Automation

Saved Searches:
- Trigger tracking
- Feed alerting
- Influence surfaced deals

They must not:
- Explain automation logic
- Claim intelligence or prediction
- Compete with the Dashboard for attention

---

#### Escalation Path

If Saved Searches require:
- User-defined thresholds
- Multiple rules per search
- Scheduling or prioritization
- Visible management UI on the Dashboard

Then a standalone ADR **must** be created before implementation.

---

### Enforcement

Product owns adherence to these guardrails.  
Engineering must block merges that violate them.

Any new Dashboard feature, copy change, or UI addition must be reviewed against:
- This ADR
- ADR-013 (Homepage Positioning Guardrails)
- ADR-014 (Search Positioning Guardrails)
- [UX Charter](../06_ux_charter.md)

Conflicting changes must be rejected or escalated via ADR amendment.

---

## Specification

### 1. Hero Section: “Good Deal Right Now”

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

**CTA**
- `View at <Retailer>`

**Constraints**
- Never show more than one hero.
- Never use “best”, “guaranteed”, or equivalent language.
- If no item qualifies, the hero does not render.

---

### 2. Saved Items Section (“Stuff You’re Watching”)

**Source**
- WatchlistItem records.

**Display per item**
- Item name  
- Best current price and retailer  
- Directional status text only:
  - “Price is going down”
  - “About the same”
  - “Price is going up”
- CTA: `View at <Retailer>`

**Constraints**
- No charts.
- No percentages.
- No historical timelines.
- Directional language only.

Saved Items are the primary dashboard list and main repeat-visit driver.

---

### 3. Saved Searches Integration (Non-Surface)

Saved Searches do **not** appear as a list or section on the dashboard.

They are used exclusively as **signal inputs**.

#### 3.1 Hero Influence

If the hero item matches a saved search, add:
- “Matches something you’re watching”

No link. No explanation.

---

#### 3.2 Single “Heads Up” Nudge (Optional)

If a saved search detects a meaningful event:

> Heads up: 9mm prices dropped this week  
> [ See 9mm deals ]

**Constraints**
- Only one nudge at a time.
- Must deep-link to the saved search results.
- If no strong signal exists, do not render.

---

### 4. Search Relationship

- Search remains the primary discovery tool.
- Dashboard links land on filtered search results.
- Saved searches are created and managed via Search, not the dashboard.
- Dashboard never exposes search configuration or query syntax.

---

### 5. Premium Integration

A single, soft prompt at the bottom of the dashboard:

> Want alerts when prices drop?  
> Save items and get notified.

CTA:
- `Try Premium`

**Constraints**
- No locked data shown.
- No blurred UI.
- Premium framed as automation and speed, not exclusive truth.

---

## Empty States

- **No Hero Deal:**  
  “No standout deals right now. Check your saved items below.”

- **No Saved Items:**  
  “Start watching items to spot good deals faster.”

Empty states are intentional and build trust.

---

## Non-Goals

The dashboard will not:
- Rank items.
- Display scores, grades, or verdicts.
- Show multiple competing recommendations.
- Display saved search lists.
- Include charts or analytics views.
- Duplicate search result grids.

---

## ADR Compliance

- **ADR-006:** No subjective scoring or verdicts introduced.
- **ADR-011:** Saved Items remain the source of alerts and tracking.
- No promises of optimality or “best price” guarantees.
- Retailer neutrality preserved.

---

## Consequences

### Positive
- Lower cognitive load.
- Faster time to first click.
- Higher trust and conversion.
- Clear separation of concerns between Search and Dashboard.

### Tradeoffs
- Reduced surface area for exploratory browsing.
- Less visible “intelligence” compared to dense dashboards.
- Requires strong discipline around eligibility thresholds.

---

## Open Questions / Iteration Points

1. Final definition of “meaningfully lower” price.
2. Thresholds for saved search signal generation.
3. Maximum number of saved items shown before pagination.
4. Whether hero eligibility differs by plan tier.

---

**Decision Outcome:**  
Proceed with Dashboard v3 implementation under this ADR. Iterate via amendments as thresholds and data confidence mature.

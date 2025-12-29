# IronScout Language & UX Charter

**Authority:** This document supersedes all UX copy, component, and layout decisions unless explicitly overridden by a newer ADR.

**Purpose:**  
Ensure IronScout presents as one coherent system — not a collection of features — by locking how we speak, what we show, and where decisions are made.

This charter applies to **Homepage, Search, Dashboard, Saved Items, and Saved Searches**.

If a change conflicts with this document, it must not ship without an ADR amendment.

---

## 1. Core Product Promise

> **IronScout doesn’t just list prices. It watches the ammo market for you.**

Everything in the product must reinforce this idea.

---

## 2. System Mental Model (Non-Negotiable)

Users should intuitively understand:

- **Search** → “I’m looking”
- **Save** → “I care about this”
- **IronScout** → “Keeps watching”
- **Dashboard** → “Now it matters”

If UI copy or layout breaks this chain, it is wrong.

---

## 3. Surface Roles and Boundaries

### Homepage
- Sets expectations.
- Describes outcomes, not mechanisms.
- Introduces “watching” as the differentiator.

Must not:
- Lead with AI claims.
- Promise “best” or guaranteed results.

---

### Search (Discovery)
- Shows what exists right now.
- Captures user intent.

May:
- Compare prices.
- Show historical context.
- Group equivalent products.

Must not:
- Recommend what to buy.
- Claim optimization or judgment.
- Compete with the Dashboard.

---

### Dashboard (Action)
- Makes one clear call when confidence exists.
- Drives retailer clicks.

May:
- Show at most one recommendation.
- Be partially or fully empty.

Must not:
- Explain reasoning.
- Show analytics, charts, or rankings.
- Surface multiple competing actions.

---

### Saved Items
- Represent explicit user interest.
- Power repeat engagement.

Must:
- Show simple directional signals.
- Stay action-oriented.

Must not:
- Become analytical or configurable.

---

### Saved Searches
- Capture intent silently.
- Power alerts and dashboard signals.

Must:
- Feel automatic.
- Stay mostly invisible.

Must not:
- Appear as lists on the dashboard.
- Expose query syntax or configuration.
- Be framed as a power feature.

---

## 4. Language Rules

### Allowed Language
Use:
- “Good deal right now”
- “Lower than usual”
- “Seen this low recently”
- “Price is going down / about the same / going up”
- “We’ll keep an eye on this”
- “Something you’re watching changed”

Language must be:
- Plain
- Human
- Defensible by data

---

### Prohibited Language
Never use:
- “AI-powered” as a primary value claim
- “Best”, “optimal”, or “guaranteed”
- BUY / WAIT / SKIP verdicts
- Scores, grades, rankings, or leaderboards
- Explanations of system internals

If copy needs explanation, it does not belong in the UI.

---

## 5. UX Rules

- One primary action per screen.
- One recommendation at a time.
- Empty states are better than weak signals.
- No duplicated content across surfaces.
- No feature exists “just in case”.

If a user asks “why am I seeing this?”, the UI has failed.

---

## 6. Intelligence Philosophy

- Intelligence is **implicit**.
- Outcomes are visible.
- Reasoning stays hidden.

IronScout may:
- Watch prices
- Detect change
- Surface moments

IronScout must not:
- Explain how it does so

---

## 7. Related ADRs

This charter consolidates and enforces the following architectural decisions:

- [ADR-006](decisions/ADR-006-no-purchase-recommendations.md) – No purchase recommendations
- [ADR-011](decisions/ADR-011-unified-saved-items.md) – Unified Saved Items
- [ADR-012](decisions/ADR-012-dashboard-v3-action-oriented-deal-surface.md) – Dashboard v3: Action-oriented deal surface
- [ADR-013](decisions/ADR-013-homepage-positioning-guardrails.md) – Homepage positioning guardrails
- [ADR-014](decisions/ADR-014-search-positioning-guardrails.md) – Search positioning guardrails

Any conflict between this charter and an ADR must be resolved via ADR amendment.

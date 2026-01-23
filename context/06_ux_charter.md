# IronScout Language & UX Charter

**Authority:** This document supersedes all UX copy, component, and layout decisions unless explicitly overridden by a newer ADR.

**Purpose:**  
Ensure IronScout presents as one coherent system — not a collection of features — by locking how we speak, what we show, and where decisions are made.

This charter applies to **Homepage, Search, Dashboard, and Saved Items**.

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
- Dashboard elements must represent **change**, not static state or complete lists.

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
- Power repeat engagement and alerts.

Must:
- Show simple directional signals.
- Stay action-oriented.
- Serve as the sole source of alert eligibility.

Must not:
- Become analytical or configurable.
- Be duplicated wholesale on the Dashboard.

---

### Implicit Intent (Internal Only)

The system may infer interest from recent or repeated searches.

Implicit intent:
- Influences Dashboard surfacing only
- Is never exposed as a user-managed feature
- Does not create Saved Items
- Does not trigger alerts

Implicit intent exists to reduce friction, not to introduce automation control.

---

## 4. Language Rules

### Allowed Language
Use:
- "Good deal right now"
- "Lower than usual"
- "Seen this low recently"
- "Price is going down / about the same / going up"
- "We'll keep an eye on this"
- "Something you're watching changed"

References to “deals” indicate prices that are lower than recent historical context for the same product; they are descriptive signals, not recommendations or guarantees.

Language must be:
- Plain
- Human
- Defensible by data

---

### Prohibited Language
Never use:
- "AI-powered" as a primary value claim
- "Best", "optimal", or "guaranteed"
- BUY / WAIT / SKIP verdicts
- Scores, grades, rankings, or leaderboards
- Explanations of system internals

If copy needs explanation, it does not belong in the UI.

### Personal Context Signals (Gun Locker)
- Personal context (e.g., Gun Locker calibers) may be used to improve relevance, ordering, and labeling.
- Personal context must never be framed as firearm registration, inventory tracking, ownership verification, or a purchase plan.
- Personal context must not be used to claim recommendations, optimality, or guarantees.
- Copy should emphasize "reduce noise" and "relevance," not "decisions."

Allowed:
- "Add the guns you shoot"
- "Tell us what calibers you use"

Disallowed:
- "Register firearms"
- "Gun inventory"
- "Track weapons"

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

- ADR-006 – No purchase recommendations
- ADR-011 – Unified Saved Items
- ADR-012 – Dashboard v3: Action-oriented deal surface
- ADR-013 – Homepage positioning guardrails
- ADR-014 – Search positioning guardrails

Any conflict between this charter and an ADR must be resolved via ADR amendment.

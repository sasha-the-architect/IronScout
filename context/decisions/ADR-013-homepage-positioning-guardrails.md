# ADR-013: Homepage Positioning and Language Guardrails

**Status:** Proposed
**Date:** 2025-12-29
**Amends:** ADR-012 (Dashboard v3 – Action-Oriented Deal Surface)
**Owners:** Product, UX, Engineering
**Related Docs:** [UX Charter](../06_ux_charter.md)

---

## Context

The IronScout homepage establishes user expectations for Search, Saved Items, and the Dashboard.  
Historically, homepage language emphasized “AI-powered search,” which created misalignment with the Dashboard’s role as an action-oriented surface and caused confusion about where value is delivered.

To prevent future drift and ensure cohesion across surfaces, homepage language must be explicitly constrained.

---

## Decision

We adopt a **“market watching” positioning** for the homepage and establish explicit language guardrails.

The homepage will:
- Frame Search as the entry point.
- Frame Saved Items as user intent.
- Frame the Dashboard as the payoff.
- Frame intelligence as infrastructure, not the product itself.

---

## Canonical Positioning Statement

The following sentence is the **single source of truth** for homepage and product positioning:

> **IronScout doesn’t just list prices. It watches the ammo market for you.**

This statement may appear on the homepage, onboarding, or internal documentation, but must not be altered in meaning.

---

## Required Homepage Concepts

All homepage copy must reinforce the following mental model:

1. Users search for what they need.
2. Users save what they care about.
3. IronScout watches prices and availability over time.
4. The dashboard surfaces moments worth acting on.

If a homepage section does not support this model, it must be removed or rewritten.

---

## Language Guardrails

### Allowed Language
The homepage may use:
- “watches prices”
- “tracks price movement”
- “adds context”
- “shows when it matters”
- “signals when prices change”
- “miss fewer deals”

These phrases describe outcomes and are defensible.

---

### Restricted Language

The homepage **must not**:
- Lead with “AI-powered” in hero headlines.
- Claim to find “the best” deals.
- Imply guarantees or optimal outcomes.
- Describe decision-making on behalf of the user.
- Present intelligence as a standalone feature.

References to AI or automation may appear only as implementation detail within explanatory copy, not as the primary value proposition.

---

## Homepage Hero Requirements

The homepage hero must:
- Emphasize outcomes over mechanisms.
- Reference market watching or ongoing tracking.
- Avoid technical or marketing-driven claims.

Example patterns:
- “Ammo prices, watched for you.”
- “Track prices over time. Buy with context.”

---

## Relationship to Other Surfaces

Homepage language must align with:
- **Search:** framed as discovery.
- **Dashboard:** framed as action.
- **Saved Items / Searches:** framed as signals of user intent.

Homepage copy must not introduce concepts that do not exist in product UI.

---

## Compliance with Existing ADRs

This amendment:
- Reinforces ADR-006 by avoiding subjective scoring and guarantees.
- Reinforces ADR-011 by clarifying the role of Saved Items and tracking.
- Reduces risk of marketing-led feature drift.

---

## Enforcement

Any change to homepage copy must be reviewed against:
- This ADR
- ADR-012 (Dashboard v3)
- [UX Charter](../06_ux_charter.md)

If proposed copy conflicts with the canonical positioning or guardrails, it must be rejected or escalated.

---

## Consequences

### Positive
- Consistent user expectations across Search and Dashboard.
- Clear differentiation from static price list competitors.
- Reduced marketing and product drift.

### Tradeoffs
- Less freedom for headline experimentation.
- Requires discipline in future marketing iterations.

---

**Decision Outcome:**  
Homepage language is now constrained by this amendment. Future iterations must preserve the “market watching” positioning to maintain product coherence.

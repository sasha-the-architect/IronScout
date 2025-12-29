# ADR-014: Search Positioning and Language Guardrails

**Status:** Proposed
**Date:** 2025-12-29
**Amends:** ADR-012, ADR-013
**Owners:** Product, UX, Engineering
**Related Docs:** [UX Charter](../06_ux_charter.md)

---

## Context

Search is the primary entry point for IronScout.  
Historically, Search language emphasized “AI-powered” capability and free-form intelligence, which created unrealistic expectations and weakened the perceived value of downstream surfaces such as Saved Items and the Dashboard.

To maintain a cohesive product mental model, Search must be framed as **discovery**, not decision-making.

---

## Decision

We constrain Search language and UX to:

- Present Search as a fast way to explore prices and inventory.
- Avoid claims of judgment, ranking authority, or optimal outcomes.
- Explicitly support the “watching” model introduced on the homepage.
- Hand off user intent cleanly to Saved Items and the Dashboard.

Search is not the product’s intelligence showcase.  
Search is the input layer.

---

## Canonical Role of Search

Search exists to answer:

> “What’s available right now, and how does it compare?”

Search does **not** exist to answer:
- “What should I buy?”
- “Is this the best deal?”
- “What does the system recommend?”

Those answers belong to the Dashboard.

---

## Language Guardrails

### Allowed Language

Search copy may use:
- “Search ammo prices across retailers”
- “Compare current prices”
- “See price history”
- “Explore availability”
- “Find equivalent products”

This language is descriptive and expectation-safe.

---

### Restricted Language

Search **must not**:
- Lead with “AI-powered” as a value claim.
- Claim to “find the best deals”.
- Imply optimization, ranking authority, or decision-making.
- Suggest guarantees or completeness.

References to AI or automation may appear only as explanatory detail (e.g., grouping equivalent listings), not as the headline promise.

---

## Search Input Guidance

The search input may support free-form queries, but must be grounded.

### Required Helper Text
Search must include anchoring guidance such as:
> “Most people start with caliber and quantity.”

This reduces anxiety and avoids over-promising intelligence.

---

## Saved Search Formation (Implicit)

Search may trigger background tracking when:
- A user repeats the same or similar search.
- A user explicitly opts into alerts.
- A user saves an item from search results.

In these cases, Search may display a passive explanation:
> “We’ll keep an eye on this for you.”

The term “saved search” must not be used in primary UI.

---

## Search → Dashboard Hand-off

When a user performs a meaningful action in Search (e.g., save item, click retailer, enable alerts), Search must explain the system behavior with lightweight feedback:

Example:
> “We’ll surface deals like this on your dashboard.”

This establishes cause-and-effect and prevents the Dashboard from feeling arbitrary.

---

## Relationship to Other ADRs

This amendment:
- Reinforces ADR-012 by preserving Dashboard authority.
- Reinforces ADR-013 by keeping homepage promises honest.
- Supports ADR-011 by keeping tracking implicit and low-friction.
- Reduces risk of Search becoming a competing recommendation surface.

---

## Enforcement

Any changes to Search copy, onboarding language, or helper text must be reviewed against:
- This ADR
- ADR-012 (Dashboard v3)
- ADR-013 (Homepage guardrails)
- [UX Charter](../06_ux_charter.md)

Conflicting copy must be revised or rejected.

---

## Consequences

### Positive
- Clear separation between discovery and decision-making.
- Reduced user confusion and mistrust.
- Stronger perceived value of the Dashboard.

### Tradeoffs
- Less marketing flexibility in Search headlines.
- Requires discipline when introducing new “smart” features.

---

**Decision Outcome:**  
Search language and UX are now constrained to discovery and intent capture.  
Decision-making and urgency remain the responsibility of the Dashboard.

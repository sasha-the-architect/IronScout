# search-results-v2-patch-001.md

## Purpose

Structural patch to the Search Results v2 UI addressing cognitive overload from inline retailer comparison.

---

## Problem Statement

> "This search UI is functionally strong but cognitively noisy. It does too much comparison work inside each card."

The original v2 cards showed up to 3 inline retailer rows per product, making each card a mini results page. This:
- Increases cognitive load per card
- Reduces scanability across results
- Forces users to do comparison work they didn't ask for yet
- Makes the grid feel dense and overwhelming

---

## Solution: Price Summary Model

Collapse cards to a **price summary** representation. Defer retailer comparison to the drawer (click-through).

### Card Shows (Allowed)

| Element | Purpose |
|---------|---------|
| Product name | Identity |
| Attribute badges | Caliber, bullet type, grain, casing |
| Best price per round | Primary value signal |
| Price range (min-max) | Indicates comparison opportunity |
| Retailer count | Signals depth of comparison available |
| "Compare" affordance | Invites click-through |

### Card Does Not Show (Removed)

| Element | Rationale |
|---------|-----------|
| Inline retailer rows | Belongs in drawer only |
| Per-retailer stock state | Too much detail at scan level |
| Shipping info per retailer | Detail belongs in comparison view |
| Multiple price displays | Collapsed to best + range |

---

## Layout Specification

```
┌──────────────────────────────────────┐
│ [Product Title]              [Watch] │
│ ┌────┐ ┌───┐ ┌─────┐ ┌──────┐       │
│ │9mm │ │FMJ│ │115gr│ │Brass │       │
│ └────┘ └───┘ └─────┘ └──────┘       │
│                                      │
│ $0.28/rd                             │
│ $0.28 – $0.42                        │
│                                      │
│ ─────────────────────────────────── │
│ 5 retailers              Compare >  │
└──────────────────────────────────────┘
```

---

## Interaction Model

| Action | Result |
|--------|--------|
| Click anywhere on card | Opens RetailerPanel drawer |
| Click Watch button | Toggles watchlist (stops propagation) |

---

## Invariants

1. **Cards are scannable** - User can evaluate 10+ products at a glance
2. **Comparison is opt-in** - Retailer details only after click
3. **No recommendation language** - "Compare" not "Best deal"
4. **Factual only** - Price, count, attributes

---

## Component Changes

### ResultCardV2

- Removed: `InlineRetailerRow` component
- Removed: `MAX_INLINE_RETAILERS` constant
- Removed: Overflow link logic
- Added: `priceSummary` computed from retailers
- Added: Price range display (min-max)
- Added: Card-level click handler
- Changed: Watch button stops event propagation

### ResultCardV2Skeleton

- Updated to match new simpler layout
- Removed retailer row skeletons
- Added price block and footer skeletons

---

## Files Modified

- `apps/web/components/results/result-card-v2.tsx`

---

## Relationship to Other Specs

- **RetailerPanel**: Unchanged. Still the destination for full retailer comparison.
- **ResultRowV2**: Table view already uses this pattern (summary, not inline detail).
- **SearchResultsGridV2**: No changes needed, consumes same props.

# Search Results UX Specification

**Status:** Draft
**Author:** UX Review
**Date:** 2025-01-24
**Supersedes:** N/A
**Related:** ADR-006 (No Recommendations), ADR-011 (Saved Items)

---

## Overview

This specification defines the Search Results experience for IronScout, covering:

1. **Card View** — Discovery mode for casual comparison
2. **Grid View** — Power user mode for dense scanning
3. **Retailer Panel** — Multi-retailer price comparison drawer

### Governing Constraints

| Constraint | Rule |
|------------|------|
| No recommendations | Never imply "this is a good time to buy" |
| No deal language | No "best", "deal", "worth it", "hot", "save" |
| No urgency | No countdown timers, stock pressure, or FOMO triggers |
| Factual only | Price, availability, shipping — stated plainly |
| Multi-retailer core | Comparison across retailers is the primary value |
| Primary metric | Price-per-round ($/rd) is the universal comparison unit |

---

## 1. Card View Specification

### 1.1 Card Anatomy

```
┌─────────────────────────────────────────────┐
│ [Watch]                              (top-right)
│                                              │
│ Product Title                                │
│ ┌────────┐ ┌─────┐ ┌──────┐ ┌───────┐       │
│ │ 9mm    │ │ FMJ │ │ 115gr│ │ Brass │       │
│ └────────┘ └─────┘ └──────┘ └───────┘       │
│                                              │
│ ┌─────────────────────────────────────────┐ │
│ │ RETAILER COMPARISON BLOCK               │ │
│ │ (see 1.2)                               │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ [Compare Prices]                    (primary)│
└─────────────────────────────────────────────┘
```

### 1.2 Retailer Comparison Block

The card displays **inline retailer rows** to enable comparison without navigation.

#### Display Rules

| Retailer Count | Display Behavior |
|----------------|------------------|
| 1 retailer | Show single row, no expansion affordance |
| 2-3 retailers | Show all rows inline |
| 4-5 retailers | Show top 3 by price, "+N more" link below |
| 6+ retailers | Show top 3 by price, "Compare all N" link below |

#### Retailer Row Anatomy

```
┌─────────────────────────────────────────────┐
│ RetailerName        $0.32/rd    $15.99      │
│ [stock indicator]   [shipping]              │
└─────────────────────────────────────────────┘
```

| Element | Rules |
|---------|-------|
| Retailer Name | Max 20 chars, truncate with ellipsis |
| $/rd | Primary metric, bold, mono font |
| Total Price | Secondary, muted, smaller |
| Stock Indicator | "In Stock" (green) or "Out of Stock" (red text only, no icons) |
| Shipping | See Shipping Display Rules (1.4) |

#### Sorting

Retailer rows are **always sorted by $/rd ascending** (lowest first).

No visual distinction for "lowest" — the sort order implies it.

### 1.3 Card Actions

| Action | Location | Behavior |
|--------|----------|----------|
| Watch/Watching | Top-right corner | Toggle save state, bookmark icon |
| Compare Prices | Bottom CTA | Opens Retailer Panel (drawer) |
| Retailer Row Click | Inline rows | Opens retailer URL in new tab |

**Removed:**
- ~~"View at {Retailer}"~~ — Redundant; clicking row serves this purpose
- ~~"Best Price" badge~~ — Violates no-recommendation rule
- ~~Retailer logo~~ — Adds clutter, not useful for comparison

### 1.4 Shipping Display Rules

Shipping is complex. Display honestly:

| Shipping State | Display |
|----------------|---------|
| Included | "$0.32/rd delivered" |
| Excluded (known) | "$0.32/rd + $X ship" |
| Excluded (unknown) | "$0.32/rd + shipping" |
| Free over threshold | "$0.32/rd (free ship $99+)" |
| Pickup only | "$0.32/rd (pickup)" |
| Cannot determine | "$0.32/rd" (no annotation) |

**Rule:** Never display "Includes shipping" if we cannot verify it.

### 1.5 Card Attribute Badges

Display product attributes as inline badges:

| Badge | Style | Always Show |
|-------|-------|-------------|
| Caliber | Filled, primary | Yes |
| Bullet Type | Outline, muted | If available |
| Grain Weight | Outline, muted | If available |
| Case Material | Brass=amber, Steel=gray | If available |

**Removed:**
- ~~Price context badges~~ — "Low", "Typical" language implies judgment
- ~~"New Listing"~~ — Implies urgency
- ~~Performance badges on cards~~ — Clutters discovery; belongs on detail page

### 1.6 Card States

| State | Behavior |
|-------|----------|
| All OOS | Gray overlay, "Out of Stock" text, still show prices |
| No prices | Do not render card (filter upstream) |
| Watched | Bookmark icon filled, "Watching" label |
| Loading | Skeleton with badge placeholders |

---

## 2. Grid View Specification

### 2.1 Purpose

Grid view is for **power users in execution mode**:
- "I know what I want"
- "Show me dense data so I can scan fast"
- "Let me sort by what matters to me"

### 2.2 Column Definition

| Column | Width | Content | Sortable |
|--------|-------|---------|----------|
| Product | 35% | Title (truncate 50 chars) | No |
| Caliber | 10% | Badge | No |
| $/rd | 12% | Primary price, bold mono | Yes (URL) |
| Retailers | 15% | Count + "Compare" link | No |
| Stock | 10% | Badge (In/Out) | Yes (client) |
| Watch | 8% | Icon button | No |
| Action | 10% | "Compare" button | No |

### 2.3 Multi-Retailer Handling in Grid

**Problem:** A product may have 20 retailers. Showing all explodes row height.

**Solution:** Grid shows **summary**, panel shows **detail**.

```
┌──────────────────────────────────────────────────────────────────┐
│ Product Title...    │ 9mm │ $0.32/rd │ 8 retailers │ In │ ★ │ → │
└──────────────────────────────────────────────────────────────────┘
```

| Retailer Count | Display |
|----------------|---------|
| 1 | "1 retailer" (no link) |
| 2-3 | "2 retailers" (clickable) |
| 4+ | "N retailers" (clickable, opens panel) |

The $/rd shown is **always the lowest available in-stock price**.

If all retailers are OOS, show lowest OOS price with muted styling.

### 2.4 Grid Sorting

| Sort | Behavior | Implementation |
|------|----------|----------------|
| $/rd ↑ | Lowest first | URL param (`sortBy=price_asc`) |
| $/rd ↓ | Highest first | URL param (`sortBy=price_desc`) |
| Stock | In-stock first | Client-side |
| Relevance | Default/AI ranking | URL param (default) |

**Rule:** Only one sort active at a time. Clicking a sorted column cycles: asc → desc → clear.

### 2.5 Grid Filters (Inline)

| Filter | Type | Location |
|--------|------|----------|
| Hide out of stock | Checkbox | Above table |
| Caliber | Pills (if faceted) | Sidebar/header |

**Removed:**
- ~~In-line price range sliders~~ — Use sidebar filters
- ~~"Show only watched"~~ — Use Saved Items page

### 2.6 Grid Mobile Behavior

On mobile (< 768px), grid view **falls back to card view**.

Rationale: Tables are unusable on small screens. Don't fight it.

---

## 3. Retailer Panel Specification

### 3.1 Purpose

The Retailer Panel is a **drawer/slide-over** that shows all retailers for a single product.

Triggered by:
- "Compare Prices" button on card
- "N retailers" link in grid
- Clicking the retailer summary area

### 3.2 Panel Anatomy

```
┌─────────────────────────────────────────────┐
│ ← Back                              [Watch] │
├─────────────────────────────────────────────┤
│ Product Title                               │
│ 9mm · FMJ · 115gr · Brass · 50rd box        │
├─────────────────────────────────────────────┤
│ 12 retailers found                          │
│ ┌─────────────────────────────────────────┐ │
│ │ Sort: Price (low-high) ▼               │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ RETAILER ROWS (see 3.3)                     │
│ ...                                         │
│ ...                                         │
├─────────────────────────────────────────────┤
│ [View Product Details]              (ghost) │
└─────────────────────────────────────────────┘
```

### 3.3 Retailer Row Anatomy (Panel)

```
┌─────────────────────────────────────────────┐
│ Retailer Name                               │
│ $0.32/rd · $15.99 total                     │
│ In Stock · Free shipping over $99           │
│                                     [View →]│
└─────────────────────────────────────────────┘
```

| Element | Rules |
|---------|-------|
| Retailer Name | Full name, no truncation |
| $/rd | Primary, bold, large |
| Total | Secondary, with round count: "$15.99 (50 rounds)" |
| Stock | Green "In Stock" or Red "Out of Stock" |
| Shipping | Per Shipping Display Rules (1.4) |
| Action | "View" button → opens retailer URL |

### 3.4 Panel Sorting Options

| Sort Option | Behavior |
|-------------|----------|
| Price (low-high) | Default. $/rd ascending |
| Price (high-low) | $/rd descending |
| Retailer A-Z | Alphabetical |
| In-stock first | Stock status, then price |

**Note:** No "Best value" or "Recommended" sort — violates constraints.

### 3.5 Out-of-Stock Handling

| Scenario | Behavior |
|----------|----------|
| Some OOS | Show at bottom of list, visually muted (opacity 60%) |
| All OOS | Show all with "Currently unavailable" header |
| Toggle to hide | Checkbox: "Hide out of stock" above list |

OOS rows still show last-known price for reference.

### 3.6 Panel Empty State

If product exists but has no retailer prices:

```
┌─────────────────────────────────────────────┐
│ No current listings                         │
│                                             │
│ We haven't found this product at any        │
│ tracked retailer recently.                  │
│                                             │
│ [Watch this product]                        │
└─────────────────────────────────────────────┘
```

### 3.7 Panel Actions

| Action | Location | Behavior |
|--------|----------|----------|
| Back/Close | Top-left | Closes panel |
| Watch | Top-right | Toggle save state |
| Sort dropdown | Below header | Changes sort order |
| View (per row) | Row right side | Opens retailer URL |
| View Product Details | Footer | Navigates to PDP |

---

## 4. Explicit Rules

### 4.1 Display Caps

| Element | Cap | Overflow Handling |
|---------|-----|-------------------|
| Inline retailer rows (card) | 3 | "+N more" / "Compare all" |
| Retailer panel rows | None | Scrollable list |
| Attribute badges (card) | 4 | Hide lowest-priority |
| Product title (card) | 2 lines | Truncate with ellipsis |
| Product title (grid) | 50 chars | Truncate with ellipsis |
| Retailer name (card) | 20 chars | Truncate with ellipsis |

### 4.2 Conditional Display

| Condition | Behavior |
|-----------|----------|
| roundCount missing | Show total price only, no $/rd |
| shipping unknown | Show price without shipping annotation |
| All retailers OOS | Show card with muted styling, no "Compare" CTA |
| Single retailer | No "Compare" affordance, show "View at {Retailer}" |
| No image | Show caliber-based placeholder icon |

### 4.3 Mobile Considerations

| Viewport | Card View | Grid View | Panel |
|----------|-----------|-----------|-------|
| Desktop (1024+) | 4-column grid | Full table | Right drawer (400px) |
| Tablet (768-1023) | 2-column grid | Full table | Right drawer (350px) |
| Mobile (<768) | 1-column stack | Cards (no table) | Full-screen modal |

### 4.4 Loading States

| Component | Skeleton |
|-----------|----------|
| Card | Title bar + 3 badge placeholders + 2 row placeholders + CTA bar |
| Grid Row | Full row with column-aligned placeholders |
| Panel | Header + 5 row placeholders |

---

## 5. Removal List

### 5.1 Remove from Cards

| Element | Reason |
|---------|--------|
| "Best Price" badge/crown | Implies recommendation |
| Price context band ("Low"/"Typical") | Implies judgment |
| "View at {Retailer}" as primary CTA | Redundant with row clicks |
| Retailer logos | Clutter, not useful for comparison |
| "Includes shipping" when unverified | Misleading |
| Timestamp ("10m ago") | Creates false urgency |
| isBestPrice scaling/highlighting | Visual recommendation |

### 5.2 Remove from Grid

| Element | Reason |
|---------|--------|
| Individual retailer name column | Doesn't scale; use panel |
| Per-row retailer CTA | Use summary + panel pattern |
| "Best" row highlighting | Implies recommendation |

### 5.3 Remove from Panel

| Element | Reason |
|---------|--------|
| "Best value" sort option | Implies recommendation |
| Star ratings | We don't have this data; don't fake it |
| "Verified" badges | Implies hierarchy |
| Countdown timers | Creates false urgency |

### 5.4 Language to Remove

| Phrase | Replacement |
|--------|-------------|
| "Best price" | (remove entirely) |
| "Great deal" | (remove entirely) |
| "Save $X" | (remove entirely) |
| "Lowest we've seen" | (remove entirely) |
| "Buy now" | "View" |
| "Add to cart" | (remove entirely) |
| "Limited stock" | "In Stock" or "Out of Stock" only |
| "Hot" / "Trending" | (remove entirely) |

---

## 6. Component Mapping

| Spec Section | Current Component | Changes Required |
|--------------|-------------------|------------------|
| Card View | `result-card.tsx` | Remove isBestPrice, add retailer rows, new CTA |
| Grid View | `result-row.tsx` | Add retailer count column, remove inline retailer |
| Panel | (new) | Create `retailer-panel.tsx` |
| Retailer Row | (new) | Create `retailer-row.tsx` for panel |

---

## 7. Trust Check

> "Would a skeptical, price-sensitive ammo buyer trust this interface to show them the full picture without nudging them?"

**Verification:**
- ✅ No badges or highlighting imply "this is the one to buy"
- ✅ Sorting is explicit and user-controlled
- ✅ Shipping ambiguity is stated honestly
- ✅ All retailers are visible (via panel)
- ✅ Out-of-stock is shown, not hidden
- ✅ No urgency language or timers
- ✅ Primary action is "compare", not "buy"

**Verdict:** Pass.

---

## Appendix: ASCII Wireframes

### A.1 Card with 3 Retailers

```
┌─────────────────────────────────────┐
│                           [Watching]│
│ Federal American Eagle 9mm 115gr    │
│ FMJ 50 Round Box                    │
│ ┌──────┐ ┌─────┐ ┌──────┐ ┌──────┐ │
│ │ 9mm  │ │ FMJ │ │115gr │ │Brass │ │
│ └──────┘ └─────┘ └──────┘ └──────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Palmetto State    $0.30/rd  $15 │ │
│ │ In Stock · Free over $99        │ │
│ ├─────────────────────────────────┤ │
│ │ Natchez           $0.32/rd  $16 │ │
│ │ In Stock · +$8 shipping         │ │
│ ├─────────────────────────────────┤ │
│ │ OpticsPlanet      $0.34/rd  $17 │ │
│ │ Out of Stock                    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [        Compare Prices         ]   │
└─────────────────────────────────────┘
```

### A.2 Card with 8 Retailers (Overflow)

```
┌─────────────────────────────────────┐
│                             [Watch] │
│ Federal American Eagle 9mm 115gr    │
│ ...                                 │
│ ┌─────────────────────────────────┐ │
│ │ Palmetto State    $0.30/rd  $15 │ │
│ │ In Stock · Free over $99        │ │
│ ├─────────────────────────────────┤ │
│ │ Natchez           $0.32/rd  $16 │ │
│ │ In Stock · +$8 shipping         │ │
│ ├─────────────────────────────────┤ │
│ │ OpticsPlanet      $0.33/rd  $17 │ │
│ │ In Stock · + shipping           │ │
│ ├─────────────────────────────────┤ │
│ │ +5 more retailers               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [      Compare all 8 prices     ]   │
└─────────────────────────────────────┘
```

### A.3 Grid Row

```
┌────────────────────┬───────┬─────────┬─────────────┬────────┬───┬────────┐
│ Product            │ Cal   │ $/rd    │ Retailers   │ Stock  │ ★ │ Action │
├────────────────────┼───────┼─────────┼─────────────┼────────┼───┼────────┤
│ Federal Am. Eag... │ 9mm   │ $0.30   │ 8 retailers │ In     │ ○ │ Compare│
│ Hornady Critical...│ 9mm   │ $0.85   │ 3 retailers │ In     │ ● │ Compare│
│ Winchester Whit... │ .45   │ $0.42   │ 1 retailer  │ Out    │ ○ │ View   │
└────────────────────┴───────┴─────────┴─────────────┴────────┴───┴────────┘
```

### A.4 Retailer Panel

```
┌─────────────────────────────────────┐
│ ← Back                     [Watch]  │
├─────────────────────────────────────┤
│ Federal American Eagle 9mm          │
│ 115gr FMJ · 50 rounds · Brass       │
├─────────────────────────────────────┤
│ 8 retailers · Sort: Price ▼        │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Palmetto State Armory           │ │
│ │ $0.30/rd · $14.99 (50 rounds)   │ │
│ │ In Stock · Free shipping $99+   │ │
│ │                         [View →]│ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Natchez Shooters Supply         │ │
│ │ $0.32/rd · $15.99 (50 rounds)   │ │
│ │ In Stock · +$8.50 flat rate     │ │
│ │                         [View →]│ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Brownells                       │ │
│ │ $0.33/rd · $16.49 (50 rounds)   │ │
│ │ In Stock · + shipping           │ │
│ │                         [View →]│ │
│ └─────────────────────────────────┘ │
│ ...                                 │
│ ┌───────────────────────────────┐   │
│ │ [  View Product Details  ]    │   │
│ └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-24 | Initial specification |
# Status: Superseded
Consolidated into `context/specs/search-results-v2.md`. Do not use.

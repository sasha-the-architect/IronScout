# Search Results UX Specification (v2 Consolidated)

Status: Draft (consolidated)
Author: UX Review
Original date: 2025-01-24
Consolidated: 2026-01-26
Related: ADR-006 (No Recommendations), ADR-011 (Saved Items)

---

## Overview

This specification defines the Search Results experience for IronScout, covering:

1. Card View - Discovery mode for casual comparison
2. Grid View - Power user mode for dense scanning
3. Retailer Panel - Full comparison drawer

### Governing Constraints

| Constraint | Rule |
|------------|------|
| No recommendations | Never imply "this is a good time to buy" |
| No deal language | No "best", "deal", "worth it", "hot", "save" |
| No urgency | No countdown timers, stock pressure, or FOMO triggers |
| Factual only | Price, availability, shipping stated plainly |
| Multi-retailer core | Comparison across retailers is the primary value |
| Primary metric | Price-per-round ($/rd) is the universal comparison unit |

---

## 1. Card View Specification

### 1.1 Card Anatomy (Summary Model)

```
ÚÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ¿
³ [Watch]                              (top-right)
³                                          ³
³ Product Title                            ³
³ ÚÄÄÄÄÄÄÄÄ¿ ÚÄÄÄÄÄ¿ ÚÄÄÄÄÄÄ¿ ÚÄÄÄÄÄÄÄ¿     ³
³ ³ 9mm    ³ ³ FMJ ³ ³ 115gr³ ³ Brass ³     ³
³ ÀÄÄÄÄÄÄÄÄÙ ÀÄÄÄÄÄÙ ÀÄÄÄÄÄÄÙ ÀÄÄÄÄÄÄÄÙ     ³
³                                          ³
³ $0.28/rd                                 ³
³ $0.28 - $0.42                            ³
³                                          ³
³ 5 retailers                     Compare >³
ÀÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÙ
```

### 1.2 Price Summary Model

Cards show a summary only. Full comparison lives in the Retailer Panel.

Card shows:
- Product name
- Attribute badges (caliber, bullet type, grain, casing)
- Lowest in-stock $/rd
- Price range (min-max $/rd)
- Retailer count
- Compare affordance

Card does not show:
- Inline retailer rows
- Per-retailer stock or shipping
- Multiple price blocks

### 1.3 Card Actions

| Action | Location | Behavior |
|--------|----------|----------|
| Watch/Watching | Top-right corner | Toggle save state |
| Compare | Footer link | Opens Retailer Panel |
| Card click | Any non-control area | Opens Retailer Panel |

### 1.4 Card Attribute Badges

| Badge | Style | Always Show |
|-------|-------|-------------|
| Caliber | Filled, primary | Yes |
| Bullet Type | Outline, muted | If available |
| Grain Weight | Outline, muted | If available |
| Case Material | Brass=amber, Steel=gray | If available |

Removed:
- Price context badges ("Low"/"Typical")
- "New Listing"
- Performance badges on cards

### 1.5 Card States

| State | Behavior |
|-------|----------|
| All OOS | Muted styling, "Out of Stock" label, still show summary |
| No prices | Do not render card (filter upstream) |
| Watched | Bookmark icon filled, "Watching" label |
| Loading | Skeleton with badge + price summary placeholders |

---

## 2. Grid View Specification

### 2.1 Purpose

Grid view is for power users in execution mode:
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

Grid shows a summary; panel shows full detail.

| Retailer Count | Display |
|----------------|---------|
| 1 | "1 retailer" (no link) |
| 2-3 | "2 retailers" (clickable) |
| 4+ | "N retailers" (clickable, opens panel) |

The $/rd shown is the lowest available in-stock price.

If all retailers are OOS, show lowest OOS price with muted styling.

### 2.4 Grid Sorting

| Sort | Behavior | Implementation |
|------|----------|----------------|
| $/rd asc | Lowest first | URL param (`sortBy=price_asc`) |
| $/rd desc | Highest first | URL param (`sortBy=price_desc`) |
| Stock | In-stock first | Client-side |
| Relevance | Default/AI ranking | URL param (default) |

Rule: Only one sort active at a time.

### 2.5 Grid Filters (Inline)

| Filter | Type | Location |
|--------|------|----------|
| Hide out of stock | Checkbox | Above table |
| Caliber | Pills (if faceted) | Sidebar/header |

Removed:
- In-line price range sliders
- "Show only watched"

### 2.6 Grid Mobile Behavior

On mobile (< 768px), grid view falls back to card view.

---

## 3. Retailer Panel Specification

### 3.1 Purpose

The Retailer Panel is a drawer that shows all retailers for a product.

Triggered by:
- Compare link on card
- Retailer count link in grid
- Card click

### 3.2 Panel Anatomy

Panel includes:
- Back/close
- Product title + attributes
- Retailer list with per-retailer price, stock, and shipping
- Sort control

### 3.3 Retailer Row Anatomy (Panel)

| Element | Rules |
|---------|-------|
| Retailer Name | Full name, no truncation |
| $/rd | Primary, bold, large |
| Total | Secondary, with round count |
| Stock | "In Stock" or "Out of Stock" |
| Shipping | See Shipping Display Rules |
| Action | "View" button opens retailer URL |

### 3.4 Panel Sorting Options

| Sort Option | Behavior |
|-------------|----------|
| Price (low-high) | Default. $/rd ascending |
| Price (high-low) | $/rd descending |
| Retailer A-Z | Alphabetical |
| In-stock first | Stock status, then price |

No recommendation or "best value" sorts.

### 3.5 Shipping Display Rules (Panel)

| Shipping State | Display |
|----------------|---------|
| Included | "$0.32/rd delivered" |
| Excluded (known) | "$0.32/rd + $X ship" |
| Excluded (unknown) | "$0.32/rd + shipping" |
| Free over threshold | "$0.32/rd (free ship $99+)" |
| Pickup only | "$0.32/rd (pickup)" |
| Cannot determine | "$0.32/rd" |

Rule: Never display "Includes shipping" if unverified.

### 3.6 Out-of-Stock Handling

| Scenario | Behavior |
|----------|----------|
| Some OOS | Show at bottom, visually muted |
| All OOS | Show all with "Currently unavailable" header |
| Toggle to hide | Checkbox: "Hide out of stock" above list |

OOS rows still show last-known price.

### 3.7 Panel Empty State

If product exists but has no retailer prices:
- "No current listings"
- Optional "Watch this product" CTA

---

## 4. Explicit Rules

### 4.1 Display Caps

| Element | Cap | Overflow Handling |
|---------|-----|-------------------|
| Attribute badges (card) | 4 | Hide lowest-priority |
| Product title (card) | 2 lines | Truncate with ellipsis |
| Product title (grid) | 50 chars | Truncate with ellipsis |

### 4.2 Conditional Display

| Condition | Behavior |
|-----------|----------|
| roundCount missing | Show total price only, no $/rd |
| shipping unknown (card) | No shipping annotation |
| All retailers OOS | Show muted summary, no urgency |
| Single retailer | No "Compare" link; show "View at {Retailer}" in panel |
| No image | Show caliber-based placeholder icon |

### 4.3 Mobile Considerations

| Viewport | Card View | Grid View | Panel |
|----------|-----------|-----------|-------|
| Desktop (1024+) | 4-column grid | Full table | Right drawer |
| Tablet (768-1023) | 2-column grid | Full table | Right drawer |
| Mobile (<768) | 1-column stack | Cards only | Full-screen modal |

### 4.4 Loading States

| Component | Skeleton |
|-----------|----------|
| Card | Title bar + badges + price summary |
| Grid Row | Column-aligned placeholders |
| Panel | Header + 5 row placeholders |

---

## 5. Removal List (Language + UI)

Remove:
- "Best price" badges
- Deal/verdict language
- Countdown timers or urgency prompts
- Shipping claims when unverified

---

## 6. Component Mapping

| Spec Section | Component | Notes |
|--------------|-----------|-------|
| Card View | `result-card-v2.tsx` | Summary-only; no inline retailers |
| Grid View | `result-row-v2.tsx` | Retailer count + compare link |
| Panel | `retailer-panel.tsx` | Full retailer list |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-26 | Consolidated v2 spec + patch |

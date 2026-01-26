# Dashboard Product Spec v5 — Patch 001

**Patch ID:** v5-patch-001
**Applies to:** `dashboard-product-spec-v5.md`
**Status:** Normative
**Date:** 2026-01-24

---

## 1. Patch Purpose

The base spec defines content and behavior but is **underspecified structurally**. This allowed implementations that preserved feed-like hierarchies, hero patterns, and repeated status messaging—resulting in a dashboard that "feels the same" as previous versions despite changed copy.

This patch adds **structural constraints** to enforce:
- Watchlist as the dominant surface
- Demotion of Spotlight from hero to ephemeral notice
- Elimination of feed-shaped layouts
- Silence as the default state

---

## 2. Added Sections

### ADD: Section 0 — Structural Hierarchy (Insert Before "Sections")

```markdown
## Structural Hierarchy

### Dominance Model

The dashboard MUST NOT have a hero zone or multiple primary sections.

| Level | Section | Treatment |
|-------|---------|-----------|
| **Dominant** | Watchlist | Primary content; table layout; always rendered if items exist |
| **Ephemeral** | Spotlight | Single-line notice; dismissible; rendered only when qualifying |
| **Collapsed** | Recent Price Movement | Inline or collapsed by default; not a feed |
| **Ambient** | Back in Stock, Gun Locker | Subordinate to Watchlist; minimal visual weight |

### Normative Rules

- The Watchlist MUST be the visually dominant element on the page.
- No section MUST compete with Watchlist for visual primacy.
- Spotlight MUST NOT appear as a card, hero, or featured element.
- The page MUST feel like a status board, not a deal feed.
```

---

### ADD: Section 6 — Layout Constraints (Insert After "Section Limits Summary")

```markdown
## Layout Constraints

### Watchlist Layout

- MUST render as a **table**, not cards.
- Row height MUST NOT exceed **48px**.
- MUST NOT use card containers, shadows, or borders per-item.
- Hover state: subtle background highlight only.

### Spotlight Layout

- MUST render as a **single-line notice bar**.
- Height MUST NOT exceed **40px**.
- MUST be flush with page content, not centered or isolated.
- MUST NOT display:
  - Price
  - Percent change
  - Card container
  - Shadow or border
  - Visual emphasis beyond muted background
- MUST include a dismiss button (X).
- When dismissed, MUST NOT render a placeholder.

### Recent Price Movement Layout

- MUST NOT render as a vertical feed.
- MUST render as ONE of:
  1. An inline column within the Watchlist table, OR
  2. A collapsed accordion ("N price changes") that expands on interaction
- Maximum **3 items** visible without expansion.
- MUST NOT display "PRICE DROP" or equivalent labels.
- MUST use directional arrows only (↓ ↑) for movement indication.
- Percent change MUST NOT be displayed inline; MAY appear in tooltip.

### Back in Stock / Gun Locker Layout

- MUST NOT exceed visual weight of Watchlist rows.
- MUST use identical row density as Watchlist.
```

---

### ADD: Section 7 — Status Text Rules (Insert After "Layout Constraints")

```markdown
## Status Text Rules

### Silence as Default

The default state of a row is **no status text**. Status text MUST appear only when the condition is exceptional.

### When Status Text Appears

| Condition | Status Text |
|-----------|-------------|
| Price is at 90-day low | `90d low` (badge or inline) |
| Item just restocked (<24h) | `Back in stock` |
| Price changed in last 24h | Directional arrow only (↓ ↑) |

### When Status Text MUST NOT Appear

- Price is stable
- Price increased (not exceptional)
- No change since last check
- Any "normal" state

### Repetition Ban

If **3 or more items** share the same status condition, the per-row status MUST be collapsed into a single summary:

> "3 items at 90-day lows"

This summary MUST appear as a footnote or header annotation, NOT per-row.
```

---

### ADD: Section 8 — Vitality Requirements (Insert After "Status Text Rules")

```markdown
## Vitality Requirements

The dashboard MUST NOT feel empty or dead during quiet periods. It MUST provide **non-prescriptive vitality**: evidence that monitoring is active and new information that rewards checking in, without creating action pressure.

### Purpose

Users who check the dashboard during calm periods (no price drops, no restocks) should:
- See evidence that the system is working
- Encounter new information worth knowing
- Feel their attention was rewarded, not wasted

Users MUST NOT:
- Feel pressured to act
- Interpret vitality signals as recommendations
- See vitality elements as primary content

### Vitality Mechanisms (Allowed)

#### 1. Monitoring Summary (Header Region)

A single-line status showing system activity:

| State | Display |
|-------|---------|
| Active monitoring | "Monitoring {N} items across {M} retailers" |
| Recent check | "Last checked: {relative time}" |
| No changes | "No price changes in the last {N} days" |

**Constraints:**
- MUST appear in header region, not as a section
- MUST NOT exceed one line
- MUST NOT include counts that imply action (e.g., "5 deals found")
- MUST use muted text styling (text-muted-foreground)

#### 2. Freshness Timestamps (Per-Row, Optional)

Each Watchlist row MAY display when the price was last observed:

| Format | Example |
|--------|---------|
| Relative | "2h ago" |
| Absolute (>24h) | "Jan 23" |

**Constraints:**
- MUST appear in muted/secondary text
- MUST NOT be the primary information in the row
- MUST NOT imply urgency ("just now!" is forbidden)

#### 3. Market Context Line (Footer Region)

A single factual observation about the broader market:

| Type | Example |
|------|---------|
| Aggregate trend | "9mm prices are 8% lower than 30-day average" |
| Availability | "12 of 15 tracked items currently in stock" |
| Coverage | "Monitoring prices from 47 retailers" |

**Constraints:**
- MUST appear below Watchlist, not above
- MUST be a single line, muted styling
- MUST NOT reference specific products
- MUST NOT imply action ("prices are dropping—act now" is forbidden)
- MUST rotate or vary to reward repeated visits

#### 4. Sparklines (Inline, Optional)

Mini price charts (last 30 days) may appear in Watchlist rows.

**Constraints:**
- MUST be small (max 60px wide, 16px tall)
- MUST NOT include axis labels or values
- MUST use muted colors (no red/green for up/down)
- MUST NOT be interactive

### Vitality Anti-Patterns (Forbidden)

| Pattern | Why Forbidden |
|---------|---------------|
| "X new deals since your last visit" | Implies action required |
| Countdown timers | Creates urgency |
| "Prices are moving—check now" | Prescriptive language |
| Animated attention indicators | Draws focus inappropriately |
| Notification badges with counts | Implies backlog to clear |
| "You might have missed..." | FOMO language |
| Vitality content as cards | Elevates to section status |
| Color-coded trends (red/green) | Implies good/bad judgment |

### Quiet Period Behavior

When no exceptional events exist:

- Spotlight: Not rendered (no placeholder)
- Watchlist: Rendered with no status badges (silence)
- Price Movement: Collapsed or hidden
- Vitality: Monitoring summary + market context line provide ambient activity

The dashboard MUST NOT feel broken or incomplete during quiet periods. Vitality elements ensure the page feels alive without manufacturing urgency.

### Normative Rules

13. **Vitality MUST NOT create action pressure.** All vitality content is observational.

14. **Vitality MUST appear in subordinate positions.** Header or footer regions only, never as sections.

15. **Vitality text MUST use muted styling.** Never primary text weight or color.

16. **Vitality content MUST vary.** Market context lines should rotate to reward repeat visits.

17. **Quiet periods MUST NOT feel empty.** At minimum, monitoring summary must always appear.
```

---

## 3. Replaced Sections

### REPLACE: "1. Spotlight (Conditional)"

**Existing text (lines 42-56):**
```markdown
### 1. Spotlight (Conditional)

- Renders only if a qualifying signal exists within last 7 days
- Single item only

**Copy**
- Title: Spotlight
- Subtitle: Notable price movement observed recently

**Primary Action**
- View price history

Secondary link:
- See market context →
```

**Replacement:**
```markdown
### 1. Spotlight (Conditional)

Spotlight is an **ephemeral notice**, not a featured element.

**Render Conditions**
- Renders only if a qualifying signal exists within last 7 days
- Single item only
- MUST NOT render if user has dismissed it this session

**Structural Constraints**
- Form: Single-line notice bar
- Max height: 40px
- Background: Muted (gray-50 or equivalent)
- No card, no shadow, no border
- Position: Above Watchlist, flush left
- MUST include dismiss button (X)

**Content**
- Text: "{Product name} is at its 90-day low"
- MUST NOT display: price, percent change, retailer
- MUST NOT use title/subtitle hierarchy

**Interactions**
- Click → Navigate to product detail or price history
- Dismiss (X) → Remove for session; no placeholder

**Anti-Pattern**
Spotlight MUST NOT be implemented as a card, hero section, or visually dominant element. If Spotlight draws more attention than Watchlist, the implementation is incorrect.
```

---

### REPLACE: "2. Your Watchlist (Always)"

**Existing text (lines 59-90):**
```markdown
### 2. Your Watchlist (Always)

Header:
Your Watchlist
Prices we're monitoring for you

Row:
- Product name
- Attributes
- Current price / round
- Optional factual status line

Allowed status:
- Lowest price observed in last 90 days
- Price moved since last check
- Back in stock

Disallowed:
- Badges
- "No change" text

**Limits**
- Max 10 items
- Sorted by most recent change

Footer (if <5 items):
Add more items to catch more price changes.
[Search to add items]

CTA:
- View all watchlist →
```

**Replacement:**
```markdown
### 2. Your Watchlist (Always)

Watchlist is the **dominant surface** of the dashboard.

**Header**
- Title: Your Watchlist
- Subtitle: Prices we're monitoring for you

**Layout**
- MUST render as a table, not cards
- Row height: ≤48px
- Columns: Product | $/rd | Sparkline (optional) | Status | Watch toggle

**Row Content**
- Product name (truncate at 45 chars; tooltip for full)
- Current price per round
- Optional: inline sparkline (last 30 days)
- Status text: ONLY when exceptional (see Status Text Rules)
- Watch toggle: star or bookmark icon

**Status Display Rules**
- Price at 90-day low → Show `90d low` badge
- Price stable → No status (silence)
- Price increased → No status (silence)
- If 3+ items share same status → Collapse to summary footnote

**Disallowed**
- Badges on every row
- Repeated status text across rows
- Percent deltas
- "No change" or equivalent messaging
- Card containers per row

**Limits**
- Max 10 items
- Sort: Most recent change first

**Footer** (if <5 items):
- Text: "Add more items to track more prices."
- CTA: [Search to add items]

**CTA**
- View all watchlist →
```

---

### REPLACE: "3. Recent Price Movement (Conditional)"

**Existing text (lines 93-118):**
```markdown
### 3. Recent Price Movement (Conditional)

Header:
Recent Price Movement
Notable price changes observed recently

Sources:
- Watchlist items
- Gun Locker matches (if configured)

Row:
- Optional badge (ACTIVE / STALE only)
- One-line factual explanation
- Product + retailer
- Price / round
- Action: View price history

**Gun Locker-sourced rows must include:**
"Matches [caliber] in your gun locker"

**Limits**
- Max 5 items
- Sort order:
  1. ACTIVE before STALE
  2. Most recent eventAt
  3. Largest % change (tie-break)
```

**Replacement:**
```markdown
### 3. Recent Price Movement (Conditional)

Recent Price Movement provides ephemeral context. It MUST NOT be a primary section.

**Layout Options (Choose One)**

Option A — Inline Column:
- Render as a column within the Watchlist table
- Column header: "24h"
- Cell content: ↓12% or ↑5% or "—"
- No separate section header

Option B — Collapsed Accordion:
- Header: "N price changes today" (collapsed by default)
- User clicks to expand
- Max 3 items visible after expansion
- "Show more" for additional items

**Row Content (if rendered separately)**
- Product name
- Directional arrow (↓ ↑)
- Price per round
- Action: View price history

**Disallowed**
- Vertical feed layout
- "PRICE DROP" or equivalent labels
- Percent change displayed inline (tooltip only)
- ACTIVE/STALE badges
- More than 3 items visible by default

**Gun Locker Attribution**
If sourced from Gun Locker match:
- Append: "Matches {caliber} in your gun locker"

**Limits**
- Max 5 items total (3 visible, 2 behind expansion)
- Sort: Most recent first
```

---

## 4. New Normative Rules

### Hierarchy Rules

1. **Watchlist MUST be the visually dominant element.** No other section may compete for primary attention.

2. **Spotlight MUST NOT be visually dominant.** It is a notice, not a feature.

3. **The dashboard MUST NOT have a hero zone.** No section receives featured/prominent treatment.

4. **Silence is the default.** Rows without exceptional status MUST display no status text.

### Layout Rules

5. **Watchlist MUST be a table.** Card-per-item layouts are forbidden.

6. **Spotlight MUST be a single-line notice.** Max height 40px. No card container.

7. **Recent Price Movement MUST NOT be a vertical feed.** It MUST be inline or collapsed.

8. **Row height MUST NOT exceed 48px** for any section.

### Content Rules

9. **Percent changes MUST NOT appear inline.** Tooltip only, if at all.

10. **"PRICE DROP" labels are forbidden.** Use directional arrows only.

11. **Repeated status text MUST be collapsed.** If 3+ items share status, use a summary.

12. **Badges MUST appear only on exceptional items.** Not on every row.

---

## 5. Anti-Patterns (Normative)

The following patterns are **explicitly forbidden**:

| Pattern | Why Forbidden | Correct Alternative |
|---------|---------------|---------------------|
| Card-per-item in Watchlist | Implies individual importance | Dense table rows |
| Spotlight as hero/card | Position implies recommendation | Single-line notice bar |
| Vertical feed for price changes | Feed = action-oriented | Inline column or collapsed accordion |
| Repeated status text per row | Repetition = emphasis | Summary footnote |
| Percent change as primary info | Magnitude = urgency | Hide or tooltip |
| "PRICE DROP" labels | Label = action category | Directional arrow (↓) |
| Badges on every row | Attention inflation | Badges on exceptions only |
| Multiple sections with equal visual weight | Competing for attention | Watchlist dominant, others subordinate |
| Shadow/border per Watchlist row | Card-like treatment | No per-row containers |
| Centered Spotlight | Hero treatment | Flush left, inline with content |
| "X new deals since last visit" | FOMO / action pressure | Factual monitoring summary |
| Countdown timers | Manufactured urgency | Static timestamps |
| Animated attention indicators | Distracts from calm | Static, muted elements |
| Red/green trend colors | Implies good/bad judgment | Neutral muted colors |
| Notification badges with counts | Implies backlog to clear | No badges on vitality |
| Vitality content as cards/sections | Elevates subordinate content | Single-line, muted text |

---

## 6. Acceptance Test

> **"If the dashboard feels like a feed of things to consider, the implementation is incorrect."**

The correct experience: A quiet status board the user checks occasionally, not a list of actionable deals.

---

## Appendix: Visual Reference (ASCII)

### Correct Spotlight Treatment
```
┌─────────────────────────────────────────────────────────────┐
│ ℹ Federal 9mm is at its 90-day low                    [×]  │
└─────────────────────────────────────────────────────────────┘
```

### Correct Watchlist Treatment
```
┌─────────────────────────────────────────────────────────────┐
│ Product              │ $/rd    │ ▁▂▃▂▁  │ Status    │  ☆  │
├─────────────────────────────────────────────────────────────┤
│ Federal 9mm 124gr    │ $0.28   │ ▁▂▃▂▁  │ 90d low   │  ★  │
│ Hornady .308 168gr   │ $1.42   │ ▂▂▂▂▂  │           │  ★  │
│ CCI .22LR            │ $0.08   │ ▃▂▁▂▃  │           │  ★  │
└─────────────────────────────────────────────────────────────┘
3 items at 90-day lows
```

### Correct Price Movement (Collapsed)
```
┌─────────────────────────────────────────────────────────────┐
│ ▸ 3 price changes today                                     │
└─────────────────────────────────────────────────────────────┘
```

### Correct Vitality Treatment (Quiet Period)
```
┌─────────────────────────────────────────────────────────────┐
│ Your Watchlist                                              │
│ Monitoring 8 items across 47 retailers · Last checked: 2h ago│
├─────────────────────────────────────────────────────────────┤
│ Product              │ $/rd    │ ▁▂▂▂▁  │           │  ★  │
│ Federal 9mm 124gr    │ $0.28   │ ▁▂▂▂▁  │           │  ★  │
│ Hornady .308 168gr   │ $1.42   │ ▂▂▂▂▂  │           │  ★  │
│ CCI .22LR            │ $0.08   │ ▃▂▁▂▃  │           │  ★  │
├─────────────────────────────────────────────────────────────┤
│ 9mm prices are 8% below 30-day average                      │
└─────────────────────────────────────────────────────────────┘
```

Note: During quiet periods (no exceptional events), the dashboard shows:
- Monitoring summary in header (muted)
- Watchlist rows with sparklines but NO status badges
- Market context line in footer (muted)
- NO Spotlight, NO Price Movement section

---

## Changelog

- **v5-patch-001** (2026-01-24): Added structural hierarchy, layout constraints, status text rules, anti-patterns, and acceptance test.
- **v5-patch-001a** (2026-01-24): Added vitality requirements section with monitoring summary, freshness timestamps, market context line, and sparklines. Added vitality anti-patterns. Added normative rules 13-17.

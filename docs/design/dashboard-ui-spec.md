# IronScout Dashboard UI/UX Specification v1

**Created:** December 19, 2025
**Status:** Implementation Ready

---

## Design Posture

- **Dark-first** - Signals seriousness and differentiation
- **Dense but calm** - More like a trading desk than a coupon site
- **Opinionated** - The system takes a stance
- **Progressive disclosure** - Verdict first, explanation on demand

> Design the dashboard like a trading terminal, not a shopping site.

---

## Core Principles

### What We're Designing

- A **decision surface**
- For **time-sensitive, price-driven actions**
- Where **confidence > aesthetics**

### What We're NOT Designing

- A catalog
- A marketing site
- An alerts manager

### Key Differentiators

| Competitors | IronScout |
|-------------|----------|
| List deals | Tell users what to do |
| React to alerts | Create daily opens without alerts |
| Sell data | Sell confidence |

---

## Layout System

### Desktop Grid

- Max width: 1200–1280px
- Columns: 12
- Gutter: 24px
- Section vertical rhythm: 32–40px

### Mobile

- Collapses to stacked cards
- Verdict chips always visible

---

## Page Hierarchy (Top → Bottom)

### 0. Header (Thin, Utilitarian)

- Search input (persistent)
- Quick filters (caliber, price/rd)
- Account tier indicator ("Free" / "Premium ✨")
- **No marketing. No noise.**

### 1. TODAY'S BEST MOVES (Hero)

**Grid:** Full width (12 cols)
**Purpose:** Immediate action guidance

```
[ BUY NOW ]   9mm FMJ
$0.21 / rd

15% below your target
▼ 3% this week

[ Buy Now → ]
```

**Card Components:**

| Position | Content |
|----------|---------|
| Left (primary) | Verdict chip (BUY NOW / WAIT / STABLE), Product name, Current price/rd |
| Right (secondary) | Delta vs target/average, Micro trend arrow, Primary CTA |

**Verdict Chips:**
- `BUY NOW` - Green
- `WAIT` - Amber
- `STABLE` - Neutral

**Interactions:**
- Hover verdict → tooltip: "Historically strong price relative to last 90 days"
- Free: Verdict only
- Premium: % delta + historical context

**Upgrade Microcopy (Free):**
> "Unlock price timing and savings context →"

---

### 2. DEALS FOR YOU (Primary Click Engine)

**Grid:** 8 cols (left column)
**Placement:** Immediately under hero

```
⚡ HOT DEAL
Federal 9mm 1000rd
$0.19 / rd

15% below your target
Only 47 left

[ Buy Now → ]
```

**Card Components:**
- Deal label (HOT DEAL, NEW LOW, BULK VALUE)
- Product name
- Price/rd emphasized
- 1–2 urgency signals max
- Single dominant CTA

**Ranking Rules:**

| Tier | Feed Size | Features |
|------|-----------|----------|
| Free | 3–5 items | No "why this is good" explanation |
| Premium | 10–20 items | "Why you're seeing this" expandable |

**Premium Ranking Surfaces:**
- Best value
- Trusted retailer
- Shipping efficiency

---

### 3. MARKET PULSE (Context Block)

**Grid:** 4 cols (right column)
**Purpose:** Supporting intelligence, not the hero

```
📊 MARKET PULSE

9mm FMJ   $0.21 ▃▂▃▄▃   Good
.223 Rem  $0.38 ▆▇█▇▆   Wait
.45 ACP   $0.42 ▃▃▃▃▃   Stable
```

**Row Components:**
- Caliber
- Current avg price
- Sparkline
- Verdict tag

**Interactions:**
- Click row → full chart modal (Premium)
- Free: 7-day context only
- Premium: 30/90/365 day toggle

---

### 4. SAVINGS TRACKER (Proof + Reinforcement)

**Grid:** Full width
**Placement:** After deals feed

```
💵 YOUR SAVINGS

This month: $47
All time: $312

Premium users save an average of $X/month
```

| Tier | Display |
|------|---------|
| Free | "Potential savings" |
| Premium | "Confirmed savings" |

**Upgrade Copy (Subtle, Factual):**
> "Premium paid for itself this month."

**Important:** This is extremely powerful. Do not oversell.

---

### 5. WATCHLIST PREVIEW (Teaser)

**Grid:** Full width
**Purpose:** Remind users what they care about

- Show 3–5 items max
- Inline price change indicator
- CTA: "View full watchlist"

| Tier | Features |
|------|----------|
| Free | Current price only |
| Premium | "Lowest in X days" + inline sparkline |

---

## Microcopy Rules

### Bad (Don't Use)

- "We recommend"
- "Our AI thinks"
- "You might like"

### Good (Use These)

- "Buy now"
- "Wait"
- "Below your target"
- "Historically strong"

> **Confidence beats friendliness.**

---

## Motion & Feedback

- Price updates animate with brief pulse
- Verdict chip color fades in on load
- CTA hover increases contrast, not size
- **No confetti. No gimmicks.**

---

## Premium Upgrade Moments

**Only 3 Allowed:**

1. Expanding "Why now?"
2. Clicking full price history
3. Viewing full deal explanations

**Upgrade copy should always reference money or certainty, never features.**

---

## Component Specifications

### Atoms

| Component | Variants |
|-----------|----------|
| Chip/Status | BUY NOW, WAIT, STABLE |
| Button | Primary, Secondary, Ghost |
| Tag | HOT DEAL, NEW LOW, BULK VALUE |
| Metric | Label + Value |
| Divider | - |

### Molecules

| Component | States |
|-----------|--------|
| DealCard | default, hover, premium-explainer-expanded, locked |
| PulseRow | default, hover, selected |
| SavingsCard | free, premium |
| LockedOverlay | - |
| Tooltip/Why | - |

### Organisms

- SectionHeader (title + optional action link)
- DealsFeed (vertical list with load more)
- MarketPulsePanel (list of PulseRow + "View full trends →")
- SavingsPanel (SavingsCard + small explainer)

---

## Design Tokens

> **Note:** All tokens align with `docs/design/style-guide.md` and `docs/design/design-principles.md`

### Spacing (Tailwind Scale)

Use standard Tailwind spacing (4px base unit):
```
8px (space-2) / 12px (space-3) / 16px (space-4) / 24px (space-6) / 32px (space-8) / 40px (space-10)
```

- Section vertical rhythm: `space-y-8` (32px)
- Component spacing: `space-y-4` (16px)
- Element spacing: `space-y-2` (8px)

### Typography (Inter Font)

| Element | Tailwind Class | Size |
|---------|---------------|------|
| H1 (page title) | `text-2xl` | 24px |
| Section title | `text-lg font-semibold` | 18px |
| Card title | `text-base font-medium` | 16px |
| Body | `text-sm` | 14px |
| Meta/labels | `text-xs` | 12px |

### Colors (Dark Mode - Night Recon Theme)

Mapped to CSS variables defined in `globals.css`:

```
Background: --background (Deep Ops Black #121418)
Cards: --card (Slate Armor #2C333A)
Text Primary: --foreground (Vapor Grey #DCE3E8)
Text Secondary: --muted-foreground (Cool Steel #8A97A6)
Accent: --primary (Tactical Cyan #00C2CB)
Borders: --border (Cool Steel darker)

Status Colors (new):
--status-buy: Green #22c55e (BUY NOW)
--status-wait: Amber #f59e0b (WAIT)
--status-stable: Gray (STABLE)
--status-hot: Red/Orange (HOT DEAL)
--status-new: Cyan (NEW LOW)
--status-bulk: Purple (BULK VALUE)
```

### Effects

- Card radius: `rounded-lg` (8px per style guide)
- Elevated card: `shadow-md` (one level elevation)
- Transitions: 150-300ms with ease-in-out (per design principles)

### Accessibility (WCAG AA)

- All status colors meet 4.5:1 contrast ratio
- Touch targets: 44x44px minimum
- Focus states: `ring-2 ring-primary ring-offset-2`
- Respect `prefers-reduced-motion`

---

## State Variables

| Variable | Values |
|----------|--------|
| tier.mode | free / premium |
| pulse.depth | lite / full |
| deals.count | few / many |
| savings.mode | potential / confirmed |
| explainers | hidden / shown |

---

## Mobile Considerations

### Free Mobile

- Hero becomes horizontal swipe cards or stacked
- Deals feed is primary
- Pulse becomes collapsible section
- Savings is compact strip

### Premium Mobile

- Pulse rows tap to open full-screen modal
- Deal explanations become bottom sheet

---

## Content Placeholders

### Calibers (Use Consistently)

- 9mm FMJ
- .223 Rem
- .45 ACP
- .22LR

### Urgency Signals (1-2 Max)

- "Only 47 left"
- "Free shipping over $250"

---

## "Done" Criteria

1. Stakeholder can click through Free → see locked value → understand Premium in < 30 seconds
2. Premium screen feels like a decision terminal, not a deal list
3. Hero, Deals, Pulse, Savings each have clear CTA and outcome
4. Mobile is usable with one thumb

---

## Key Insight

> If you cannot sell Premium in the prototype alone, the feature set is wrong.
> The UI should make non-Premium feel like flying without instruments.

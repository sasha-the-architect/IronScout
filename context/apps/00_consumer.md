# Consumer App Behavior

This document defines the behavior of the IronScout consumer-facing application.

It describes what users see, how surfaces behave, and how decisions are communicated.  
All user-facing behavior must comply with the UX Charter and relevant ADRs.

---

## Core User Flow

IronScout follows a simple loop:

1. Users search to explore prices.
2. Users save items they care about.
3. IronScout watches the market.
4. The Dashboard surfaces moments worth attention.

The system favors restraint over noise.

Quiet periods are expected and intentional.

---

## Search

Search is the primary discovery surface.

Users can:
- Search by caliber, brand, and attributes
- Compare current prices across retailers
- View limited historical context
- Filter and refine results

Search does not recommend what to buy.

Search captures user intent but does not escalate urgency.

---

## Saved Items

Saved Items represent explicit user interest.

Users can:
- Save individual products
- View current price and retailer
- See simple directional price movement

Saved Items power:
- Dashboard surfacing
- Alert eligibility (per Alerts Policy v1)

Saved Items exist to delegate monitoring to the system.

Saved Items are the primary repeat-engagement and management surface.

---

## Implicit Intent (Internal Only)

The system may infer user interest from repeated or recent searches.

This inferred intent:
- May influence what the Dashboard surfaces
- Is not exposed as a user-managed feature
- Does not create Saved Items
- Does not trigger alerts in v1

All alerting and interruption authority is reserved for explicitly Saved Items.

---

## Dashboard

The Dashboard is the primary **action surface**.

It answers one question:

> “Is there something worth buying right now?”

The Dashboard is not a feed, summary, portfolio, or analytics view.  
It is a moment-based surface designed for quick check-ins.

---

### System Status (Always Present)

When no immediate action is required, the Dashboard communicates system state.

This status reassures users that monitoring is active even when nothing is surfaced.

Example language:
- “Nothing urgent right now — we’re out scouting prices and availability.”
- “Monitoring active.”

This status is informational only and must not include calls to action.

---

### Hero Recommendation

- At most one Hero may be shown.
- The Hero appears only when a confident signal exists.
- If no Hero qualifies, nothing is shown in its place.

The absence of a Hero is not an error state.

---

### No-Hero State (Default)

The absence of a Hero is the expected state.

In this case, the Dashboard displays a calm status message such as:
- “Nothing urgent right now”
- “Nothing changed yet”

The Dashboard may also include a brief orientation line explaining what to expect next, for example:

> “We’ll surface changes here when prices or availability move on items you care about.”

No actions or exploration prompts appear in this state.

---

### Recent Changes (Activity Feed)

Instead of listing all Saved Items, the Dashboard may show a **Recent Changes** activity feed.

The purpose of this feed is to answer:

> “What changed recently?”

**Rules**
- Show **only** Saved Items with a recent price or availability change.
- Sort strictly by **most recent change first**.
- Hard cap at **3–5 items**.
- If no recent changes exist, the feed does **not render at all**.

**Display per item**
- Item name
- Retailer
- Directional delta only (e.g., price up/down or availability change)

Example:
9mm FMJ 115gr — Cabela’s
▼ $0.02 since yesterday


**Explicitly forbidden**
- Full Saved Items lists
- Stable or unchanged items
- Charts, sparklines, or timelines
- Aggregates or summaries
- Rankings or “best” language
- Alert-style urgency

The Dashboard must never present a complete portfolio view.

---

### Saved Items Empty State (Dashboard)

If the user has no Saved Items, the Dashboard may include a simple explanatory message:

> “Save items and IronScout will watch prices and availability for you.”

Any exploratory action (e.g., “Find something to watch”) may appear **only** in this empty state.

---

## Alerts

Alerts are governed by `context/operations/alerts_policy_v1.md`.

In v1:
- Alerts apply only to explicitly Saved Items
- Alerts are rare and interruption-worthy
- Alerts are never triggered by inferred or implicit search intent

Alerts complement the Dashboard. They do not replace it.

If an alert is sent, the Dashboard may reflect the change without duplicating urgency.

---

## Premium Availability (v1)

Premium is not offered in v1. All consumer capabilities are available to every user.

---

## Language and Tone

All user-facing copy must:
- Be calm and factual
- Avoid urgency unless justified
- Avoid explanations or reasoning
- Avoid claims of optimality or authority

Language should reinforce that monitoring is ongoing, even when no action is required.

See `06_ux_charter.md` for enforcement rules.

---

## Summary

The consumer app is designed to:
- Reduce noise
- Preserve trust
- Surface moments selectively

Silence is intentional.  
Monitoring is continuous.  
Action appears only when it matters.

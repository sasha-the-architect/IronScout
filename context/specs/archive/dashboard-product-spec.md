# Dashboard Product Specification (Dashboard v4)

**Status:** Authoritative  
**Applies to:** IronScout Dashboard v4  
**Audience:** Product, Engineering, Design  
**Last updated:** 2026-01-13

---

## 1. Purpose

This document defines **exact dashboard behavior** across all user states.
It is written to be directly consumable by engineering and Codex.
If behavior is not described here, it must not be implemented.

---

## 2. Core Product Principles

1. **Watchlist is the system of record**
2. **Search exists to feed the watchlist**
3. **Dashboard exists to confirm, not explore**
4. **Buying is optional; tracking is the product**

---

## 3. Global Layout Rules (All States)

### 3.1 Navigation
Left navigation is fixed and always visible.

Order:
1. Dashboard
2. Search
3. Watchlist
4. Settings

Note: Billing is not included in consumer nav for v1 (no consumer Premium tier).

### 3.2 Highlighted Search Entry
- Search MUST appear as a visually emphasized primary nav item
- This is the only highlighted nav element
- Rationale: Search is the highest-leverage action across all lifecycle states

---

## 4. User States (Authoritative)

### 4.1 Brand New
**Definition**
- 0 watchlist items

**Primary Goal**
- First search
- First saved item

**Dashboard Behavior**
- Hero search module rendered at top
- Copy: "Save items to watch. We'll monitor price changes."
- Secondary: "Add items to your watchlist so we can monitor prices."
- CTA: "Find ammo deals" → routes to Search
- No watchlist section rendered
- Best Prices module visible but secondary

---

### 4.2 New (2–4 items)
**Definition**
- 1–4 watchlist items

**Primary Goal**
- Reach minimum effective watchlist size (5+)

**Dashboard Behavior**
- Top banner:
  “Your watchlist has {N} items. Most price drops are still invisible.”
- Primary CTA: “Add ammo to watchlist” → Search
- Inline suggestion chips (caliber shortcuts)
- Watchlist preview:
  - Max 3 items shown
  - Label: “recommended 5–10”
- Best Prices visible

---

### 4.3 Needs Alerts
**Definition**
- ≥5 watchlist items
- ≥1 item missing active alert

**Primary Goal**
- Alert configuration

**Dashboard Behavior**
- Top alert banner with count
- CTA: “Configure alerts”
- Watchlist preview shows alert status icons
- No search hero
- Best Prices visible

---

### 4.4 Healthy
**Definition**
- ≥5 watchlist items
- All alerts active

**Primary Goal**
- Reassurance

**Dashboard Behavior**
- Status banner:
  “Watchlist ready. {N} items with price drop alerts.”
- Secondary action: “Add more to watchlist”
- Watchlist preview (3 of N)
- Best Prices visible
- No primary CTA

---

### 4.5 Returning
**Definition**
- Healthy user with prior alerts delivered

**Primary Goal**
- Reinforce value

**Dashboard Behavior**
- Status banner:
  “{X} price drops caught this week.”
- Watchlist preview
- Best Prices visible

---

### 4.6 Power User
**Definition**
- ≥7 watchlist items
- Frequent alerts and visits

**Primary Goal**
- Scale advantage

**Dashboard Behavior**
- Status banner with weekly outcome summary
- Inline action: “Add another caliber”
- Full watchlist preview allowed (up to 7)
- Best Prices visible

---

## 5. Watchlist Rules (Critical)

- Watchlist is referenced in **every state except Brand New**
- Dashboard watchlist is always a **subset**
- “Manage” routes to full Watchlist page
- No inline editing beyond navigation

---

## 6. Best Prices Module

**Purpose**
- Demonstrate value
- Enable optional buying

**Rules**
- Always shown
- Never framed as recommendation
- Copy must imply opportunity, not advice

Footer copy:
“Deals like these are caught when items are in your watchlist.”

---

## 7. Search Behavior

- Search is never embedded in dashboard except Brand New hero
- All “Add to watchlist” actions route to Search
- Search results must support:
  - Save to watchlist
  - Immediate return to dashboard

---

## 8. Codex Enforcement Notes

- State resolution is server-side
- Frontend receives resolved state enum
- No conditional logic outside state map
- No A/B copy variance without spec update

---

## 9. Non-Negotiables

- No duplicate CTAs
- No conflicting terminology (Watchlist only)
- No hidden states
- No silent failures

This spec replaces Dashboard v3 in full.
# Status: Superseded
Superseded by ADR-020. Do not use for v1 behavior.

# IronScout v1 User Loop Spec
## How Gun Locker, Dashboard Deals, and Mobile Price Check Work Together

---

## Purpose

This document defines the **core user loop** for IronScout v1.

It explains how three features:
- Gun Locker
- Dashboard Market Deals
- Mobile Price Check

work together to create **repeat engagement driven by new information**, not habit, browsing, or spam.

This is a product behavior spec, not a UI layout or implementation guide.

---

## The Core User Problem

Ammo buyers are **episodic and time-compressed**:
- They are not always shopping
- When they are, they need confidence fast
- They revisit tools only when something *changed* or when they *need validation*

IronScout’s loop exists to answer two questions repeatedly:
1. “Did anything worth knowing change since last time?”
2. “Is this price sane right now?”

---

## The v1 User Loop (Canonical)

```
┌──────────────┐
│  MARKET      │
│  CHANGES     │
└──────┬───────┘
       │
       ▼
┌────────────────────┐
│ DASHBOARD DEALS    │
│ (Market-first)     │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│ RELEVANCE LAYER    │
│ (Gun Locker)       │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│ USER ACTION        │
│ (Click / Check /   │
│ Save)              │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│ HIGH-INTENT MOMENT │
│ (Price Check)      │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│ UPDATED CONTEXT    │
│ (Return to Dash)   │
└────────────────────┘
```

The loop must work even if any single feature is missing.

---

## Role of Each Component

### 1. Dashboard Market Deals
**Primary re-entry point**

Purpose:
- Answer: “What changed since last time?”
- Surface *rare, notable* market events
- Justify opening the app today

Key properties:
- Market-driven, not user-driven
- Finite and quiet
- Valid even for anonymous users

Failure mode to avoid:
- Turning into an infinite feed or browsing surface

---

### 2. Gun Locker
**Relevance amplifier**

Purpose:
- Answer: “Which of these matters to me?”
- Increase signal density without increasing noise
- Create light personalization without obligation

Key properties:
- Optional and reversible
- Caliber-focused, not ownership-focused
- Influences ordering and labels only

Failure mode to avoid:
- Becoming a gate, registry, or inventory system

---

### 3. Mobile Price Check
**High-intent capture + confidence closure**

Purpose:
- Answer: “Is this price normal, high, or unusually low right now?”
- Serve users *already* in a buying moment
- Reduce hesitation and second-guessing

Key properties:
- Single-screen, fast
- Comparative, not prescriptive
- Works without prior setup

Failure mode to avoid:
- Acting like a recommendation engine

---

## Loop Entry Points (v1)

Users may enter the loop from multiple angles:

1. **Dashboard first**
   - “What’s notable today?”

2. **Price Check first**
   - “Is this price sane?”

3. **Search first**
   - “Find this ammo” → then context

All paths converge back to the Dashboard as the **state-of-the-market surface**.

---

## Why This Loop Creates Revisits

Users return because:

- The system *remembers context* (Gun Locker)
- The system *surfaces change* (Market Deals)
- The system *resolves doubt* (Price Check)
- Silence is treated as a valid outcome

IronScout earns attention by **not speaking unless it has something to say**.

---

## Anti-Patterns (Explicitly Disallowed)

- Habit-forming notifications without new information
- Endless scrolling feeds
- Mandatory setup flows
- Personalized deals without market justification
- “Check back later” mechanics

---

## v1 Success Signals (Loop Health)

- % of users who revisit within 7 days
- Repeat Price Check usage
- Dashboard sessions with meaningful interaction
- Gun Locker adoption *after* first value moment

---

## Design Invariant (Locked)

> IronScout does not try to make users buy more often.
> It tries to make users **more confident when they do**.

This loop must preserve that invariant at all times.

---

## Summary

The v1 IronScout loop is:

- Market-driven
- Context-aware
- Intent-respecting
- Quiet by default
- Valuable on demand

Gun Locker personalizes relevance.  
Dashboard Deals justify return.  
Price Check closes the decision.

Together, they form a defensible loop that AmmoSeek and WikiArms cannot replicate.

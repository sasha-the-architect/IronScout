# Alerts Policy v1

**Status:** Active
**Applies To:** Consumer app
**Related Docs:** [ADR-012](../decisions/ADR-012-dashboard-v3-action-oriented-deal-surface.md) (Dashboard v3), [UX Charter](../06_ux_charter.md)

---

## Purpose

Alerts exist to notify users of **rare, time-sensitive moments** that are clearly better to act on now than later.

Alerts are **interruptions**, not engagement tools.

If an alert cannot be defended as interruption-worthy, it must not be sent.

---

## Core Principles

- Silence is normal.
- Fewer alerts build more trust.
- Alerts should feel helpful, not promotional.
- The Dashboard is the primary surface for awareness.

---

## Canonical Roles

- **Dashboard:** Passive awareness. Users check when they want context.
- **Alerts:** Interruptions. Sent only when immediate action provides clear value.

Alerts must never replace the Dashboard or force urgency where none exists.

---

## Eligibility Scope (v1)

For v1, alerts are limited to **explicitly Saved Items only**.

- Saved Items → eligible for alerts
- Saved Searches → **not eligible** for alerts in v1

Saved Searches influence Dashboard visibility only.

This constraint is intentional and protects against alert fatigue.

---

## Alert Types (v1)

Only the following alert types are permitted:

### 1. Meaningful Price Drop

Send an alert when:
- The user has saved the item, and
- The price drops by a meaningful amount relative to recent history.

Threshold definition must be:
- Conservative
- Deterministic
- Documented in code

Minor fluctuations must not trigger alerts.

---

### 2. Back In Stock

Send an alert when:
- The user has saved an item, and
- The item transitions from out of stock to in stock.

This alert type is always interruption-worthy.

---

## Explicitly Disallowed Alerts

The system must never send alerts for:
- Minor price movement
- Typical day-to-day fluctuation
- “Good deal right now” without prior user intent
- Category-level trends
- Popularity or demand signals
- Marketing or promotional messaging

If an alert resembles advertising, it violates this policy.

---

## Cooldowns and Caps (Mandatory)

To prevent alert fatigue, the following limits apply:

### Per-Item Limits
- Price drop alerts: max **1 per 24 hours per item**
- Back-in-stock alerts: max **1 per 24 hours per item**

### Per-User Limits
- Max **1 alert per 6 hours**
- Max **3 alerts per day**

If multiple events occur simultaneously, priority is:
1. Back in stock
2. Meaningful price drop

Lower-priority alerts must be suppressed.

---

## Dashboard Redundancy Rule

If an alert is sent:
- The related change may appear on the Dashboard for context.
- The Dashboard must not escalate urgency or duplicate alert language.

The alert is the interruption.  
The Dashboard is the confirmation.

---

## Premium Availability (v1)

Premium is not offered in v1. Alert behavior is uniform for all users.

---

## Enforcement

- Product owns alert policy definition.
- Engineering must enforce caps and thresholds in code.
- Support and Ops should reference this document when handling alert-related issues.

Any deviation from this policy requires an ADR amendment.

---

## Future Expansion

Expansion beyond Saved Items (e.g., Saved Search alerts) requires:
- Proven signal accuracy
- Documented thresholds
- An explicit ADR amendment

Until then, this policy governs all alert behavior.

---

# Alerting and Notifications

This document defines how IronScout sends notifications to users in v1.

Alerts are a **runtime behavior** with direct trust and support impact.  
They are governed by policy, not feature experimentation.

---

## Purpose

Alerts exist to notify users of **rare, time-sensitive moments** where immediate action provides clear value.

Alerts are interruptions, not engagement tools.

If an alert cannot be defended as interruption-worthy, it must not be sent.

---

## Canonical Roles

- **Dashboard:** Passive awareness and context.
- **Alerts:** Interruptions for urgent, user-relevant events only.

Silence is expected. Alerts are rare by design.

---

## Alert Scope (v1)

In v1, alerts are limited to **explicitly Saved Items only**.

- Explicitly Saved Items → alert-eligible  
- Inferred or implicit intent → **never alert-eligible**

Inferred intent (e.g., search history or repeated queries):
- May influence Dashboard visibility
- Must never trigger alerts

This constraint is intentional and must not be bypassed by tier logic.

---

## Supported Alert Types (v1)

Only the following alert types are permitted:

### 1. Meaningful Price Drop

An alert may be sent when:
- The user has explicitly saved the item, and
- The price drops meaningfully relative to recent history.

Thresholds must be:
- Conservative
- Deterministic
- Auditable

Minor price fluctuations must not trigger alerts.

---

### 2. Back In Stock

An alert may be sent when:
- A saved item transitions from out of stock to in stock.

This alert type is always interruption-worthy.

---

## Explicitly Disallowed Alerts

The system must not send alerts for:
- Minor price movement
- Typical day-to-day fluctuation
- Inferred or implicit intent
- Category-level interest
- Popularity or demand signals
- “Good deal right now” without explicit save
- Marketing or promotional messaging

If an alert resembles advertising, it violates this policy.

---

## Tier Behavior

### Free Tier

- Alerts for explicitly saved items only
- Subject to strict global caps and cooldowns
- No user-defined conditions

### Premium Availability (v1)

Premium is not offered in v1. Alert cadence and delivery are uniform for all users.

---

## Cooldowns and Caps (Mandatory)

### Per-Item Limits
- Price drop alerts: max **1 per 24 hours per item**
- Back-in-stock alerts: max **1 per 24 hours per item**

### Per-User Limits
- Max **1 alert per 6 hours**
- Max **3 alerts per day**

If multiple alert-eligible events occur:
1. Back in stock
2. Meaningful price drop

Lower-priority alerts must be suppressed.

---

## Message Content Constraints

Alerts must be:
- Factual
- Short
- Non-urgent in tone
- Free of recommendations or explanations

Alerts must not:
- Explain system reasoning
- Mention AI or automation
- Predict future prices
- Use persuasive language

---

## Delivery Semantics

- Alerts are best-effort, not guaranteed
- Duplicate alerts must be deduplicated
- Delivery failures must not escalate urgency
- Retries must respect cooldowns

---

## Auditability and Support

All alerts must be traceable to:
- A saved item
- A specific triggering event
- A deterministic threshold

Support and operations must be able to answer:
> “Why did this alert fire?”

Without referencing AI or inferred intent.

---

## Relationship to Dashboard

If an alert is sent:
- The related change may appear on the Dashboard for context
- The Dashboard must not duplicate alert language or urgency

The alert is the interruption.  
The Dashboard is the confirmation.

---

## Explicit Non-Goals (v1)

In v1, alerts do not:
- Use inferred or implicit intent
- Support user-defined thresholds
- Provide AI explanations
- Predict outcomes
- Increase frequency based on tier or subscription

Any expansion requires an ADR amendment.

---

## Compliance

Alert behavior must comply with:
- `context/operations/alerts_policy_v1.md`
- Dashboard v3 ADR
- 06_ux_charter.md

Conflicts must be resolved via ADR.

---

## Summary

Alerts exist to protect user attention.

If in doubt, do not send the alert.
# Status: Advisory (v1 scope applies)
This document is non-authoritative. v1 scope and cut list govern what ships.
If this conflicts with `context/02_v1_scope_and_cut_list.md`, this doc is wrong.

# Glossary

This glossary defines terms as they are used within IronScout.

Definitions reflect **system behavior**, not marketing language.

---

## Search

The process of exploring current prices and availability across retailers.

Search supports discovery but does not recommend what to buy.

---

## Saved Item

A product explicitly marked by a user as something they care about.

Saved Items:
- Represent clear user intent
- Power dashboard surfacing
- Are eligible for alerts (per policy)

Saved Items are the primary repeat-engagement primitive.

---

## Saved Search

An internal representation of user intent derived from repeated or explicit search behavior.

Saved Searches:
- Influence Dashboard visibility
- Do not appear as primary UI objects
- Do not trigger alerts in v1
- Are not expected to be configured or managed by users

Saved Searches exist to support monitoring, not interaction.

---

## Dashboard

The primary action surface of IronScout.

The Dashboard answers one question:
> “Is there something worth buying right now?”

The absence of recommendations is an intentional and valid state.

---

## Hero Recommendation

A single, optional item surfaced on the Dashboard when a confident signal exists.

Hero recommendations:
- Are rare by design
- Never claim optimality
- Are omitted entirely when confidence is low

---

## Alert

A notification sent to a user to signal a rare, time-sensitive event.

Alerts:
- Are interruptions
- Apply only to explicitly saved items in v1
- Are subject to strict caps and cooldowns
- Must be defensible as actionably better now than later

Alerts do not replace the Dashboard.

---

## Minor Change

A detected price or availability movement that does not meet alert or hero thresholds.

Minor changes are informational only and remain dashboard-visible.

---

## Meaningful Change

A detected event that meets deterministic thresholds for:
- Dashboard hero eligibility, or
- Alert eligibility (per policy)

Meaningful does not imply “best” or “optimal.”

---

## Automation

Machine-assisted processes used to normalize data, group equivalent listings, and detect change.

Automation does not:
- Make purchase decisions
- Assign deal scores
- Predict outcomes
- Surface recommendations or explanations

---

## Ranking

A deterministic ordering of search results based on transparent factors such as price, availability, and filters.

Ranking does not imply value judgment or recommendation.

---

## Premium

Not offered in v1. All consumer capabilities are available to every user.

---

## Summary

Terms in this glossary are intentionally conservative.

When definitions and behavior diverge, behavior wins.

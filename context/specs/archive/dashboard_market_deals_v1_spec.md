# Dashboard Market Deals Enhancement Spec

## Purpose
Create a repeat-visit surface by highlighting **market-wide notable price events**, enhanced by Gun Locker but not dependent on it.

---

## Dashboard Hierarchy (Locked)
1. Hero (single most notable event, deterministic selection)
2. Your Recent Changes (Saved Items only)
3. Market Deals (new)

### Hero Selection Rule
1. Largest price drop % among qualifying deals
2. Tie-breaker: earliest detection timestamp
3. Tie-breaker: productId ASC (lexicographic)

"Confidence" is not used. Selection is deterministic and auditable.

---

## Market Deals Source
Market Deals originate from deterministic market-wide events, not user intent.

### Eligibility Criteria (any)
- ≥15% below trailing 30-day median
- Back in stock after ≥7 days unavailable
- Lowest observed price in 90 days

### Definitions
- **Median**: Computed from daily best prices per product (one price point per product per day)
- **Price point**: The lowest visible offer price for a product on a given calendar day (UTC)
- **Back in stock**: Product had zero visible offers for ≥7 consecutive days, now has ≥1

---

## Rendering Rules

### Without Gun Locker
- Section title: “Notable Deals Today”
- 3–5 items max

### With Gun Locker
- Section 1: “For Your Guns” (matching calibers first)
- Section 2: “Other Notable Deals”
- No suppression, ordering only

---

## Matching Logic
Deal matches Gun Locker if:
```
deal.caliber === gun.caliber
```

---

## Constraints
- No user-facing rankings or scores (internal selection logic is permitted)
- No urgency language
- No infinite feeds
- Silence is valid

### Empty State
If zero deals qualify, display: "No notable market changes today." with last-checked timestamp. Do not suggest alternative actions or content.

---

## Data Contract

```ts
MarketDeal {
  productId: string
  productName: string
  caliber: CaliberEnum   // must match Gun Locker canonical calibers
  pricePerRound: number
  retailerName: string
  contextLine: string
}
```

**Normalization requirement:** `MarketDeal.caliber` must use the same canonical enum and alias mapping as Gun Locker. Products with unmapped calibers are excluded from Market Deals.

---

## Success Signals
- Non-empty dashboard rate
- Deal CTR
- Return visits
# Status: Superseded
Superseded by ADR-020. Do not use for v1 behavior.

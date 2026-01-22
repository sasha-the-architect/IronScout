# Mobile Price Check v1 Spec

## Purpose
Support high-intent buyers by providing instant price sanity checks at the moment of decision.

Answers:
> “Is this price normal, high, or unusually low right now?”

---

## Entry Points
- Mobile route (/price-check)
- Header quick access
- Deep links

---

## Inputs
Required:
- Caliber
- Price per round

Optional:
- Brand
- Grain / load

---

## Output
Single screen:
- Classification:
  - Lower than usual
  - Typical range
  - Higher than usual
- Supporting context:
  - Recent online price range
  - Freshness indicator

No verdicts or recommendations.

---

## Constraints
- No BUY / WAIT / SKIP
- No guarantees

### Sparse Data Rule
Classification requires ≥5 price points for caliber in trailing 30 days.

- If <5 points: Display "Limited data. Recent range: $X.XX–$Y.YY/rd."
- If 0 points: Display "No recent data for [caliber]."

Do NOT show Lower/Typical/Higher classification when below threshold.

### Definitions
- **Price point**: One daily best price per product per caliber (lowest visible offer price on a given UTC calendar day)
- **Trailing 30 days**: Calendar days, not rolling hours
- **Freshness indicator**: "Based on prices from the last N days" where N = count of days with data in the 30-day window

---

## Intent Signal (Internal Only)

```ts
PriceCheckEvent {
  caliber: CaliberEnum
  enteredPrice: number
  classification: 'LOWER' | 'TYPICAL' | 'HIGHER' | 'INSUFFICIENT_DATA'
  hasGunLocker: boolean
  clickedOffer: boolean
  timestamp: Date
}
```

### Privacy Rules (Enforced)
- **No individual-level persistence**: Raw `enteredPrice` values must not be stored in user-linked records
- **Aggregation only**: Events are aggregated to caliber-level statistics before long-term storage
- **Retention**: Raw event logs retained ≤7 days for debugging, then purged or aggregated
- **No user linking**: Events must not be joinable to user identity after aggregation

---

## Integration
- Optional prompt to add Gun Locker after result
- Optional save item flow
- No direct deal injection

---

## Success Signals
- Repeat price checks
- Conversion to deal views

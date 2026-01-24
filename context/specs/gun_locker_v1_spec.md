# Gun Locker v1 Spec

## Purpose
Provide durable personal context (caliber relevance) to personalize deals and dashboards without creating a registry, inventory system, or purchase planner.

Gun Locker answers:
> “What ammo is relevant to me?”

---

## In Scope (v1)
- Optional, account-based feature
- Users can add guns they shoot
- Caliber is required (constrained to canonical values)
- Nickname is optional
- Used only for personalization and ordering

## Out of Scope (v1)
- Serial numbers
- Purchase dates or locations
- Proof of ownership
- Inventory counts
- Recommendations

---

## Data Model

```ts
Gun {
  id: string
  userId: string
  caliber: CaliberEnum   // constrained to canonical values
  nickname?: string
  createdAt: Date
}
```

Multiple guns may share a caliber.

### Canonical Calibers (v1)

```
9mm, .38 Special, .357 Magnum, .25 ACP, .32 ACP, 10mm Auto, .45 ACP, .45 Colt,
.40 S&W, .380 ACP, .22 LR, .22 WMR, .17 HMR, .223/5.56, .308/7.62x51,
.30-06, .300 AAC Blackout, 6.5 Creedmoor, 7.62x39, .243 Winchester,
.270 Winchester, .30-30 Winchester, 12ga, 20ga, 16ga, .410 Bore, Other
```

**Alias mapping required:**
- "9x19mm", "9mm Luger", "9mm Parabellum" → 9mm
- "5.56 NATO", "5.56x45mm" → .223/5.56
- "7.62x51mm", "7.62 NATO" → .308/7.62x51
- ".22 Magnum"  .22 WMR
- ".45 Long Colt"  .45 Colt
- ".30-30"  .30-30 Winchester
- "Other", "Unknown"  Other

**UI must use dropdown selection, not free text input.**

**Validation rule:** API must reject caliber values not in the canonical enum. Unknown or unmapped calibers are not accepted.

---

## UX & Trust Guardrails
- Fully optional and skippable
- Caliber-only mode required
- One-click deletion, immediate effect
- No blocking flows

### Allowed Language
- “Add the guns you shoot”
- “Tell us what calibers you use”

### Disallowed Language
- “Register firearms”
- “Gun inventory”
- “Track weapons”

---

## Integration Rules
- Gun Locker never creates deals
- Gun Locker never suppresses deals
- Gun Locker only affects ordering and labeling

---

## Success Signals
- Adoption after first value moment
- Improved deal relevance

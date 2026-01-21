# IronScout Lens Specification

## Status
Accepted — v1.0.3

## Purpose

A **Lens** defines how IronScout interprets buyer intent and deterministically shapes search results.
Lenses encode **policy**, not intelligence.

A Lens:
- Does not recommend
- Does not judge quality
- Does not optimize for engagement
- Does not learn implicitly

A Lens exists to make search **predictable, explainable, and aligned with buyer intent**.

---

## Definition

A **Lens** is a deterministic, versioned policy object that controls:

1. **Eligibility** — which products or offers are allowed
2. **Ordering** — how allowed results are sorted
3. **Presentation metadata** — how the view is labeled and explained

A Lens operates **after candidate recall** and **before response shaping**.

---

## Non-Goals

A Lens must not:
- Use embeddings for ranking
- Use behavioral or conversion data
- Make recommendations
- Assign scores or confidence levels
- Override explicit user choices

---

## Lens Lifecycle

1. User submits query
2. Intent extractor produces signals (version-pinned model, temperature=0)
3. Lens selection is resolved by deterministic policy
4. Lens eligibility rules are applied
5. Lens ordering rules are applied
6. Lens metadata is returned in the response

If a user explicitly selects a Lens, auto-selection is disabled for that execution.

---

## Intent Extraction

Intent extraction must be deterministic given the same query.

Requirements:
- Model version pinned in configuration
- Temperature = 0
- Model ID logged with every search response
- Output schema validated before lens selection

Intent signals are the **only** input to lens trigger evaluation.

### Intent Extraction Failure

If intent extraction times out, returns malformed output, or schema validation fails:

- Proceed with empty signals (`{}`)
- Lens selection resolves to ALL
- `reasonCode` = `NO_MATCH`
- `extractorModelId` still logged as configured value
- Do not return 500 unless the entire search endpoint cannot execute

---

## Field Scope and Aggregation

Search results are **product-grouped**. Each canonical product appears at most once.

Lens eligibility and ordering are evaluated against an **Aggregated Product View** computed from visible offers. Offer lists are returned separately for comparison.

### Product-Level Fields (canonical, no aggregation)

These fields come directly from the canonical Product:
- `bulletType`
- `grain`
- `casing`
- `packSize`
- `canonicalConfidence`

### Offer-Level Fields (aggregated across visible offers)

**Visible offers** are those that pass:
- Retailer visibility predicate (eligible + listed + active)
- Price event visibility (ADR-015: not ignored, corrections applied)
- Within `CURRENT_PRICE_LOOKBACK_DAYS`

**Aggregation rules:**

| Field | Aggregation |
|-------|-------------|
| `price` | `min(offer.price)` across visible offers |
| `availability` | `max(offer.availabilityRank)` where IN_STOCK > LOW_STOCK > OUT_OF_STOCK |

**availabilityRank mapping:**

| Availability | Rank |
|--------------|------|
| OUT_OF_STOCK | 1 |
| LOW_STOCK | 2 |
| IN_STOCK | 3 |

### Derived Fields

- `pricePerRound` — derived from aggregated `price` and canonical `packSize`

### Edge Cases

**No visible offers:**
- `price` = null
- `availability` = OUT_OF_STOCK
- Product sorts last by price

**Unknown packSize:**
- If `packSize` is null or inconsistent → `pricePerRound` = null

---

## Lens Selection Rules

### Inputs
- Parsed intent signals (e.g. `usage_hint`, `quantity_hint`)
- Confidence values from intent extractor
- Explicit user override (lens ID)

### Selection Logic

```
1. If user.selectedLensId provided:
   - If valid   → use it
   - If invalid → reject with 400 (INVALID_LENS)

2. Else evaluate trigger rules:
   - 0 matches  → ALL, autoApplied=false
   - 1 match    → matched lens, autoApplied=true
   - 2+ matches → ALL, autoApplied=false, ambiguous=true
```

### Invalid Lens ID

```
status: 400 Bad Request
body: {
  "error": "INVALID_LENS",
  "message": "Unknown lens ID: <id>",
  "validLenses": ["ALL", "RANGE", "DEFENSIVE", "MATCH"]
}
```

No fallback. No silent ignore. Reject.

---

## Canonical Lens Interface

```typescript
interface Lens {
  id: string
  label: string
  description: string

  triggers: LensTriggerRule[]
  eligibility: EligibilityRule[]
  ordering: OrderingRule[]

  version: string
}
```

---

## Trigger Rules

Trigger rules define when a Lens may be auto-applied.

```typescript
interface LensTriggerRule {
  signal: string
  value: string
  minConfidence?: number  // default: 0.0
}
```

### Trigger Match Semantics

A Lens matches if **ANY** trigger rule matches (OR logic).

```typescript
lensMatches = lens.triggers.some(rule => evaluateTrigger(rule, signals))
```

If a trigger rule references a signal not present in the extractor output, the rule does not match.

### Trigger Evaluation Semantics (Deterministic)

A trigger rule matches if and only if:
- `signals[rule.signal]` exists
- `signals[rule.signal].value === rule.value` (exact, case-sensitive string match)
- `signals[rule.signal].confidence >= rule.minConfidence` (inclusive threshold)

If `signals[rule.signal]` is missing, the rule does not match.

Example:

```json
{
  "signal": "usage_hint",
  "value": "RANGE",
  "minConfidence": 0.8
}
```

Trigger rules may reference only:
- Parsed intent signals

Trigger rules must not reference:
- Raw query tokens (not supported in v1)
- Embedding similarity
- User behavior
- Historical performance

---

## Eligibility Rules

Eligibility rules define **hard constraints**.
They are binary and non-scoring.

```typescript
interface EligibilityRule {
  field: string
  operator: EligibilityOperator
  value: any
}

type EligibilityOperator =
  | "EQ"          // field === value
  | "NOT_EQ"      // field !== value
  | "IN"          // value.includes(field)
  | "NOT_IN"      // !value.includes(field)
  | "GTE"         // field >= value
  | "LTE"         // field <= value
  | "IS_NULL"     // field === null
  | "IS_NOT_NULL" // field !== null
```

### IN / NOT_IN Operator Semantics

The `value` field **MUST** be an array for `IN` and `NOT_IN` operators, even when matching a single value.

```typescript
// Correct
{ field: "bulletType", operator: "IN", value: ["FMJ"] }
{ field: "bulletType", operator: "IN", value: ["FMJ", "TMJ"] }
{ field: "casing", operator: "NOT_IN", value: ["STEEL"] }

// Incorrect - will fail validation
{ field: "bulletType", operator: "IN", value: "FMJ" }
```

### Null Behavior

For comparison operators (`EQ`, `NOT_EQ`, `IN`, `NOT_IN`, `GTE`, `LTE`):
- If field is null → rule evaluates to **FALSE** (product excluded)

For `IN` and `NOT_IN` specifically:
- If field is null → evaluates to **FALSE**
- To match or exclude nulls explicitly, use `IS_NULL` or `IS_NOT_NULL`

### Type Coercion

No implicit coercion. Types must match exactly.
- If `typeof(field) !== expectedType` → rule evaluates to **FALSE** (product excluded)

Examples:
- `bulletType IN ["FMJ"]` — bulletType must be string
- `canonicalConfidence GTE 0.7` — canonicalConfidence must be number
- `grain GTE 124` with field value `"124gr"` → FALSE (string vs number)

Failure of any eligibility rule excludes the result.

### String Comparison Semantics

All string comparisons in eligibility rules are case-sensitive.
Product field normalization (e.g., uppercasing bulletType) MUST occur before lens evaluation.
Lens evaluation performs no string normalization.

---

## Ordering Rules

Ordering rules define deterministic sorting.

```typescript
interface OrderingRule {
  field: string
  direction: "ASC" | "DESC"
}
```

Embedding scores are forbidden in ordering rules.

### Null Ordering

Nulls sort **LAST** regardless of direction:

| Field | Null treated as | Effect |
|-------|-----------------|--------|
| price | Infinity | Last in ASC |
| pricePerRound | Infinity | Last in ASC |
| availability | OUT_OF_STOCK | Last in DESC |
| canonicalConfidence | 0.0 | Last in DESC |

### Final Tie-Breaker

After all ordering rules are applied, if two products have identical values, the final tie-breaker is:

```typescript
{ field: "productId", direction: "ASC" }
```

This guarantees deterministic ordering across all runs.

---

## Field Definitions

### price

```typescript
price: number | null
  currency: USD
  precision: 2 decimal places
  definition: lowest visible current offer price across eligible retailers
              within CURRENT_PRICE_LOOKBACK_DAYS
  null: no visible current offers
```

### packSize

```typescript
packSize: integer | null
  definition: normalized rounds per unit (e.g., 50, 200, 1000)
  null: unknown
```

### pricePerRound

```typescript
pricePerRound: number | null
  currency: USD
  precision: 4 decimal places
  derivation:
    if price is null → null
    else if packSize is null or packSize <= 0 → null
    else → round_half_up(price / packSize, 4)
  null behavior: treated as Infinity (sorts last in ASC)
```

### canonicalConfidence

```typescript
canonicalConfidence: number | null
  range: 0.0 to 1.0
  source: ProductResolver.matchScore
  precision: 2 decimal places (floored)
  null behavior: treated as 0.0
```

### availability

```typescript
type Availability = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK"

// Sort order (DESC)
IN_STOCK > LOW_STOCK > OUT_OF_STOCK

// Null behavior
null → OUT_OF_STOCK
```

### productId

```typescript
productId: string
  format: UUID v4
  level: product
  null: never (required field)
```

### Expected Field Types

| Field | Type | Level |
|-------|------|-------|
| productId | string (UUID) | product |
| canonicalConfidence | number | product |
| bulletType | string | product |
| grain | number | product |
| casing | string | product |
| packSize | integer | product |
| price | number | aggregated |
| pricePerRound | number | derived |
| availability | Availability | aggregated |

---

## Required Lenses (Ammo v1)

### ALL (Default)
Eligibility: none
Ordering:
1. availability DESC
2. pricePerRound ASC
3. canonicalConfidence DESC
4. productId ASC (tie-breaker)

---

### RANGE
Eligibility:
- bulletType IN ["FMJ"]

Ordering:
1. pricePerRound ASC
2. availability DESC
3. canonicalConfidence DESC
4. productId ASC (tie-breaker)

---

### DEFENSIVE
Eligibility:
- bulletType IN ["HP"]

Ordering:
1. availability DESC
2. canonicalConfidence DESC
3. pricePerRound ASC
4. productId ASC (tie-breaker)

---

### MATCH
Eligibility:
- bulletType IN ["OTM", "MATCH"]

Ordering:
1. canonicalConfidence DESC
2. availability DESC
3. pricePerRound ASC
4. productId ASC (tie-breaker)

---

## Empty Result Handling

When eligibility rules filter all candidates:

```typescript
// Return empty set, never fallback to ALL
{
  "results": [],
  "lens": {
    "id": "DEFENSIVE",
    "label": "Defensive",
    "autoApplied": true,
    "zeroResults": true,
    "reasonCode": "ZERO_RESULTS",
    "reason": "No products matched eligibility rules",
    "version": "1.0"
  }
}
```

Do NOT silently fallback to ALL. Empty results are policy-correct.

---

## Lens Metadata (Response Contract)

Each search response must include:

```typescript
interface LensMetadata {
  id: string
  label: string
  autoApplied: boolean
  ambiguous?: boolean       // true when 2+ triggers matched
  candidates?: string[]     // lens IDs that matched, if ambiguous (sorted)
  zeroResults?: boolean     // true when eligibility filtered all
  reasonCode: ReasonCode    // required, machine-parseable
  reason?: string           // optional, human-readable only
  canOverride: boolean
  version: string
  extractorModelId: string  // intent extractor model version
}

type ReasonCode =
  | "TRIGGER_MATCH"   // exactly one lens trigger matched
  | "USER_OVERRIDE"   // user explicitly selected lens
  | "NO_MATCH"        // no lens triggers matched, defaulted to ALL
  | "AMBIGUOUS"       // multiple lens triggers matched
  | "ZERO_RESULTS"    // eligibility filtered all candidates
```

### Reason Field Contract

- `reasonCode` is **required** and **machine-parseable**. Clients must use `reasonCode` for all logic.
- `reason` is **optional** and **informational only**. Clients must not parse or rely upon `reason`.

### canOverride

`canOverride` is always `true` in v1. Reserved for future use (e.g., admin-forced lens for compliance).

### Ambiguous Lens Candidates Ordering

When `ambiguous = true`, the `candidates` array MUST contain all matching lens IDs sorted in **lexicographic ascending order**.

This ordering has no semantic meaning and exists solely to guarantee deterministic responses.

Clients must not infer preference or priority from `candidates` ordering.

### Example: Single match (auto-applied)

```json
{
  "lens": {
    "id": "RANGE",
    "label": "Range / Training",
    "autoApplied": true,
    "reasonCode": "TRIGGER_MATCH",
    "reason": "Detected range usage in query",
    "canOverride": true,
    "version": "1.0",
    "extractorModelId": "intent-v2.1.0"
  }
}
```

### Example: Ambiguous (multiple matches)

```json
{
  "lens": {
    "id": "ALL",
    "label": "All Results",
    "autoApplied": false,
    "ambiguous": true,
    "candidates": ["DEFENSIVE", "RANGE"],
    "reasonCode": "AMBIGUOUS",
    "reason": "Multiple lens triggers matched",
    "canOverride": true,
    "version": "1.0",
    "extractorModelId": "intent-v2.1.0"
  }
}
```

### Example: User override

```json
{
  "lens": {
    "id": "DEFENSIVE",
    "label": "Defensive",
    "autoApplied": false,
    "reasonCode": "USER_OVERRIDE",
    "reason": "User selected DEFENSIVE lens",
    "canOverride": true,
    "version": "1.0",
    "extractorModelId": "intent-v2.1.0"
  }
}
```

---

## Governance

- Lens definitions are versioned
- Changes require PR review
- Tests are required for:
  - trigger behavior (ANY match semantics)
  - eligibility enforcement
  - ordering stability (including tie-breaker)
  - null handling
  - type coercion
  - ambiguous selection
  - candidates ordering

Lens definitions must reference only fields in "Expected Field Types". Unknown fields fail deploy-time validation.

Lens changes are treated as product policy changes.

No semantic changes to this specification without an ADR.

---

## Metrics (Required)

The system must log:
- lensApplied (lens ID)
- lensAutoApplied (boolean)
- lensOverridden (boolean)
- lensAmbiguous (boolean)
- triggerMatchCount (number)
- eligibilityExclusionCount (number)
- zeroResults (boolean)
- extractorModelId (string)
- reasonCode (ReasonCode)
- intentSignals (object) — full signal output from extractor, for audit replay
- priceLookbackDays (number) — CURRENT_PRICE_LOOKBACK_DAYS config value used

High override rates indicate misclassification and require review.
High ambiguous rates indicate overlapping trigger definitions.

---

## Invariants

1. Lenses are deterministic given intent signals
2. Intent extraction is deterministic (pinned model, temp=0)
3. Eligibility is binary
4. Ordering derives from declared ordering rules only
5. Embeddings never rank
6. User overrides always win
7. Invalid lens IDs are rejected, not ignored
8. Empty results are returned, not masked
9. Ambiguous matches default to ALL with transparency
10. Nulls sort last
11. Trigger matching uses ANY (OR) logic
12. Final tie-breaker is productId ASC
13. IN/NOT_IN values are always arrays
14. candidates[] is lexicographically sorted
15. Results are product-grouped with best-offer aggregation

---

## Final Statement

A Lens defines relevance by policy, not probability.
Breaking this contract breaks trust.

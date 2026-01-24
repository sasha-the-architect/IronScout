# IronScout Lens Specification

## Status
Accepted — v1.1.0

---

## Amendment: v1.1 Design Philosophy (2026-01-24)

### Background

Initial lens implementations used eligibility rules for hard filtering (e.g., DEFENSIVE required `bulletType IN ["HP"]`). In practice, this caused ZERO_RESULTS for most searches because:
1. Product metadata (especially `bulletType`) is often unpopulated
2. Hard filtering on incomplete data hides relevant products from users
3. Users searching for "9mm defense" expect to see results, not empty sets

### Design Philosophy Change

**v1.1 shifts lenses from filtering-focused to ordering-focused.**

Key principles:
1. **Lenses optimize sort order, not filter sets** — Different use cases prioritize different factors (price vs. availability vs. confidence)
2. **Eligibility is optional and sparingly used** — Hard filtering should only be used when exclusion is truly policy-correct
3. **Best-effort approach** — Missing metadata should demote products in ordering, not hide them entirely
4. **Products with null fields sort LAST, not excluded** — This is the existing ordering behavior, now the primary mechanism

### Impact on Lens Definitions

- `eligibility` in the `Lens` interface is now optional (`eligibility?: EligibilityRule[]`)
- RANGE, DEFENSIVE, and MATCH lenses no longer define eligibility rules
- Ordering alone differentiates lens behavior (price-first, availability-first, confidence-first)
- When `bulletType` is unavailable, it can be extracted from product names as a fallback

### When to Use Eligibility

Eligibility filtering remains appropriate for:
- Compliance requirements (must exclude certain products)
- Hard business rules (not "optimization preferences")
- Cases where showing a result would be misleading

Do NOT use eligibility for:
- "Soft" preferences (use ordering instead)
- Boosting certain products (use ordering instead)
- Hiding products with incomplete metadata

### Backward Compatibility

- API response shape unchanged
- `zeroResults` flag still supported (now rare)
- Empty results still returned rather than masked when they occur
- Telemetry unchanged

---

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

1. **Ordering** — how results are sorted (primary mechanism)
2. **Eligibility** — which products are allowed (optional, used sparingly)
3. **Presentation metadata** — how the view is labeled and explained

A Lens operates **after candidate recall** and **before response shaping**.

> **v1.1 Note**: Lenses are ordering-focused. See Amendment above.

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
  eligibility?: EligibilityRule[]  // Optional in v1.1 (see Amendment)
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

> **v1.1 Note**: Eligibility is optional. Standard lenses (RANGE, DEFENSIVE, MATCH)
> no longer define eligibility rules. See Amendment above.

Eligibility rules define **hard constraints** when used.
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

> **v1.1 Note**: Eligibility rules removed from RANGE, DEFENSIVE, and MATCH.
> Lenses now differentiate purely by ordering. See Amendment above.

### ALL (Default)
Eligibility: none
Ordering:
1. availability DESC
2. pricePerRound ASC
3. canonicalConfidence DESC
4. productId ASC (tie-breaker)

---

### RANGE
Eligibility: none (v1.1)
Ordering: (price-first for value-conscious buyers)
1. pricePerRound ASC
2. availability DESC
3. canonicalConfidence DESC
4. productId ASC (tie-breaker)

---

### DEFENSIVE
Eligibility: none (v1.1)
Ordering: (availability-first for reliability-conscious buyers)
1. availability DESC
2. canonicalConfidence DESC
3. pricePerRound ASC
4. productId ASC (tie-breaker)

---

### MATCH
Eligibility: none (v1.1)
Ordering: (confidence-first for quality-conscious buyers)
1. canonicalConfidence DESC
2. availability DESC
3. pricePerRound ASC
4. productId ASC (tie-breaker)

---

## Empty Result Handling

> **v1.1 Note**: With eligibility rules removed from standard lenses, zero results
> due to eligibility filtering should be rare. This section remains for lenses
> that do define eligibility rules.

When eligibility rules filter all candidates:

```typescript
// Return empty set, never fallback to ALL
{
  "results": [],
  "lens": {
    "id": "CUSTOM_LENS",
    "label": "Custom Lens",
    "autoApplied": true,
    "zeroResults": true,
    "reasonCode": "ZERO_RESULTS",
    "reason": "No products matched eligibility rules",
    "version": "1.0"
  }
}
```

Do NOT silently fallback to ALL. Empty results are policy-correct when they occur.

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
3. Eligibility is binary (when defined)
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
16. Eligibility is optional; ordering is the primary differentiation mechanism (v1.1)

---

## Appendix A: Lens Evaluation Telemetry Contract (v1)

### A.1 Purpose

To support determinism audits, lens tuning, roadmap decisions, and marketing analytics, the system MUST emit a structured, versioned log event for each lens evaluation. This telemetry is internal-only and MUST NOT alter consumer-facing behavior.

### A.2 Non-goals

- No new user-visible fields or UI changes.
- No recommendations, verdicts, deal scores, or predictions.
- No requirement for a dedicated telemetry vendor in v1. Structured server logs are sufficient.

### A.3 Canonical Event

Each search evaluation MUST emit exactly one canonical event:

- `eventName`: `lens_eval.v1`
- `schemaVersion`: `1`
- Emitted server-side by the API after lens evaluation completes (success or failure).

### A.4 Required Correlation Fields

The event MUST include:

- `timestamp` (ISO-8601 UTC)
- `requestId` (unique per request)
- `traceId` (if available, else omit)
- `actor.userIdHash` or `actor.sessionId` (raw userId SHOULD NOT be logged)

### A.5 Query Fields (PII-safe)

The event MUST include:

- `query.hash` (sha256 of normalized query)
- `query.length`
- `query.piiFlag` (boolean heuristic)

The event MAY include:

- `query.norm` (normalized query string)

If stored, it MUST be redacted for obvious PII patterns (emails, phone numbers). If in doubt, omit and rely on `query.hash`.

### A.6 Intent Extraction Fields

The event MUST include:

- `intent.extractorModelId`
- `intent.extractorVersion` (or embed into modelId)
- `intent.extractorTemp` (explicitly log even if 0)
- `intent.status`: `OK` | `PARTIAL` | `FAILED`
- `intent.signals[]`: `{ key, value, confidence }` for all extracted signals used downstream
- `intent.failureReason` when status ≠ OK

Rationale: intent signals influence lens selection and must be auditable.

### A.7 Lens Selection Fields

The event MUST include:

- `lens.overrideId` (nullable)
- `lens.selectedId`
- `lens.version`
- `lens.reasonCode`
- `lens.candidates[]` sorted deterministically: `{ lensId, version, triggerScore }`

The event MUST include a deterministic representation of trigger evaluation, either:

- `lens.triggerMatches[]`: `{ triggerId, signalKey, expected, actual, passed }`, OR
- a checksum of trigger evaluation inputs and rules.

### A.8 Configuration Fields That Affect Visibility/Ordering

The event MUST include:

- `config.priceLookbackDays` (CURRENT_PRICE_LOOKBACK_DAYS)
- `config.asOfTime` (timestamp used as the reference point for offer visibility)

The event SHOULD include:

- `config.eligibilityConfigVersion` (or checksum)
- `config.orderingConfigVersion` (or checksum)

Rationale: these values change behavior and must be logged to prevent "version drift" ambiguity.

### A.9 Eligibility Summary (Counts + Reasons)

The event MUST include:

- `eligibility.candidates` (pre-filter count)
- `eligibility.eligible` (post-filter count)
- `eligibility.filteredByReason` (reasonCode → count)
- `eligibility.zeroResults` (boolean)
- `eligibility.zeroResultsReasonCode` when zeroResults = true

The event MUST NOT log all filtered productIds (volume risk). Use counts.

### A.10 Ordering Proof (Top-N Trace)

To debug nondeterminism and tune ordering, the event MUST include an ordering trace for the top N results:

- `results.returned`
- `results.top[]` for N=20: `{ productId, sortKeys }`

`sortKeys` MUST include all ordering fields used by the lens plus the tie-break field.

The event SHOULD include:

- `results.finalProductIdsTopN` (ordered list of productIds for the same top N)

### A.11 Offer Aggregation Summary (Top-N Only)

For the same top N results, the event SHOULD include:

- `visibleOfferCount`
- `aggregatedPrice` (min visible offer price)
- `availabilityRank` (max availabilityRank)
- `pricePerRound` (derived)
- `priceMeta`: `{ windowDays, sampleCount, asOf }`

The event MUST NOT log retailer URLs.

### A.12 Performance Fields

The event MUST include:

- `perf.latencyMsTotal`
- `perf.latencyMsIntent`
- `perf.latencyMsOffers`
- `perf.latencyMsRank`
- `status`: `OK` | `DEGRADED` | `FAILED`

### A.13 Determinism Requirements for Logged Data

- `lens.candidates[]` MUST be logged in deterministic order (lexicographic or score-first then lexicographic).
- `results.top[]` MUST match the returned ordering.
- All numeric fields MUST be logged with fixed precision where relevant (e.g., pricePerRound to 4 decimals).

### A.14 Retention and Access

- Telemetry is internal-only.
- Retention SHOULD be 30–90 days in v1.
- Access MUST be restricted to engineering and authorized operators.

### A.15 Prohibitions (Policy Alignment)

Telemetry MUST NOT include:

- purchase recommendations or verdicts
- deal scores
- predictions
- internal ranking hints intended to be stripped from consumer output unless explicitly marked `_internal` and confined to logs

### A.16 Minimal JSON Shape (Reference)

```json
{
  "eventName": "lens_eval.v1",
  "schemaVersion": 1,
  "lensSpecVersion": "1.0.3",
  "timestamp": "2026-01-21T15:04:05Z",
  "requestId": "...",
  "actor": { "userIdHash": "..." },
  "query": { "hash": "...", "length": 12, "piiFlag": false },
  "intent": {
    "extractorModelId": "...",
    "extractorTemp": 0,
    "status": "OK",
    "signals": [{ "key": "caliber", "value": "9mm", "confidence": 0.92 }]
  },
  "lens": {
    "overrideId": null,
    "selectedId": "ALL",
    "version": "1.0.3",
    "reasonCode": "NO_MATCH",
    "candidates": [{ "lensId": "ALL", "version": "1.0.3", "triggerScore": 0.0 }]
  },
  "config": { "priceLookbackDays": 7, "asOfTime": "2026-01-21T15:04:05Z" },
  "eligibility": {
    "candidates": 812,
    "eligible": 126,
    "filteredByReason": { "NO_VISIBLE_OFFERS": 686 },
    "zeroResults": false
  },
  "results": {
    "returned": 50,
    "top": [{ "productId": "p1", "sortKeys": { "price": 12.34, "ppr": 0.2500, "avail": 2, "conf": 0.88, "tie": "p1" } }]
  },
  "perf": { "latencyMsTotal": 183, "latencyMsIntent": 12, "latencyMsOffers": 90, "latencyMsRank": 24 },
  "status": "OK"
}
```

---

## Final Statement

A Lens defines relevance by policy, not probability.
Breaking this contract breaks trust.

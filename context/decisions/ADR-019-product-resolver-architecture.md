# ADR-019: Product Resolver Architecture

## Status
Accepted

## Context

IronScout ingests product data from multiple sources (retailers, affiliate feeds, scrapers). Each source provides raw product data that must be matched to a canonical product for price comparison and tracking.

The Product Resolver is responsible for:
1. Determining if a source product matches an existing canonical product
2. Creating new canonical products when no match exists
3. Handling ambiguous cases that require human review
4. Maintaining an audit trail of all matching decisions

Key challenges:
- **Identity fragmentation**: Same product appears with different titles, UPCs, and attributes across sources
- **Trust variance**: Some sources provide reliable UPCs; others have incorrect or missing identifiers
- **Scale**: Thousands of source products need automated resolution
- **Auditability**: Matching decisions must be explainable and reversible

## Decision

### 1. Resolver Authority

The Product Resolver is the **sole authority** for automated canonical product creation and matching.

- Only the resolver may create `products` records during ingestion
- Only the resolver may set `product_links.productId` automatically
- Manual intervention is restricted to items flagged for review (see Section 6)

### 2. Matching Strategy Pipeline

The resolver uses a multi-stage matching strategy:

```
Stage 1: UPC Lookup (exact match)
    ↓ no match or UPC untrusted
Stage 2: Fingerprint Scoring (weighted attributes)
    ↓ below confidence threshold
Stage 3: NEEDS_REVIEW (human intervention)
```

**Stage 1: UPC Lookup**
- If source provides a trusted UPC, attempt exact match against `products.upcNorm`
- UPC trust is source-specific (some retailers have reliable UPC data; others don't)
- Match confidence: 1.0 for trusted UPC matches

**Stage 2: Fingerprint Scoring**
- Compute weighted similarity across normalized attributes:
  - Title similarity (TF-IDF cosine similarity)
  - Brand match (exact normalized comparison)
  - Caliber match (exact normalized comparison)
  - Grain weight match (exact comparison)
  - Round count match (exact comparison)
- Uses pluggable `ScoringStrategy` interface (see Section 3)
- Match confidence: computed score (0.0 - 1.0)

**Stage 3: NEEDS_REVIEW**
- Items that cannot be confidently matched are flagged for human review
- Reason codes capture why auto-matching failed:
  - `INSUFFICIENT_DATA`: Missing required attributes
  - `AMBIGUOUS_FINGERPRINT`: Multiple candidates with similar scores
  - `UPC_NOT_TRUSTED`: UPC provided but source is untrusted
  - `CONFLICTING_IDENTIFIERS`: Attributes contradict each other

### 3. Scoring Interface

The scoring subsystem uses a pluggable strategy pattern:

```typescript
interface ScoringStrategy {
  readonly version: string;
  score(input: ScoringInput, candidate: ScoringCandidate): ScoringResult;
}

interface ScoringResult {
  score: number;           // 0.0 - 1.0
  matchType: MatchType;    // 'UPC' | 'FINGERPRINT' | 'NONE'
  breakdown: ScoreBreakdown;
  resolverVersion: string;
}
```

**Current Implementation**: `weighted-exact` (v1.1.0)
- TF-IDF cosine similarity for title matching
- Exact match bonuses for brand, caliber, grain, round count
- Configurable weights via `WeightedExactConfig`

The `resolverVersion` is recorded on every `product_links` record for:
- Debugging match decisions
- Re-processing with updated algorithms
- A/B testing new strategies

### 4. Status State Machine

`product_links.status` follows this state machine:

```
                    ┌─────────────┐
                    │   (start)   │
                    └──────┬──────┘
                           │ resolver runs
                           ▼
              ┌────────────────────────┐
              │      NEEDS_REVIEW      │◄────┐
              │      (or UNMATCHED)    │     │ re-process
              └───────────┬────────────┘     │
                          │                  │
         ┌────────────────┼────────────────┐ │
         │                │                │ │
    ▼    ▼                ▼                ▼ │
┌────────────┐    ┌────────────┐    ┌──────────┐
│  MATCHED   │    │  CREATED   │    │  SKIPPED │
│ (terminal) │    │ (terminal) │    │(terminal)│
└────────────┘    └────────────┘    └──────────┘
         │                │
         └───────┬────────┘
                 │ error during resolution
                 ▼
           ┌──────────┐
           │  ERROR   │
           │(terminal)│
           └──────────┘
```

**Terminal States**:
- `MATCHED`: Linked to existing product (auto or manual)
- `CREATED`: New product created and linked (auto or manual)
- `SKIPPED`: Manually marked as not actionable
- `ERROR`: Resolver encountered an error

**Active States**:
- `NEEDS_REVIEW`: Awaiting human review (primary)
- `UNMATCHED`: Legacy status, treated same as NEEDS_REVIEW

### 5. Evidence Model

Every `product_links` record maintains an `evidence` JSON field with an append-only structure:

```json
{
  "resolver": {
    "version": "weighted-exact:1.1.0",
    "timestamp": "2026-01-09T10:00:00Z",
    "candidates": [
      { "productId": "...", "score": 0.87, "breakdown": {...} },
      { "productId": "...", "score": 0.65, "breakdown": {...} }
    ],
    "bestScore": 0.87,
    "decision": "NEEDS_REVIEW",
    "reasonCode": "AMBIGUOUS_FINGERPRINT"
  },
  "manual": {
    "actor": "admin@example.com",
    "timestamp": "2026-01-09T14:30:00Z",
    "action": "LINK_TO_EXISTING",
    "productId": "...",
    "previousStatus": "NEEDS_REVIEW"
  }
}
```

**Rules**:
- Resolver evidence is written on each auto-resolution attempt
- Manual evidence is **appended** when admin takes action (never overwrites resolver block)
- Evidence blocks are keyed by type (`resolver`, `manual`, `skipped`)
- All blocks include timestamp for chronological reconstruction

### 6. Admin Review Exception

The Admin Review Queue provides **authorized manual intervention** for items the resolver cannot confidently match.

**Scope**:
- Only items with status `NEEDS_REVIEW` or `UNMATCHED` are actionable
- Admin can: link to existing product, create new product, or skip

**Guards**:
- Status guard: Actions fail if status changed since page load
- Race condition protection: Conditional updates check status before modifying
- Evidence preservation: Manual actions append to existing evidence

**Actions Available**:

| Action | Result Status | Match Type |
|--------|--------------|------------|
| Link to existing product | `MATCHED` | `MANUAL` |
| Create and link new product | `CREATED` | `MANUAL` |
| Skip (not actionable) | `SKIPPED` | (unchanged) |

**Justification**: This is an authorized exception to "resolver-only product creation" for items that explicitly require human judgment. The exception is bounded:
- Only available via authenticated admin interface
- Only for items already flagged by resolver as needing review
- Full audit trail in evidence and admin logs

### 7. Invariants

The following invariants must be maintained:

1. **Status guards**: Terminal states (`MATCHED`, `CREATED`, `SKIPPED`, `ERROR`) cannot be modified except through explicit re-processing
2. **Race condition protection**: All status updates use conditional `updateMany` with status check
3. **Evidence preservation**: Manual actions append to evidence; never overwrite resolver data
4. **Resolver version tracking**: Every resolution records the algorithm version
5. **Audit logging**: All manual actions logged via `logAdminAction`

## Alternatives Considered

### Immediate product creation (no review queue)
- **Rejected**: Would create many duplicate/incorrect canonical products
- Auto-matching is not reliable enough for 100% automation

### Manual-only matching
- **Rejected**: Does not scale
- 90%+ of products can be matched automatically

### Mutable status (allow reverting terminal states)
- **Rejected**: Complicates state machine and audit trail
- Re-processing should be explicit admin action, not status toggle

### Single evidence field (overwrite on update)
- **Rejected**: Loses resolver context when admin acts
- Append-only model preserves full decision history

## Consequences

### Technical
- `product_links` table is the source of truth for product↔source relationships
- Evidence JSON grows over time (acceptable for auditability)
- Scoring strategies are versioned and tracked
- Status state machine is enforced at application layer

### Operational
- Review Queue provides visibility into auto-matching failures
- Reason codes help identify systematic issues (e.g., source with bad UPCs)
- Resolver version tracking enables algorithm iteration
- Admin actions are fully auditable

### Product
- Price comparisons only include products with resolved links
- Unresolved items don't appear in consumer-facing UIs
- Admin can unblock items without code changes
- Clear separation between automated and manual resolution

## Notes

### Re-processing
Future work: Admin action to trigger resolver re-run on skipped/error items after algorithm improvements.

### Batch Operations
Future work: Bulk link/skip operations for sources with consistent issues.

### Scoring Strategy Evolution
Current: `weighted-exact` with TF-IDF
Roadmap:
- Additional similarity measures (Jaccard, Levenshtein)
- Source-specific weight tuning
- ML-based scoring (requires training data)

### UNMATCHED Deprecation
`UNMATCHED` is a legacy status from before `NEEDS_REVIEW` was introduced. Both are treated identically:
- Appear in Review Queue
- Subject to same status guards
- May be consolidated in future migration

---

## Amendment: Resolver Input Enrichment (2026-01-09)

To improve resolution rates without relaxing trust boundaries, the resolver now
consumes additional structured signals from `source_products` when available.
These are derived at ingestion time from affiliate feed Attributes and URL slugs.

### New Inputs (source_products)

- `caliber` (normalized string)
- `grainWeight` (int)
- `roundCount` (int)

These fields are **optional** and do not override trusted UPC matching rules.
They only improve fingerprint readiness when titles are incomplete or inconsistent.

### Input Precedence (Normalization)

1. Structured source fields (`source_products.caliber`, `grainWeight`, `roundCount`)
2. Title-derived extraction (regex patterns)
3. Missing → `INSUFFICIENT_DATA`

### Source of Structured Fields

- Affiliate feed `Attributes` JSON (if present)
- URL slug parsing as deterministic fallback

### Invariants Preserved

- UPC matching is still gated by `source_trust_config.upcTrusted`
- Fingerprint ambiguity still fails closed
- No change to resolver state machine or evidence model

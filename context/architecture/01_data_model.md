# Data Model

This document describes IronScout's current data model as represented in the existing documentation and reflected by how the apps behave.

**Source of truth note:** the only Prisma schema we have in the provided materials is the excerpt in `database.md`, and it contains `...` placeholders. That means some fields and relations are intentionally omitted. Before treating this as final, the repo should expose the actual Prisma schema (e.g. `prisma/schema.prisma` or `packages/db/prisma/schema.prisma`) and this document should be reconciled against it.

---

## Canonical Terminology (Required)

Per `reference/Merchant-and-Retailer-Reference.md`:

- **Merchant**: B2B portal account with authentication, billing, and subscription.
- **Retailer**: Consumer-facing storefront whose prices appear in search results. Prices are keyed by `retailerId`. Retailers do not authenticate.
- **Source/Feed**: Technical origin of price data. Explains provenance, not ownership.
- **Eligibility**: Applies to Retailer visibility, not Merchant existence or portal access.
- **Benchmarks**: `pricing_snapshots` keyed by `merchantId`. Not consumer-visible by default.

---

## Data Model Goals (v1)

- Represent ammunition products in a canonical, comparable way.
- Represent consumer-facing Retailers whose prices appear in search results.
- Track price history in a queryable, uniform format.
- Support alerts and watchlists without cross-account leakage.
- Support affiliate feed ingestion and admin observability for consumer pricing.

---

## Core Entity Map

At a high level:

- **Product** is the canonical unit (what a consumer is searching for).
- **Retailer** is the consumer-facing storefront whose prices appear in search results.
- **Merchant** is the B2B portal account that may administer Retailers.
- **Price** is the time-series record of a consumer price (keyed by `retailerId` + `productId`).
- **Alert** is a user-defined trigger referencing product/filters.
- **RetailerFeed / RetailerSku** model retailer inventory ingestion and mapping to canonical products.
- **MarketBenchmark / MerchantInsight** model "context" for merchants.
- **Source / Execution** model harvester ingestion operations.
- **AdminAuditLog** captures privileged actions.
- Retailers may have no Merchant relationship; listing applies only when a relationship exists.

---

## Entities and Responsibilities

### User
Represents a consumer account.

Key responsibilities:
- Owns alerts.
- Links to billing identities (legacy fields; not used in v1).

Invariants:
- User-owned data must be isolated (alerts, watchlists, saved items).

**Doc excerpt shows:**
- `tier: UserTier` (legacy field; not used in v1)
- `stripeCustomerId`, `stripeSubscriptionId` (legacy fields; not used in v1)
- relations to `Alert[]` and auth tables.


### Product (Canonical Product)
Represents a canonically grouped ammunition product.

Key responsibilities:
- Canonical grouping for inconsistent listings.
- Anchor entity for search, product pages, and alerts.

Typical fields (per docs and other design intent):
- caliber, grains, brand, casing, bullet type, pressure rating, projectile metadata
- packaging attributes (round count)
- normalized descriptors for filtering and AI search

Invariants:
- Product-Retailer linkage for consumer offers is expressed through `prices` only (no implicit foreign keys elsewhere).
- Normalized attributes should be the only ones used for filtering/ranking logic.

**Decision to confirm**
- Whether "Offer" is a first-class entity or whether `Price` represents offers directly. Current docs show `Price` but do not show a separate `Offer` model. If API returns "offers", it is likely derived from latest `Price` records.

---

### Retailer
Represents a consumer-facing storefront whose prices appear in IronScout search results.

Key responsibilities:
- Consumer price visibility (prices are keyed by `retailerId`).
- Link to harvester sources.
- May be administered by one or more Merchants.

Invariants:
- **Retailers do not authenticate directly.**
- Retailer eligibility/listing determine consumer visibility.
- Eligibility is enforced at query time (ADR-005).
- `visibilityStatus` (ELIGIBLE | INELIGIBLE | SUSPENDED) is the authoritative eligibility flag.
- Product-Retailer linkage for consumer offers is expressed through `prices` only (no implicit foreign keys elsewhere).
- Consumer visibility predicate: `retailers.visibilityStatus = ELIGIBLE` with listing/status applied only when a Merchant relationship exists; subscription state is never part of this predicate.

---

### Price (Offer Time Series)
Represents a time series record for a consumer price from a Retailer.

Key responsibilities:
- Support "current price" (latest record) and "historical context" (series).
- Support uniform history shaping (no consumer tiers in v1).
- Support alert evaluation.

**Important design constraint**
- Price records should be append-only or near-append-only. If you overwrite price history you destroy trust and debugging ability.
- **Consumer prices are keyed by `retailerId`**, not merchantId.
- Provenance fields (ADR-015) are required: `ingestionRunType`, `ingestionRunId`, `merchantId` (nullable), `sourceId`, `affiliateId` (nullable), `retailerId`.

**Decision to confirm**
- Uniqueness and indexing strategy:
  - Expected query patterns are "latest by product+retailer", "history by product+retailer", and "market summary by caliber/product".
  - This implies indexes on `(productId, retailerId, createdAt)` and/or `(productId, merchantSkuId, createdAt)`.
- If you need dedupe, use a content hash and a "no-op if unchanged" strategy rather than overwriting.

---

### Alert
Represents a consumer alert configured by a user.

Key responsibilities:
- Store alert configuration (thresholds, conditions, cadence).
- Track delivery state.

Invariants:
- Alerts must be isolated to the owning user.
- Alerts should evaluate against data that matches consumer visibility rules.
- Alert language must remain conservative (signals, not advice).

---

## Merchant Domain Model


### Merchant
Represents a B2B portal account (subscription, billing, auth boundary).

Key responsibilities:
- Merchant identity, subscription status, plan/tier, billing mode.
- Has authenticated users.
- Submits data via the portal (feeds, pricing snapshots).
- May administer one or more Retailer identities.

**Canonical statements (required):**
- **Merchants authenticate; Retailers do not.**
- **Benchmarks/snapshots are keyed by `merchantId`.**
- **Eligibility applies to Retailer visibility, not Merchant existence.**

**Doc excerpt indicates**
- subscription status and tier exist (details live in subscription management docs).
- relations to feeds, users, contacts, SKUs.

---

### MerchantUser and MerchantContact
- **MerchantUser**: authenticated portal users tied to a Merchant.
- **MerchantContact**: operational contact info.

Invariants:
- Merchant portal data must not leak across Merchants.
- Merchant portal permissions should be explicit (if you have roles).

### Merchant-Retailer Relationship (Entitlement)
Represents the explicit mapping between a Merchant and the Retailers it administers.

Key responsibilities:
- Encode which Retailers a Merchant may list.
- Carry listing controls (`listingStatus`: LISTED | UNLISTED) and relationship status (ACTIVE | SUSPENDED).
- Enable per-user, per-retailer permissions (e.g., `merchant_user_retailers`).

Invariants:
- Mapping is explicit and auditable; listing applies when a relationship exists.
- Consumer visibility predicate includes eligibility and listing/status checks only when a Merchant relationship exists.

---

### RetailerFeed
Represents a configured feed for a Retailer (submitted inventory).

Key responsibilities:
- Store feed URL/type, parsing config, status, health, last run.
- Support quarantine/disable behavior.

Operational invariants:
- Feed health affects Retailer eligibility for visibility (per public promises).
- If a feed is "SKIPPED", it must not produce downstream outputs (benchmarks/insights).

---

### RetailerSku
Represents a retailer-provided SKU row (their inventory unit) and its mapping to canonical products.

Key responsibilities:
- Preserve retailer SKU identity and metadata.
- Map to canonical `Product` when possible.
- Serve as the anchor for retailer inventory submission.

Invariants:
- Mapping must be deterministic and explainable enough for ops.
- When mapping fails, SKU should be quarantinable or flagged, not silently mis-mapped.

---

### MarketBenchmark
Represents aggregated market pricing context.

Key responsibilities:
- Provide plan-appropriate benchmark context (caliber-level, product-level, etc.).
- Should be descriptive statistics, not recommendations.

Invariants:
- Benchmarks must never imply optimal actions.
- Benchmark generation must be idempotent and skip-safe (no output for SKIPPED executions).

---

### MerchantInsight
Represents merchant-facing "context" derived from benchmarks and merchant inventory.

Key responsibilities:
- Plan-appropriate "you are above/below market" style context.
- Historical context and trend summaries.

Invariants:
- No prescriptive "recommended price" fields in v1.
- If you compute recommendation-like fields internally, they must be stripped from API/UI until explicitly enabled later.

---

### PricingSnapshot
Represents merchant-submitted or benchmark data.

Key responsibilities:
- Immutable facts.
- **Keyed by `merchantId`.**
- Not consumer-visible by default.

Publishing merchant data into consumer prices requires an explicit mapping to a Retailer.

---

## Harvester Operational Model

### Source
Represents a crawlable/ingestable source for the harvester (the harvester).

Key responsibilities:
- Configuration and enable/disable state.
- Links to executions.
- Explains provenance (how we got the data), not ownership.

---

### Execution
Represents a run of the harvester pipeline for a source.

Key responsibilities:
- Track status, timings, counts, errors.
- Enable debugging and replay.

Invariants:
- Executions should be immutable records of what happened.
- If the system is re-run, it should create a new execution record, not overwrite history.

---

## Admin Auditability

### AdminAuditLog
Represents an auditable record of privileged changes.

Required coverage:
- Subscription changes 
- Retailer eligibility changes
- Feed enable/disable/quarantine
- Any override that changes visibility or billing state

Invariants:
- If a privileged action can't be audited, it shouldn't exist.
- Audit log must capture "before" and "after" values (JSON is fine).

**Potential inconsistency needing code change**
- Ensure all admin mutations are wrapped in a transaction that writes audit logs alongside the mutation, not "best effort".

---

## Key Enums and Constraints

From `database.md`, the model relies on enums such as:
- `UserTier` (legacy field; not enforced in v1)
- Ammo attribute enums (bullet type, casing, pressure, etc.)
- Merchant subscription and tier enums (documented elsewhere)

**Decision to confirm**
- Ensure eligibility-related enums are centralized and referenced consistently across:
  - API shaping
  - admin portal

---

## Cross-Cutting Invariants (Must Hold Everywhere)

1. **No cross-account access**
   - user-to-user
   - merchant-to-merchant
   - consumer-to-merchant sensitive data

2. **Uniform consumer capabilities in v1**
   - no consumer-tier gating
   - consistent response shaping

3. **Retailer visibility is deterministic**
   - ineligible Retailers never appear in consumer flows

4. **Append-only time series**
   - preserve price history
   - avoid overwrites that hide errors

5. **Idempotent ingestion**
   - schedulers and workers cannot create duplicates under concurrency

---

## Canonical Statements (Required)

This document explicitly supports:
- **Merchants authenticate; Retailers do not **
- **Consumer prices are keyed by `retailerId`**
- **Benchmarks/pricing_snapshots are keyed by `merchantId`**
- **Eligibility applies to Retailer visibility, not Merchant existence**
- **Merchant-Retailer mapping is explicit; listing/permissions gate visibility when a relationship exists**
- **Consumer visibility predicate: visibilityStatus = ELIGIBLE with listing/status applied only when a relationship exists (no subscription gating)**

---

## Known Gaps and Items Requiring Decisions

These need explicit decisions and may require code changes:

1. **Where is the actual Prisma schema?**
   - The provided `database.md` excerpt contains placeholders (`...`).
   - Decision: expose the real schema file and treat it as truth.

2. **Offer representation**
   - Docs show `Price` but do not show `Offer`.
   - Decision: confirm whether "offer" is derived (latest Price) or a first-class model.

3. **Retailer eligibility fields**
   - Public promises require eligibility based on feed health and policies.
   - Decision: confirm which fields encode feed health and how they affect visibility.

4. **Index strategy for price history**
   - Decision: define indexes for "latest offer" and "history slice" queries so v1 performance is stable.

---

## Next Document

`architecture/02_search_and_ai.md` should define:
- what AI signals exist
- how canonical grouping interacts with embeddings
- exactly what is returned to all users in v1
- how explanations are gated and degraded (if ever reintroduced)
# Status: Advisory (v1 scope applies)
This document is non-authoritative. v1 scope and cut list govern what ships.
If this conflicts with `context/02_v1_scope_and_cut_list.md`, this doc is wrong.

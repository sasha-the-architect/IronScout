# Merchant Portal (legacy path: apps/dealer)

> NOTE: This doc describes the Merchant portal. File path may remain `apps/dealer` temporarily for migration reasons.

This document describes the **merchant-facing application** for IronScout v1.  
It defines what merchants can do, see, and expect, and where explicit constraints apply.

This document must remain aligned with:
- `context/00_public_promises.md`
- `context/01_product_overview.md`
- `context/02_v1_scope_and_cut_list.md`
- `context/04_pricing_and_tiers.md`
- `architecture/04_subscription_and_billing.md`

If merchant UI behavior conflicts with those documents, this document is wrong.

---

## Terminology (Canonical)

- **Merchant**: B2B portal account (subscription, billing, auth boundary). Merchant has users. Merchant submits merchant-scoped datasets (e.g., `pricing_snapshots`).
- **Retailer**: Consumer-facing storefront shown in search results. Consumer `prices` are keyed by `retailerId`. Retailers do not authenticate.
- **Source/Feed**: Technical origin of a consumer price record (affiliate, scraper, direct feed). Source is not Merchant.
- **Admin rights**: Merchant users are explicitly granted permissions per Retailer.
- **Legacy**: Any “dealer” wording or `DEALER_*` keys are legacy and must be migrated to “merchant” terminology.

## Purpose of the Merchant Portal

The merchant portal exists to:
- Ingest retailer inventory (administered by the merchant) reliably
- Normalize and match SKUs to canonical products
- Determine eligibility for consumer visibility
- Provide **market pricing context**, not pricing advice

It is not designed to:
- Recommend prices
- Automate repricing
- Guarantee traffic or conversions
- Provide competitive or prescriptive analytics

---

## Core Merchant Flows (v1)

### Authentication and Access

- Merchant users authenticate into the merchant portal
- Access is explicit per Retailer; a Merchant can administer multiple Retailers
- Merchant users cannot see other Merchants' data

Access is governed by:
- Merchant subscription tier
- Merchant subscription status
- Feed health and platform policies for administered Retailers

---

### Feed Configuration and Ingestion

Merchants can:
- Configure one or more inventory feeds (CSV, XML, JSON)
- View feed status and last execution
- See ingestion errors and health indicators
- Disable or correct feeds when issues occur

Constraints:
- Feed configuration changes must not require redeploys
- Feed health affects eligibility for visibility
- Broken feeds may be quarantined

If a feed is quarantined or disabled:
- Retailer inventory from that feed must not appear in consumer experiences
- No downstream benchmarks or insights may be generated

---

### SKU Normalization and Matching

Retailer SKUs are:
- Parsed from feeds
- Normalized into ammo attributes
- Matched to canonical products where possible

Merchant users may:
- View SKU match status
- Identify unmapped or ambiguous SKUs

Constraints:
- SKU-to-product matching must be deterministic
- Ambiguous matches must not silently map
- Mapping failures must be visible to ops

---

### Inventory Visibility

Retailer inventory appears in consumer search **only if**:
- `retailers.visibilityStatus = ELIGIBLE`
- `merchant_retailers.listingStatus = LISTED`
- `merchant_retailers.status = ACTIVE`

Rules:
- Subscription status does **not** directly gate consumer visibility; delinquency/suspension auto-unlists listings, recovery requires explicit relist.
- Visibility is enforced server-side (query-time predicate).
- UI hiding alone is insufficient.
- Ineligible or unlisted inventory must not appear through any consumer path.

If eligibility or listing changes:
- Visibility must update deterministically.
- Alerts must not trigger from ineligible or unlisted inventory.

### Listing Management

Merchant users must be able to:
- List/Unlist administered Retailers (entitlement) with audit trail.
- See current listingStatus and relationship status.
- Understand that relisting after delinquency/suspension is explicit (no auto-relist).

---

### Merchant Context and Benchmarks

Depending on plan tier, merchants may see:
- Market pricing context
- Caliber-level benchmarks
- Historical pricing ranges

Merchant context:
- Is descriptive, not prescriptive
- Compares Retailer prices and market benchmarks
- Does not suggest actions

Disallowed outputs include:
- “Recommended price”
- “You should lower your price”
- “Best price positioning”

---

## Subscription and Tier Behavior

- Billing is Merchant-level; billing unit is per Retailer listing. Merchants pay per Retailer listing.
- Consumer visibility is never gated by subscription status; only eligibility + listing + active relationship apply.
- v1: each Retailer belongs to exactly one Merchant.

### Starter

Starter merchants have:
- Inventory ingestion
- Canonical matching
- Eligible inventory visibility

Starter merchants do not have:
- Market benchmarks
- Historical context
- Performance analytics
- Usage-based billing UI (v1)

---

### Standard

Standard merchants have:
- All Starter features
- Caliber-level market benchmarks
- Basic historical context
- Plan-appropriate refresh behavior

---

### Pro

Pro merchants have:
- All Standard features
- Deeper historical benchmarks
- SKU-level pricing context where data allows
- More frequent refresh where applicable

Pro increases **resolution**, not authority.

---

## Subscription States and Effects

### Active
- Full access to subscription-appropriate features
- Inventory may be listed; consumer visibility still depends on eligibility + listing

### Expired (Grace)
- Behavior must be explicitly defined and consistent
- Visibility rules must be deterministic (eligibility + listing predicate)

### Suspended / Cancelled
- Inventory auto-unlisted; consumer visibility blocked until explicitly relisted after recovery
- Portal access allowed for remediation; merchant features remain gated by subscription status

If state is ambiguous, access must default to restricted.

---

## UI Language and Presentation Rules

Merchant portal UI must:
- Use neutral, operational language
- Avoid claims of performance or outcomes
- Avoid recommendation framing

Allowed language:
- “Compared to market range”
- “Above recent average”
- “Below recent range”

Disallowed language:
- “Optimal price”
- “Guaranteed traffic”
- “Recommended adjustment”

Language is a trust and liability surface.

---

## Error States and Degradation

When data is missing or unreliable:
- Context must be reduced or hidden
- Explanations must be removed
- Errors must be explicit

Merchant-facing errors must:
- Identify the affected feed or SKU
- Avoid attributing errors to a Retailer or Merchant without evidence
- Provide clear next steps

---

## Known Constraints and Decisions (v1)

These are intentional:

- No pricing recommendations
- No automated repricing
- No usage-based billing UI
- No conversion attribution
- No Merchant-to-Merchant competitive ranking

If any of these appear, it is a scope violation.

---

## Non-Negotiables

- Eligibility enforcement is mandatory
- Visibility must fail closed
- Subscription state must be respected everywhere
- Merchant trust depends on fairness and predictability

---

## Guiding Principle

> The Merchant portal exists to provide visibility and context, not instructions.

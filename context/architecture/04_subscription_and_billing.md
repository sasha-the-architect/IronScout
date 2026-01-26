# Subscription and Billing (Merchant-scoped)


This document describes how subscriptions and billing are modeled and enforced in IronScout **as implemented today**, with explicit callouts where behavior, documentation, or code paths require decisions or tightening.

This document defines **mechanics and enforcement**, not pricing language. Pricing promises live in `context/04_pricing_and_tiers.md`.

## Terminology (Canonical)

- **Merchant**: B2B portal account (subscription, billing, auth boundary). Merchant has users. Merchant submits merchant-scoped datasets.
- **Retailer**: Consumer-facing storefront shown in search results. Consumer `prices` are keyed by `retailerId`. Retailers do not authenticate.
- **Source/Feed**: Technical origin of a consumer price record (affiliate, scraper, direct feed). Source is not Merchant.
- **Admin rights**: Merchant users are explicitly granted permissions per Retailer.
- **Legacy**: Any “dealer” wording or `DEALER_*` keys are legacy and must be migrated to “merchant” terminology.

## Subscription and Billing (Merchant-scoped)

Subscriptions apply to **Merchants** (B2B portal accounts). Merchants authenticate. Retailers do not.

- Subscription is Merchant-level: it gates portal capabilities and Merchant features (feeds configuration, benchmarking depth, analytics, support levels).
- Billing unit = per Retailer listing (entitlement). Merchants pay per Retailer listing.
- Pricing and consumer visibility are per-Retailer listing (entitlement) and eligibility, not subscription.
- Eligibility applies to **Retailer visibility**, not Merchant existence. Listing is an explicit Merchant↔Retailer entitlement.
- Retailer-Merchant relationships may exist; listing applies only when a relationship exists.


## Data model mapping

- Consumer prices: `prices` (immutable) keyed by `retailerId`.
- Merchant benchmarks: `pricing_snapshots` (immutable) keyed by `merchantId`.
- Source/Feed identifies how consumer prices were obtained. It is not a Merchant.
- Entitlement: `merchant_retailers.listingStatus` (LISTED | UNLISTED) and relationship `status` (ACTIVE | SUSPENDED) gate whether a Merchant’s retailer can appear to consumers once eligible.

> Legacy note: some code paths, env vars, queues, or folders may still use the prefix `dealer` during migration. This is naming only. The canonical concept is Merchant.

## Goals

Subscriptions and billing must:
- Enforce access deterministically
- Be auditable and reversible
- Fail closed when state is ambiguous
- Avoid creating trust or support debt

This system prioritizes correctness and simplicity over billing sophistication.

---

## Subscription Domains

IronScout has one subscription domain when merchant billing is enabled :

1. **Merchants**

Consumer subscriptions are not offered in v1.

---

## Merchant Subscriptions


### Model

Merchants have:
- A subscription tier (e.g. STARTER, STANDARD, PRO)
- A subscription status (ACTIVE, EXPIRED, SUSPENDED, CANCELLED)
- A billing method (e.g. platform billing, invoice)

Subscription state governs portal feature access (depth, speed, analytics) and operational actions. Consumer visibility is governed by:
- Retailer eligibility (`retailers.visibilityStatus = ELIGIBLE`)
- Merchant↔Retailer entitlement (`listingStatus = LISTED` and relationship `status = ACTIVE`)
- No subscription gating in consumer queries.

---

### Merchant Subscription States

#### ACTIVE
- Full access to tier-appropriate Merchant features
- Administered Retailers may be listed/unlisted; consumer visibility still depends on eligibility + listing

#### EXPIRED (Grace)
- Access may be partially retained for a limited period
- Consumer visibility unchanged: eligibility + listing predicate still applies

#### SUSPENDED / CANCELLED
- Merchant portal access allowed for remediation; merchant features gated by tier/status.
- Consumer visibility is controlled by entitlement: delinquency/suspension should auto-unlist listings; recovery remains unlisted until explicitly listed.

**Required invariant**
- Suspension/delinquency triggers auto-unlist of all Merchant listings; recovery does not relist automatically.

---

## Enforcement Surfaces (Merchant/Retailer)

Consumer visibility is enforced by eligibility + entitlement, not subscription. Subscription affects Merchant feature access and listing lifecycle automation (auto-unlist on delinquency).

1. **Harvester**
   - Ingestion continues for portal access (even if delinquent) but writes must capture provenance.
   - Auto-unlist or quarantine outputs if delinquent/suspended per policy.

2. **API Query Layer**
   - Filter Retailer inventory at query time based on eligibility + listing entitlement (ADR-005)
   - Do not rely on ingestion-time filtering alone

3. **Alerts**
   - Retailer inventory must not trigger alerts when Retailer is ineligible or unlisted

4. **Merchant Portal**
   - Restrict merchant portal features based on tier/status; keep access for remediation even when delinquent/suspended.

Failure at any one surface is a trust violation.

---

## Billing Methods

### Consumer Billing

Consumer billing is not offered in v1. Any consumer billing fields are legacy and must not be used for access control.

No metered billing exists for consumers in v1.

---

### Merchant Billing

- Merchants may be billed via:
  - platform billing
  - invoice / purchase order
- Billing method must be mutually exclusive

**Required invariant**
- A Merchant must not simultaneously have:
  - invoice billing, and
  - active platform billing identifiers

If billing state is ambiguous, default to restricted access.

---

## Admin Capabilities and Auditability

### Admin Powers

Admins may:
- Change subscription tier
- Change subscription status
- Extend expiration
- Switch billing method
- Impersonate dealers for support

These powers are **trust-critical**.

---

### Audit Requirements

All admin actions that affect:
- access
- visibility
- billing
- subscription state

must:
- be recorded in an audit log
- include before/after values
- include admin identity
- include timestamp

**Observed risk**
- Some admin mutations may not yet be transactionally coupled with audit logging.

**Required action**
- Wrap subscription mutations and audit logging in a single transaction.

---

## Impersonation Boundaries

### Allowed

- View Merchant portal as the Merchant
- Troubleshoot UI and configuration issues

### Not Allowed

- Bypass subscription enforcement
- Bypass visibility rules
- Mutate billing state implicitly

Impersonation must be explicit in session context and must not elevate privilege beyond UI access.

---

## Failure Modes and Defaults

### Ambiguous State

If subscription or billing state is unclear:
- Default to restricted access
- Do not expose Retailer inventory
- Do not enable consumer premium features in v1

### Manual Overrides

Manual admin overrides:
- Must be explicit
- Must be audited
- Must be reversible

Silent overrides are not acceptable.

---

## Known Inconsistencies and Required Decisions

1. **Tier resolution trust**
   - Decision: remove all header-based tier inference
   - Enforce verified auth-based resolution only

2. **Grace period semantics**
   - Decision: explicitly document which features remain during grace
   - Ensure consistency across harvester, API, and UI

3. **Billing exclusivity**
   - Decision: enforce mutual exclusivity in code and admin UI

4. **Audit coverage**
   - Decision: confirm all subscription mutations are audited transactionally

---

## Non-Negotiables

- Subscription enforcement must be deterministic
- Visibility must fail closed
- Admin actions must be auditable
- Billing ambiguity must restrict access

---

## Guiding Principle

> Billing exists to gate access, not to explain value.


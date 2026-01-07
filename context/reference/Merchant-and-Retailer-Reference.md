# Merchant and Retailer Reference Guide

## Purpose

This document defines the canonical meaning of **Merchant** and **Retailer** in IronScout, how they relate to each other, and how they are used across data ingestion, permissions, UI, and data corrections.

This is a **reference document**, not an ADR.  
It is authoritative. If implementation conflicts with this document, the implementation is wrong.

---

## Core Definitions

### Merchant

A **Merchant** is a B2B portal account and subscription customer of IronScout.

A Merchant:
- Has billing and subscription status.
- Has authenticated users.
- Submits data via the portal (feeds, pricing snapshots).
- Receives benchmarks, alerts, and operational insights.
- May administer one or more Retailer identities.

A Merchant is **not** consumer-facing.

---

### Retailer

A **Retailer** is a consumer-facing storefront whose prices appear in IronScout search results.

A Retailer:
- Is shown to end users (“View at <Retailer>”).
- Owns consumer price visibility.
- Is the entity consumers recognize and trust.
- May be administered by one or more Merchant users via permissions.

A Retailer does **not** authenticate directly.

---

## Relationship Model

### Merchant → Retailer

- One Merchant can administer **many Retailers**.
- A Retailer may be administered by:
  - One Merchant (typical today), or
  - Multiple Merchants (future-supported, not assumed).

Relationships are **explicit**, never inferred.

Recommended structure:
- `merchants`
- `retailers`
- `merchant_retailers` (join table)

### Listing / Entitlement

**Retailer visibility is retailer-owned.** `retailers.visibilityStatus` is the primary gate. Merchant relationships are conditional overrides, not the source of truth.

**Retailers may be consumer-visible without any merchant relationship.** Retailers sourced exclusively from affiliate or third-party feeds may have no associated Merchant. These retailers are consumer-visible if otherwise ELIGIBLE and are managed only through source- and affiliate-level controls.

**`merchant_retailers.listingStatus` only gates visibility when at least one relationship exists.**

- Relationship status (ACTIVE | SUSPENDED) is separate from Retailer eligibility.
- When multiple Merchant relationships exist, the Retailer is visible if **at least one** is ACTIVE and LISTED.
- Subscription status is NOT a consumer visibility predicate.

### Visibility Truth Table

| `visibilityStatus` | Merchant Relationships | Result |
|---|---|---|
| ELIGIBLE | none | **Visible** (crawl-only) |
| ELIGIBLE | ≥1 ACTIVE + LISTED | **Visible** |
| ELIGIBLE | ≥1 ACTIVE, all UNLISTED | **Hidden** |
| ELIGIBLE | all SUSPENDED | **Visible** (crawl-only) |
| INELIGIBLE | any | **Hidden** |

### Suspension and Removal Behavior

If a Merchant–Retailer relationship is suspended or removed, the Retailer reverts to crawl-only behavior. Consumer visibility is determined solely by the Retailer's own eligibility and any remaining active, listed relationships.

If all relationships are SUSPENDED, the retailer behaves as crawl-only.

Removal and suspension have identical visibility effects; removal simply deletes the relationship record.

Suspension means:
- Merchant loses management rights.
- Portal access revoked for that retailer.
- Listings managed by that merchant are unlisted.

Suspension does **not** mean:
- The retailer disappears from the market.
- Affiliate or crawl data is invalid.
- Consumer discovery is blocked.

Propagating suspension to visibility would let merchants "rage-hide" retailers, break affiliate coverage, and entangle billing disputes with consumer data integrity.

---

## Users and Permissions

### Merchant Users

- Users authenticate under a Merchant account.
- Users are granted permissions per Retailer.
- Permissions are explicit and auditable.

Common roles:
- Admin: all retailers under the merchant.
- Manager: specific retailers.
- Analyst: read-only.

**Retailers do not have users. Merchants do.**

A retailer may have zero associated merchants. In that case it is managed only by internal ops and automated ingestion.

### Canonical Permission Tables

Permissions are stored in these tables and are the **only** allowed mechanism for access control:

| Table | Purpose |
|-------|---------|
| `merchant_users` | Authenticated users under a merchant account |
| `merchant_retailers` | Which retailers a merchant can administer |
| `merchant_user_retailers` | Per-user permissions for specific retailers |

Permissions are enforced via `merchant_user_retailers`, not inferred from other relationships.

---

## Data Ownership and Attribution

### Consumer Prices (`prices`)

- Immutable facts.
- Keyed by `retailerId`.
- Represent what end users see in search results.
- Provenance fields explain **how** the data was obtained.

---

### Merchant-Submitted Data (`pricing_snapshots`)

- Immutable facts.
- Keyed by `merchantId`.
- Represent merchant-submitted or benchmark data.
- Not consumer-visible by default.

Publishing merchant data into consumer prices requires an explicit mapping to a Retailer.

---

### Relationship-Scoped Data

Some operational data is scoped to the **Merchant–Retailer relationship** (`merchantId` + `retailerId`), not to merchant or retailer alone.

| Table | Scope | Fallback |
|-------|-------|----------|
| `merchant_retailers.listingStatus` | Relationship | — |
| `merchant_contacts` | Relationship | Merchant-level default |
| `merchant_notification_prefs` | Relationship | Merchant-level default |

**Pattern:** "I want different contacts for each storefront I manage, but default to my main contact if not specified."

When adding new operational data, decide explicitly:
- **Merchant-scoped:** Applies to all retailers the merchant manages (billing, subscription, audit logs).
- **Retailer-scoped:** Applies to the retailer regardless of who manages it (prices, SKUs, visibility).
- **Relationship-scoped:** Varies per merchant–retailer pair (listing preferences, retailer-specific contacts).

Do not default to merchant-scoped. Ask which scope applies.

---

## Source and Feed Model

A **Source** or **Feed** represents the technical origin of price data.

- Source/Feed is **not** a Merchant.
- Source/Feed is associated with a Retailer for identity.
- Source explains provenance, not ownership.

### Dual Attribution

Feeds have dual attribution:

| Aspect | Scope | Key |
|--------|-------|-----|
| **Identity** | Retailer | `retailerId` — whose data this is |
| **Management** | Merchant | via `merchant_retailers` — who can edit, who is accountable |

Feeds/Sources are keyed to `retailerId` for identity. Management and audit attribution flows through the `merchant_retailers` relationship.

### Simple Rule

- Retailer = who the price is from.
- Source = how we got it.
- Merchant = who logged in and manages data.

---

## Corrections Reference (ADR-015 aligned)

Correction scopes are table- and key-specific.

| Scope     | Applies To          | Key |
|-----------|--------------------|-----|
| PRODUCT   | prices              | productId |
| RETAILER  | prices              | retailerId |
| MERCHANT  | pricing_snapshots   | merchantId |
| SOURCE    | prices              | sourceProductId or sourceId |
| AFFILIATE | prices              | affiliateId |
| FEED_RUN  | prices + snapshots  | ingestionRunId |

If a Merchant is linked to a Retailer, a single incident may require **multiple corrections**.

---

## ER-Style Model

```text
Merchant (portal account)
  └─ Merchant Users
       └─ Permissions (per Retailer)
            └─ Retailer (storefront)
                 ├─ Prices (consumer-visible)
                 └─ Feeds / Sources (ingestion config)

Merchant
  └─ Pricing Snapshots (benchmarks, portal-only)
```

---

## Operational Decision Guide

### If consumer prices are wrong
- Wrong for one retailer → RETAILER
- Wrong for one product → PRODUCT
- Wrong from one source/feed → SOURCE
- Wrong from one affiliate network → AFFILIATE
- Wrong from one ingestion run → FEED_RUN

### If merchant-submitted data is wrong
- Wrong for one merchant → MERCHANT
- Wrong from one portal ingestion run → FEED_RUN

If both are wrong, apply corrections separately. Do not blur scopes.

---

## Real-World Examples (Illustrative)

### Example 1: One merchant, multiple retailers
Merchant: Bass Pro Shops (portal account)  
Retailers: Bass Pro Shops, Cabela’s

- Consumer price issue for Cabela’s → RETAILER correction.
- Benchmark upload issue → MERCHANT correction.

---

### Example 2: Merchant is also a retailer
Merchant: Brownells (portal account)  
Retailer: Brownells (storefront)

- Consumer price issue → RETAILER correction.
- Benchmark issue → MERCHANT correction.
- Often requires both.

---

### Example 3: Benchmark-only merchant
Merchant: Regional distributor  
Retailers: none

- Only MERCHANT corrections apply.
- No consumer impact.

---

## Explicit Non-Goals

- Retailer authentication.
- Implicit merchant–retailer identity equivalence.
- Treating Source or Feed as a business entity.
- Automatic publishing of merchant data into consumer prices.

---

## Summary

- Merchants log in.
- Retailers appear to consumers.
- Retailers may be visible without any merchant relationship (crawl-only).
- Consumer visibility = `visibilityStatus` (ELIGIBLE) + at least one ACTIVE/LISTED relationship (if any exist); subscription is not a consumer visibility gate.
- Suspension/removal reverts to crawl-only; does not hide the retailer.
- Sources explain ingestion; feeds are retailer-scoped for identity, merchant-scoped for management.
- Permissions are explicit and stored in `merchant_user_retailers`.
- Data scope must be chosen explicitly: merchant, retailer, or relationship.
- Corrections are scoped, not guessed.

This separation is required for scale, clarity, and operational safety.

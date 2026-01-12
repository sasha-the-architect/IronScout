# Public Promises

This document defines what IronScout promises **externally**.

These promises apply to:
- Website and marketing copy
- In-product UI language
- API behavior and outputs
- Sales conversations and pricing pages

No public-facing statement may exceed what is written here.

If something is not promised in this document, it must be treated as **not guaranteed**.

## Terminology (Canonical)

- **Merchant**: B2B portal account (subscription, billing, auth boundary). Merchant has users. Merchant submits merchant-scoped datasets (e.g., `pricing_snapshots`).
- **Retailer**: Consumer-facing storefront shown in search results. Consumer `prices` are keyed by `retailerId`. Retailers do not authenticate.
- **Source/Feed**: Technical origin of a consumer price record (affiliate, scraper, direct feed). Source is not Merchant.
- **Admin rights**: Merchant users are explicitly granted permissions per Retailer.
- **Legacy**: Any "dealer" wording or `DEALER_*` keys are legacy and must be migrated to "merchant" terminology.

Merchants authenticate and administer Retailers. Retailers do not authenticate.

---

## Core Positioning

IronScout is a pricing intelligence and discovery platform for ammunition.

Its value comes from:
- Cleaner search across fragmented listings
- Canonical product grouping
- Historical price context
- Signals that help users interpret current prices

IronScout provides **context and signals**, not decisions.

---

## Consumer Promises

IronScout promises that consumers can:

- Search ammunition using AI-powered, intent-aware search
- See canonically grouped products across multiple retailers
- View current prices alongside historical price context
- Compare prices across retailers in a consistent format
- Track price and availability changes over time
- Receive alerts when prices or availability change

IronScout does **not** promise:
- The lowest price
- Optimal purchase timing
- Future price predictions
- Guaranteed savings
- Correctness under all market conditions

---

## AI Usage (Consumer)

IronScout uses AI to:
- Understand search intent
- Normalize and group inconsistent listings
- Assist ranking and prioritization
- Generate optional explanatory context

IronScout does **not** use AI to:
- Make purchasing decisions
- Guarantee correctness
- Predict future prices
- Provide financial or buying advice

All AI output is treated as assistive, not authoritative.

---

## Premium Availability (v1)

Premium is not offered in v1. All consumer capabilities are available to every user.

---

## Merchant Promises

- Merchants receive ingestion and normalization for the Retailers they administer.
- Retailer SKUs are canonically matched where possible.
- Merchants receive market context and benchmarks appropriate to their plan.
- Retailer inventory visibility is governed by eligibility and listing policies (query-time predicate: `retailers.visibilityStatus = ELIGIBLE` AND `merchant_retailers.listingStatus = LISTED` AND relationship `status = ACTIVE`).
- Eligibility applies to Retailer visibility, not Merchant existence. Merchant subscription tier controls portal capabilities, not whether a Retailer can exist or be visible to consumers.

No guarantees are made about completeness, accuracy, or continuous availability of any Retailer’s prices.

---

## Availability and Data Freshness

IronScout promises to make reasonable efforts to:
- Keep pricing data current
- Remove blocked, ineligible, or unlisted Retailers from visibility
- Reflect known availability changes

IronScout does **not** promise:
- Real-time accuracy
- Complete market coverage
- Immediate propagation of all changes

Data freshness may vary by source and category.

---

## Legal and Compliance Disclaimer

IronScout does not provide legal, regulatory, or compliance advice.

---

## Enforcement

These promises are enforced by:
- Retailer eligibility + listing rules (query-time predicate)
- Subscription enforcement for Merchant portal features (not consumer visibility)
- Conservative UI language
- Explicit exclusions where guarantees cannot be made

If enforcement cannot be guaranteed, the promise must be removed or softened.

---

## Interpretation Rule

When interpreting any public statement about IronScout:

- This document always wins over marketing copy
- Conservative interpretation is preferred
- Silence implies no guarantee

---

## Guiding Principle

> IronScout helps users understand the market.  
> It does not decide for them.

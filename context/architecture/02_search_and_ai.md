# Search and AI Architecture

This document describes how IronScout ingests, normalizes, and surfaces product data for search, monitoring, and alerting.

It explains where automation and machine-assisted classification are used, and just as importantly, where they are not.

This document is internal and architectural. It does not define user-facing promises.

---

## Design Goals

- Handle inconsistent, low-quality retailer data at scale
- Normalize listings into comparable, equivalent products
- Support fast, flexible search across structured and semi-structured inputs
- Enable reliable detection of price and availability change over time
- Preserve determinism, auditability, and trust

---

## Core Principle

Automation in IronScout exists to **reduce noise**, not to make decisions for users.

The system may classify, group, and detect change.  
It must never determine what a user “should” buy.

---

## Data Ingestion and Normalization

Retailer feeds vary widely in quality, structure, and naming conventions.

IronScout applies automated normalization to:
- Parse caliber, grain, casing, and packaging details
- Standardize units and quantities
- Resolve obvious naming inconsistencies
- Flag ambiguous or incomplete listings

This process produces **normalized product candidates**, not recommendations.

When ambiguity cannot be resolved confidently, the system preserves uncertainty rather than guessing.

---

## Equivalence Grouping

Listings that represent the same real-world product are grouped together.

Grouping is based on:
- Parsed technical attributes
- Manufacturer identifiers
- Known retailer patterns
- Historical consistency

Grouping exists to reduce duplication and comparison noise.  
It does not imply quality, value, or endorsement.

---

## Search Query Processing

Search accepts free-form input but anchors on structured interpretation.

Automation is used to:
- Parse query terms into structured filters
- Match equivalent products
- Exclude obviously incompatible listings

Search returns **eligible results**, not ranked advice.

Ordering within search results is deterministic and based on transparent factors such as:
- Price
- Availability
- Retailer grouping
- User-selected filters

Search does not determine “best” options.

---

## Use of Automation and Machine Assistance

Automation is used to:
- Normalize messy input data
- Classify product attributes
- Group equivalent listings
- Detect price and availability change over time

Automation is **not** used to:
- Assign value judgments
- Score deals
- Rank products by desirability
- Generate recommendations or verdicts
- Explain outcomes to users

All surfaced outcomes must be explainable via observable data.

---

## Change Detection

The system continuously monitors normalized listings for:
- Price movement
- Availability changes
- Inventory signals (where available)

Detected changes are classified as:
- Minor (informational)
- Meaningful (eligible for dashboard surfacing or alerts)

Change classification thresholds are deterministic and auditable.

---

## Relationship to Dashboard and Alerts

Search provides discovery.  
Saved Items and Saved Searches capture intent.  
The Dashboard surfaces moments worth attention.  
Alerts interrupt only when actionably better now than later.

Automation feeds these systems but does not control their tone, urgency, or messaging.

---

## Explicit Non-Goals (v1)

In v1, the system does not:
- Generate explanations or reasoning text
- Surface AI-derived scores or confidence levels
- Predict future prices
- Make purchase recommendations
- Optimize for engagement or novelty

Any future expansion in these areas requires explicit ADR approval.

---

## Summary

IronScout uses automation to make messy data usable and monitoring reliable.

It does not use automation to decide, persuade, or judge.

This distinction is foundational and must be preserved.

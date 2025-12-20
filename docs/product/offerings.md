# IronScout Dealer Product Offerings

This document tracks what we offer to dealers at each subscription tier, implementation status, and outstanding questions about our product capabilities.

---

## Subscription Tiers Overview

| Tier | Price | Target Customer |
|------|-------|-----------------|
| **STARTER** | $0/month + $0.08/click | New/small dealers wanting low-risk entry |
| **STANDARD** | $99/month | Small to mid-size dealers wanting market visibility |
| **PRO** | $299/month | Dealers needing deep market insight for pricing decisions |
| **FOUNDING** | Free (1 year) | Early adopters - PRO features, converts to PRO after year 1 |

---

## STARTER Tier - Pay-Per-Click

### Target Customer
New or small dealers who want to test the waters without a monthly commitment. Ideal for dealers with unpredictable traffic or those evaluating IronScout before upgrading.

### Pricing Model

| Fee Type | Amount | Notes |
|----------|--------|-------|
| Monthly subscription | $0 | No fixed monthly cost |
| Per-click fee | $0.08 | Per unique click to dealer site |
| Setup fee | $0 | No setup fee (competitive advantage vs AmmoBuy) |
| Minimum monthly spend | $0 | No minimums |

**Billing**: Clicks tracked daily, invoiced monthly via Stripe. Prepaid credit option available.

### Features

| Feature | Description | Implementation Status | Notes |
|---------|-------------|----------------------|-------|
| **Product listing inclusion** | Dealer SKUs appear on IronScout.ai consumer search | _[STATUS?]_ | Core value prop |
| **Dealer feed ingestion** | Automated import of dealer product feeds (CSV/XML/JSON) | Implemented | Same as paid tiers |
| **SKU matching** | Match dealer SKUs to canonical products | Implemented | Same as paid tiers |
| **Basic click analytics** | View clicks by day/week/month | _[STATUS?]_ | Simple dashboard |
| **Self-service portal** | Manage feed, view clicks, update billing | _[STATUS?]_ | Subset of full portal |
| **Email support** | Support via email | Operational | Standard response time |

### NOT Included (Upgrade to STANDARD)

| Feature | Why Not Included |
|---------|------------------|
| Market price benchmarks | Premium insight feature |
| Pricing insights | Premium insight feature |
| Email alerts | Premium engagement feature |
| Monthly performance reports | Premium analytics feature |
| Historical data | Premium data retention |

### Click Tracking & Billing

**What counts as a click?**
- Unique click = one user clicking to dealer site per product per 24-hour period
- Same user clicking same product multiple times in 24h = 1 click
- Same user clicking different products = multiple clicks
- Bot traffic filtered out (user-agent, rate limiting, IP patterns)

**Click tracking implementation:**
```
User clicks "Buy" → ClickEvent logged → Redirect to dealer URL
                         ↓
              Daily aggregation job
                         ↓
              Monthly invoice generation
```

**Fraud prevention:**
- Rate limiting per IP
- Bot detection (user-agent filtering)
- Suspicious pattern detection
- Manual review for anomalies
- Dealer can dispute charges within 30 days

### Upgrade Path

| Scenario | Recommendation |
|----------|----------------|
| Dealer reaches ~1,000 clicks/month | Suggest STANDARD ($99 = better value) |
| Dealer wants market insights | Upgrade to STANDARD |
| Dealer wants historical data/API | Upgrade to PRO |

**Upgrade incentives:**
- First month of STANDARD at 50% off when upgrading from STARTER
- Click credits from current month applied to first subscription payment

### Open Questions - STARTER

1. **Click billing mechanics**:
   - Prepaid credits vs post-paid invoicing?
   - Minimum invoice threshold (e.g., $5 minimum)?
   - What happens if payment fails?

2. **Portal access**:
   - Full portal access or limited dashboard?
   - Can they see benchmarks but not detailed insights?

3. **Feed refresh frequency**:
   - Same as STANDARD (daily) or less frequent (weekly)?
   - Lower frequency = lower operational cost for us

4. **Conversion to paid**:
   - Auto-suggest upgrade at click thresholds?
   - Trial of STANDARD features to encourage upgrade?

5. **Competitive positioning**:
   - AmmoBuy charges $89.99 setup + $0.08/click
   - We charge $0 setup + $0.08/click = better deal
   - Should we undercut on per-click too ($0.06)?

---

## STANDARD Tier - $99/month

### Target Customer
Small to mid-size dealers who want clear visibility into how their prices compare to the market.

### Features

| Feature | Description | Implementation Status | Notes |
|---------|-------------|----------------------|-------|
| **Product listing inclusion** | Dealer SKUs appear on IronScout.ai consumer search | _[STATUS?]_ | Requires feed ingestion working |
| **Dealer feed ingestion** | Automated import of dealer product feeds (CSV/XML/JSON) | Implemented | DealerFeedIngest worker |
| **SKU matching** | Match dealer SKUs to canonical products | Implemented | DealerSkuMatch worker |
| **Market price benchmarks by caliber** | See average prices per caliber category | Implemented | DealerBenchmark worker |
| **Basic pricing insights** | Simple insights like "your price is X% above/below market" | _[STATUS?]_ | DealerInsight worker |
| **Email alerts for market changes** | Notifications when market prices shift significantly | _[STATUS?]_ | Notification system needed |
| **Monthly performance reports** | Summary of clicks, conversions, market position | _[STATUS?]_ | Report generation needed |
| **Email support** | Support via email | Operational | support@ironscout.ai |

### Open Questions - STANDARD

1. **Product listing inclusion**: How do we control which SKUs appear on IronScout.ai?
   - Do all matched SKUs automatically appear?
   - Is there a review/approval process?
   - Can dealers hide specific SKUs?

2. **Basic pricing insights**: What insights are included at STANDARD tier?
   - Price vs market average per caliber?
   - Simple "above/below market" indicator?
   - How often are insights generated?

3. **Email alerts for market changes**: What triggers an alert?
   - Threshold for "significant" price change?
   - Per-caliber or overall market?
   - Frequency caps to avoid spam?

4. **Monthly performance reports**: What metrics are included?
   - Click counts?
   - Conversion tracking?
   - Price position changes?
   - Format: Email digest? PDF? Dashboard?

---

## PRO Tier - $299/month

### Target Customer
Dealers who need faster, deeper market insight to react confidently to pricing changes.

### Features

| Feature | Description | Implementation Status | Notes |
|---------|-------------|----------------------|-------|
| **Everything in Standard** | All STANDARD features included | See above | - |
| **More frequent price monitoring** | Faster feed refresh and benchmark updates | _[STATUS?]_ | Define: how frequent? |
| **SKU-level price comparisons** | See how each SKU compares to identical/similar products | _[STATUS?]_ | Requires product matching |
| **Expanded market benchmarks** | More granular benchmarks (by brand, bullet type, etc.) | _[STATUS?]_ | Additional benchmark dimensions |
| **Actionable pricing insights and alerts** | Specific recommendations with action items | _[STATUS?]_ | Enhanced insight types |
| **Historical pricing context** | See price trends over time | _[STATUS?]_ | Price history data |
| **API access for inventory sync** | Programmatic access for inventory management | _[STATUS?]_ | API endpoints needed |
| **Phone and email support** | Priority support with phone option | Operational | Requires support line |

### Open Questions - PRO

1. **More frequent price monitoring**: Define "more frequent"
   - STANDARD refresh interval: ___?
   - PRO refresh interval: ___?
   - Real-time vs batch?

2. **SKU-level price comparisons**: How do we match SKUs across dealers?
   - UPC matching?
   - Fuzzy title matching?
   - Manual canonical product mapping?
   - What if no exact match exists?

3. **Expanded market benchmarks**: What additional dimensions?
   - By brand?
   - By bullet type (FMJ, JHP, etc.)?
   - By grain weight?
   - By retailer tier?

4. **Historical pricing context**: How much history?
   - 30 days? 90 days? 1 year?
   - Chart visualization in portal?
   - Export capability?

5. **API access**: What endpoints?
   - Read-only or read/write?
   - Rate limits?
   - Authentication method?
   - Documentation needed

6. **Phone support**: Implementation
   - Dedicated support line?
   - Hours of operation?
   - Who handles calls?

---

## FOUNDING Tier - Free (1 Year)

### Description
Early adopter program offering PRO features free for the first year. After year 1, dealers must choose to continue at PRO pricing ($299/month) or downgrade to STANDARD ($99/month).

### Features
- All PRO features
- 1 year free subscription
- Standard expiration and grace period logic after year 1

### Transition Handling

| Scenario | Action |
|----------|--------|
| Year 1 ends, dealer pays for PRO | Change tier to PRO, continue service |
| Year 1 ends, dealer downgrades to STANDARD | Change tier to STANDARD, disable PRO features |
| Year 1 ends, dealer doesn't respond | Enter grace period, then block access |

### Open Questions - FOUNDING

1. **Feature transition**: When downgrading FOUNDING → STANDARD, what happens to:
   - Historical data they accessed as PRO?
   - API integrations they built?
   - Saved reports/insights?

2. **Communication**: When do we start communicating about renewal?
   - Same 60/30/10/5 day schedule as regular expiration?
   - Special messaging for founding members?

---

## Feature Implementation Details

### Feed Ingestion Pipeline

```
Dealer Upload/URL → DealerFeedIngest → Parse & Validate → DealerSkuMatch →
  → DealerBenchmark → DealerInsight → Portal Display
```

**Status**: Core pipeline implemented
**Gaps**: _[List any gaps]_

### Benchmark Generation

| Benchmark Type | Dimensions | Tier | Status |
|----------------|------------|------|--------|
| Caliber average | Caliber | STANDARD | _[STATUS?]_ |
| Brand average | Caliber + Brand | PRO | _[STATUS?]_ |
| Bullet type average | Caliber + Bullet Type | PRO | _[STATUS?]_ |
| Historical trend | Time series | PRO | _[STATUS?]_ |

### Insight Types

| Insight Type | Description | Tier | Status |
|--------------|-------------|------|--------|
| Price vs market | "Your 9mm FMJ is 5% above market" | STANDARD | _[STATUS?]_ |
| Competitive position | "You're the 3rd cheapest for this SKU" | PRO | _[STATUS?]_ |
| Price trend alert | "Market price dropped 10% this week" | PRO | _[STATUS?]_ |
| Opportunity alert | "Consider lowering price on X to match market" | PRO | _[STATUS?]_ |

---

## Notification Capabilities

### Email Notifications

| Notification Type | Trigger | Recipients | Tier | Status |
|-------------------|---------|------------|------|--------|
| Subscription expiring | 60/30/10/5 days before | Account Owner, Billing | All | _[STATUS?]_ |
| Subscription expired | On expiration | Account Owner, Billing | All | _[STATUS?]_ |
| Market price alert | Price threshold exceeded | Subscribed contacts | STANDARD+ | _[STATUS?]_ |
| Feed processing complete | Feed run finishes | Primary contact | All | _[STATUS?]_ |
| Feed error | Feed fails | Primary, Technical | All | _[STATUS?]_ |
| Monthly report | 1st of month | Account Owner | All | _[STATUS?]_ |

### In-Portal Notifications

| Notification Type | Location | Tier | Status |
|-------------------|----------|------|--------|
| Subscription warning banner | Dashboard top | All | Implemented |
| New insight badge | Insights page | All | _[STATUS?]_ |
| Feed status alerts | Feed page | All | _[STATUS?]_ |

---

## Support Channels

| Channel | Tier | Hours | Status |
|---------|------|-------|--------|
| Email (support@ironscout.ai) | All | Business hours | Operational |
| Phone | PRO only | Business hours | _[STATUS?]_ |
| In-app chat | Future | - | Not implemented |

---

## API Access (PRO Only)

### Proposed Endpoints

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/dealer/skus` | GET | List dealer's SKUs | _[STATUS?]_ |
| `/api/dealer/benchmarks` | GET | Get market benchmarks | _[STATUS?]_ |
| `/api/dealer/insights` | GET | Get pricing insights | _[STATUS?]_ |
| `/api/dealer/feed/trigger` | POST | Trigger feed refresh | _[STATUS?]_ |
| `/api/dealer/analytics` | GET | Get click/conversion data | _[STATUS?]_ |

### Authentication
- Method: _[API Key? JWT? OAuth?]_
- Rate limits: _[TBD]_

---

## Reporting Capabilities

### Monthly Performance Report (All Tiers)

| Metric | STANDARD | PRO |
|--------|----------|-----|
| Total impressions | Yes | Yes |
| Total clicks | Yes | Yes |
| Click-through rate | Yes | Yes |
| Total conversions | Yes | Yes |
| Revenue attribution | No | Yes |
| SKU-level breakdown | No | Yes |
| Competitor comparison | No | Yes |
| Price position trends | Basic | Detailed |

---

## Feature Comparison Matrix

| Feature | STARTER | STANDARD | PRO | FOUNDING |
|---------|---------|----------|-----|----------|
| **Pricing** | | | | |
| Monthly fee | $0 | $99 | $299 | $0 (1 yr) |
| Per-click fee | $0.08 | $0 | $0 | $0 |
| Setup fee | $0 | $0 | $0 | $0 |
| **Product Listing** | | | | |
| SKUs on IronScout.ai | Yes | Yes | Yes | Yes |
| **Feed Management** | | | | |
| Feed ingestion | Yes | Yes | Yes | Yes |
| SKU matching | Yes | Yes | Yes | Yes |
| Feed refresh frequency | Weekly? | Daily | 4 hours | 4 hours |
| **Analytics** | | | | |
| Click tracking | Yes | Yes | Yes | Yes |
| Basic click analytics | Yes | Yes | Yes | Yes |
| Conversion tracking | No | Yes | Yes | Yes |
| **Benchmarks** | | | | |
| Caliber-level benchmarks | No | Yes | Yes | Yes |
| Brand-level benchmarks | No | No | Yes | Yes |
| Bullet type benchmarks | No | No | Yes | Yes |
| **Insights** | | | | |
| Basic price insights | No | Yes | Yes | Yes |
| SKU-level comparisons | No | No | Yes | Yes |
| Actionable recommendations | No | No | Yes | Yes |
| **Historical Data** | | | | |
| Price history access | None | 30 days | 365 days | 365 days |
| Trend charts | No | No | Yes | Yes |
| **Alerts** | | | | |
| Subscription alerts | N/A | Yes | Yes | Yes |
| Market price alerts | No | Basic | Advanced | Advanced |
| **Reporting** | | | | |
| Monthly reports | No | Basic | Detailed | Detailed |
| Export capabilities | No | No | Yes | Yes |
| **API** | | | | |
| API access | No | No | Yes | Yes |
| **Support** | | | | |
| Email support | Yes | Yes | Yes | Yes |
| Phone support | No | No | Yes | Yes |

---

## Outstanding Decisions

### 1. Feed Refresh Frequency

**Question**: What's the refresh interval for each tier?

| Tier | Proposed Interval |
|------|-------------------|
| STARTER | Once weekly |
| STANDARD | Once daily |
| PRO | Every 4 hours |

**Decision**: _[PENDING]_

---

### 2. Historical Data Retention

**Question**: How much price history does each tier get?

| Tier | Proposed History |
|------|------------------|
| STARTER | None (current only) |
| STANDARD | 30 days |
| PRO | 365 days |

**Decision**: _[PENDING]_

---

### 3. API Rate Limits

**Question**: What rate limits for PRO API access?

**Proposed**:
- 1000 requests/day
- 100 requests/minute burst

**Decision**: _[PENDING]_

---

### 4. Report Format

**Question**: How are monthly reports delivered?

**Options**:
- A) Email with inline content
- B) Email with PDF attachment
- C) Dashboard-only (view in portal)
- D) All of the above

**Decision**: _[PENDING]_

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024-12-14 | STANDARD $99/mo, PRO $299/mo | Two tiers based on market insight depth |
| 2024-12-14 | FOUNDING = 1 year free PRO | Incentivize early adoption, converts to paid |
| 2024-12-19 | STARTER tier $0 + $0.08/click | Compete with AmmoBuy, low barrier entry for small dealers |
| | | |

---

## Implementation Priorities

### Phase 0 - STARTER Tier (Low Barrier Entry)
1. Click tracking and billing infrastructure
2. Stripe usage-based billing integration
3. STARTER-specific portal dashboard (clicks only)
4. Fraud prevention (rate limiting, bot detection)
5. Monthly click invoice generation

### Phase 1 - Core Value (MVP)
1. Feed ingestion and SKU matching
2. Basic caliber benchmarks
3. Product listing on IronScout.ai
4. Basic pricing insights
5. Subscription management

### Phase 2 - PRO Differentiation
1. Enhanced benchmarks (brand, bullet type)
2. SKU-level price comparisons
3. Historical pricing data
4. API access

### Phase 3 - Engagement
1. Email notification system
2. Monthly reports
3. Advanced insights and recommendations
4. Phone support infrastructure

---

## Schema Changes Required

### STARTER Tier Support

The `DealerTier` enum needs to be updated to support STARTER:

```prisma
enum DealerTier {
  STARTER     // Pay-per-click, no monthly fee
  STANDARD    // $99/mo - basic features
  PRO         // $299/mo - full features
  FOUNDING    // PRO features free for 1 year
}
```

### Click Billing Fields

Add fields to `Dealer` model for usage-based billing:

```prisma
model Dealer {
  // ... existing fields ...

  // STARTER tier billing
  clickBalance        Int       @default(0)    // Prepaid click credits (if using prepaid model)
  monthlyClickCount   Int       @default(0)    // Clicks this billing period
  lastClickReset      DateTime?               // When click count was last reset
  stripeMeteredSubId  String?                 // Stripe metered subscription ID (for usage billing)
}
```

### Click Aggregation Table (Optional)

For billing accuracy and dispute resolution:

```prisma
model DealerClickSummary {
  id          String   @id @default(cuid())
  dealerId    String
  dealer      Dealer   @relation(fields: [dealerId], references: [id])
  periodStart DateTime
  periodEnd   DateTime
  totalClicks Int
  uniqueClicks Int     // Deduplicated clicks
  invoiceId   String?  // Stripe invoice ID
  invoicedAt  DateTime?

  @@unique([dealerId, periodStart])
}
```

---

## Competitive Analysis

### AmmoBuy (ammobuy.com)

**Source**: https://www.ammobuy.com/listing (December 2025)

**Pricing Model**: Setup fee + per-click

| Fee Type | Amount | Notes |
|----------|--------|-------|
| One-time setup fee | $89.99 | Covers feed integration |
| Per-click fee | $0.08 | Per unique click to dealer site |

**Feed Requirements**:
- XML feed preferred
- Required fields: product description, URL, manufacturer, caliber, casing, grain, projectile type, price, quantity, availability
- Optional fields: velocity (fps), shotgun specs (shot size, shell length), thumbnail image
- Can work with non-standard feeds

**Fee Reduction Options**:
- Join affiliate networks (e.g., AvantLink) offering sales commissions
- Purchase advertising slots on platform

**Analysis**:
- Pure pay-per-click model with no monthly subscription
- Low barrier to entry ($89.99 one-time)
- Cost scales with traffic/success
- No market insights, benchmarking, or analytics included
- Dealer gets listing only, not business intelligence

**IronScout Differentiation**:
| Capability | AmmoBuy | IronScout |
|------------|---------|-----------|
| Product listing | Yes | Yes |
| Feed ingestion | XML only | CSV, XML, JSON |
| Pricing model | Setup + per-click | Monthly subscription |
| Market benchmarks | No | Yes (STANDARD+) |
| Pricing insights | No | Yes (STANDARD+) |
| SKU-level comparisons | No | Yes (PRO) |
| Historical data | No | Yes (PRO) |
| API access | No | Yes (PRO) |
| Business intelligence | No | Yes |

**Pricing Comparison** (estimated monthly cost):

| Monthly Clicks | AmmoBuy Cost | IronScout STANDARD | IronScout PRO |
|----------------|--------------|--------------------| --------------|
| 500 | $40 + setup* | $99 | $299 |
| 1,000 | $80 + setup* | $99 | $299 |
| 2,500 | $200 + setup* | $99 | $299 |
| 5,000 | $400 + setup* | $99 | $299 |
| 10,000 | $800 + setup* | $99 | $299 |

*$89.99 setup fee applies to month 1 only

**Breakeven Analysis**:
- IronScout STANDARD ($99/mo) breaks even vs AmmoBuy at ~1,240 clicks/month
- IronScout PRO ($299/mo) breaks even vs AmmoBuy at ~3,740 clicks/month
- High-traffic dealers save significantly with IronScout flat-rate pricing
- Low-traffic dealers may prefer AmmoBuy's pay-per-click model

**Strategic Implications**:
1. Our flat-rate model is more attractive for established dealers with consistent traffic
2. Consider a lower-tier or pay-per-click option for small/new dealers
3. Our value prop must emphasize business intelligence (benchmarks, insights, API) that AmmoBuy lacks
4. The $89.99 setup fee validates that dealers expect some onboarding cost

---

### AmmoSeek (ammoseek.com)

**Status**: Research needed

**Known Info**:
- Major competitor in consumer ammo search
- Dealer listing options available
- Pricing model: _[TO BE RESEARCHED]_

---

### WikiArms (wikiarms.com)

**Status**: Research needed

**Known Info**:
- Consumer ammo price comparison
- Dealer listing options: _[TO BE RESEARCHED]_
- Pricing model: _[TO BE RESEARCHED]_

---

### Gun.Deals (gun.deals)

**Status**: Research needed

**Known Info**:
- Broader firearms deals aggregator
- Includes ammunition
- Dealer listing options: _[TO BE RESEARCHED]_

---

*Last updated: December 2025*

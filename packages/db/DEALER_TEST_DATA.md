# Dealer Portal Test Data

This document describes the comprehensive test data set for the IronScout Dealer Portal.

## Overview

The test data seed (`seed-dealer-portal-test.ts`) creates a complete dataset to test all dealer portal features including:

- **Authentication**: Multiple dealers with different statuses and tiers
- **Feed Management**: Feeds with various types and health statuses
- **Feed Runs**: Historical run data with success/warning/failure outcomes
- **SKU Management**: Products with different mapping states and review flags
- **Pricing Insights**: AI-powered recommendations of all types
- **Analytics**: Click events and conversion tracking (pixel events)
- **Admin Features**: Pending approvals, suspensions, audit logs

## Running the Seed

```bash
# From the packages/db directory:
pnpm db:seed-dealer-test

# Or from root:
pnpm --filter @ironscout/db db:seed-dealer-test
```

## Test Credentials

### Admin Account
| Field | Value |
|-------|-------|
| Email | `admin@ironscout.ai` |
| Password | `admin123` |

### Dealer Accounts

All dealer accounts use the password: `password123`

| Status | Tier | Email | Use Case |
|--------|------|-------|----------|
| ACTIVE | FOUNDING | `active@ammodeals.com` | Full-featured dealer with all data |
| ACTIVE | PRO | `premium@bulletbarn.com` | Premium dealer with analytics |
| ACTIVE | BASIC | `basic@gunsupply.com` | Basic tier, no pixel tracking |
| ACTIVE | FOUNDING | `feedissues@rangegear.com` | Dealer with failed feed |
| ACTIVE | ENTERPRISE | `enterprise@bigammo.com` | Enterprise tier, 500 SKUs |
| PENDING | FOUNDING | `pending1@newdealer.com` | Pending approval (verified email) |
| PENDING | FOUNDING | `pending2@freshstart.com` | Pending approval (unverified email) |
| SUSPENDED | BASIC | `suspended@badactor.com` | Suspended dealer |

## Test Data Coverage

### Dealers (8 total)

| Status | Count | Description |
|--------|-------|-------------|
| ACTIVE | 5 | Various tiers and configurations |
| PENDING | 2 | One with verified email, one without |
| SUSPENDED | 1 | For testing reactivation flow |

### Dealer Tiers

| Tier | Count | Features Enabled |
|------|-------|------------------|
| FOUNDING | 4 | Free 12-month program |
| BASIC | 2 | Limited features |
| PRO | 1 | Full features, paid |
| ENTERPRISE | 1 | Custom, 30-min feed schedule |

### Feeds & Feed Runs

| Feed Status | Count | Description |
|-------------|-------|-------------|
| HEALTHY | 3 | Successfully running feeds |
| WARNING | 1 | Feed with non-fatal issues |
| FAILED | 2 | Connection/parsing failures |

Each feed has 5 historical runs to test:
- Feed run history display
- Status badge rendering
- Error message display
- Duration and metrics

### SKUs & Mapping States

| Mapping Confidence | Description |
|-------------------|-------------|
| HIGH | UPC + brand + pack size match |
| MEDIUM | Attribute match without UPC |
| LOW | Partial match, flagged for review |
| NONE | Cannot map, needs manual review |

SKU test scenarios:
- ✅ Mapped to canonical SKUs
- ⚠️ Needs review flag set
- ❌ Out of stock
- 🔗 Linked to benchmarks

### Insights (All Types)

| Type | Description |
|------|-------------|
| OVERPRICED | Dealer price above market median |
| UNDERPRICED | Dealer price below market (opportunity) |
| STOCK_OPPORTUNITY | High demand, dealer out of stock |
| ATTRIBUTE_GAP | Missing data preventing benchmarks |

### Analytics Data

**Click Events** (30 days of data):
- 5-50 clicks per day per active dealer
- Session tracking
- SKU attribution
- User agent and referrer data

**Pixel Events** (conversions):
- 0-5 orders per day
- Order values: $50-500
- SKU-level attribution
- Only for pixel-enabled dealers

### Canonical SKUs (22 products)

Coverage by caliber:
- 9mm Luger (5 variants)
- 5.56 NATO / .223 Rem (4 variants)
- .45 ACP (3 variants)
- .308 Win / 7.62x39 (3 variants)
- .22 LR (2 variants)
- 12 Gauge (2 variants)
- 300 AAC Blackout (2 variants)

### Benchmarks

All canonical SKUs have benchmark data with:
- Median, min, max, avg prices
- Seller count (3-15)
- Confidence levels (HIGH/MEDIUM/NONE)
- Data point counts

## Feature Testing Guide

### 1. Authentication Flow

```
Test Login:
1. Go to /login
2. Enter dealer credentials
3. Verify redirect based on status:
   - ACTIVE → /dashboard
   - PENDING → /pending
   - SUSPENDED → /suspended
```

### 2. Dashboard Verification

```
For active@ammodeals.com:
- Total SKUs: ~50 (limited in test data)
- Active SKUs: ~42 (85% in stock)
- Needs Review: ~15 (30%)
- Active Insights: 8
- Feed Status: HEALTHY
```

### 3. Feed Management

```
Test scenarios:
1. active@ammodeals.com - Healthy URL feed
2. premium@bulletbarn.com - Healthy Auth URL
3. basic@gunsupply.com - FTP with warnings
4. feedissues@rangegear.com - Failed SFTP
```

### 4. SKU Management

```
Filter tests:
- All SKUs
- Needs Review
- Unmapped
- Mapped
- Out of Stock

Search tests:
- By title
- By UPC
- By dealer SKU
```

### 5. Insights

```
Verify all insight types are present:
- Red "Above Market" cards
- Green "Below Market" cards
- Blue "Stock Opportunity" cards
- Yellow "Missing Data" cards

Test dismiss functionality:
- Dismiss permanently
- Dismiss for 7 days
```

### 6. Analytics

```
For active@ammodeals.com:
- Click data for 30 days
- Conversion data for 30 days
- Top clicked products table
- Revenue attribution panel
```

### 7. Admin Functions

```
Login as admin@ironscout.ai:
1. View /admin/dealers
2. See pending dealers (2)
3. Approve pending1@newdealer.com
4. Reactivate suspended@badactor.com
5. Suspend an active dealer
6. View audit logs
```

## Data Relationships

```
Dealer
├── DealerFeed
│   └── DealerFeedRun[] (5 per feed)
├── DealerSku[] (up to 50 per dealer)
│   └── CanonicalSku? (70% mapped)
├── DealerInsight[] (up to 8 per dealer)
├── ClickEvent[] (30 days)
├── PixelEvent[] (if pixel enabled)
└── DealerNotificationPref
```

## Clearing Test Data

The seed script automatically clears existing dealer portal data before seeding. Only dealer-related tables are affected:

```
Tables cleared:
- click_events
- pixel_events
- dealer_insights
- pricing_snapshots
- benchmarks
- dealer_skus
- dealer_feed_runs
- dealer_feeds
- dealer_notification_prefs
- admin_audit_logs
- dealers
- canonical_skus
```

Consumer-facing data (products, prices, retailers, users) is NOT affected.

## Compatibility Notes

- Compatible with seed-ammo-data.ts (no conflicts)
- Compatible with seed-retailers.ts (no conflicts)
- Does not affect consumer Users table (separate from Dealers)
- Admin user is created via upsert (won't duplicate)

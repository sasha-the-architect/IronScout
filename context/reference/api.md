# API Reference

This document is a minimal, v1-safe API reference for IronScout. It is written for coding agents and implementers.

It is intentionally conservative:
- It documents what endpoints exist and what they should return.
- It does not over-specify fields that may vary.
- It encodes trust and enforcement requirements as MUST statements.

If you want machine-level precision, add `openapi.yaml` and treat it as the source of truth.

---

## Core Principles

- Tier enforcement, if reintroduced, must be server-side (ADR-002).
- Retailer visibility is filtered at query time (ADR-005) using eligibility + listing entitlement; subscription status is not a consumer visibility gate.
- v1: Retailers may have no Merchant relationship; listing applies only when a relationship exists.
- Price history is append-only (ADR-004).
- AI output is assistive only (ADR-003).
- Fail closed on ambiguity (ADR-009).

---

## Authentication

### Consumer
Expected: session or JWT derived from the consumer app auth.

Server requirements:
- API must determine user identity from verified auth context.
- API must not accept `X-User-Id` or similar headers as truth.
- Consumer queries MUST NOT read or use subscription state; visibility uses eligibility and listing/status only when a Merchant relationship exists.

### Admin
Expected: admin portal auth.
Admin actions must be audited.

---

## Error Semantics

All endpoints should return:
- `401` for unauthenticated
- `403` for authenticated but unauthorized or ineligible
- `400` for validation errors (bad filters, invalid payload)
- `404` for missing resources
- `429` for rate limiting where applicable
- `500` for unexpected failures (do not leak secrets)

Errors should be JSON:
- `code` (stable identifier)
- `message` (conservative)
- optional `details` (non-sensitive)

---

## Rate Limiting

Authentication endpoints are rate-limited to prevent brute-force attacks.

### Limits

| Endpoint | Limit | Block Duration |
|----------|-------|----------------|
| POST /auth/signin | 5/min per IP | 60 seconds |
| POST /auth/signup | 3/min per IP | 120 seconds |
| POST /auth/refresh | 30/min per IP | 60 seconds |
| POST /auth/oauth/* | 10/min per IP | 60 seconds |

### Response Headers

Rate-limited endpoints include:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when window resets

When blocked (429):
- `Retry-After`: Seconds until requests are allowed

### Implementation

- Uses Redis for distributed state (works across API instances)
- Fail-open design: Redis errors allow requests through (logged)
- Metrics tracked for observability via `/api/admin/rate-limits`

---

## Search

### GET /search

Purpose:
- Text + filter search returning canonical product groups with offers.

Query params (typical):
- `q` free text
- structured filters like `caliber`, `brand`, `grain`, `case`, `bulletType`
- paging: `page`, `pageSize`
- sorting: `sort`

Response (conceptual):
- `results[]`: canonical products
  - `product` (canonical fields)
  - `offers[]` (eligible Retailer offers)
  - optional `historySummary` (uniform)
- `meta`: paging, query interpretation (optional)

MUST:
- Enforce Retailer eligibility + listing entitlement at query time (ADR-005 predicate).
- Enforce uniform response shaping in v1.
- Avoid recommendation language or "deal verdict" fields in response for v1.

---

## Products

### GET /products/:id

Purpose:
- Product detail view.

Response (conceptual):
- canonical product fields
- current offers
- history (uniform)
- related products (optional)

MUST:
- Never include ineligible or unlisted Retailer offers.
- If history is missing, do not imply completeness.

---

## Price History

### GET /products/:id/history

Purpose:
- Time series or buckets of historical prices.

Response:
- time series points or aggregated bins
- coverage metadata (optional)

MUST:
- Respect uniform history depth limits.
- Preserve append-only semantics (no rewriting history via API).

---

## Saved Items (ADR-011 Unified API)

Per ADR-011, watchlist and alerts are unified under "Saved Items". A single save action
creates both tracking and notification rules.

### GET /api/saved-items
List all saved items for authenticated user.

Response:
```json
{
  "items": [
    {
      "id": "...",
      "productId": "...",
      "name": "...",
      "brand": "...",
      "caliber": "...",
      "price": 24.99,
      "inStock": true,
      "savedAt": "2026-01-13T...",
      "notificationsEnabled": true,
      "priceDropEnabled": true,
      "backInStockEnabled": true,
      "minDropPercent": 5,
      "minDropAmount": 5.0,
      "stockAlertCooldownHours": 24
    }
  ],
  "_meta": {
    "itemCount": 10,
    "itemLimit": -1,
    "canAddMore": true
  }
}
```

### POST /api/saved-items/:productId
Save an item (idempotent). Creates watchlist entry and alert rules in single transaction.

Returns 201 if new, 200 if already saved.

### DELETE /api/saved-items/:productId
Remove saved item (soft delete). Preserves preferences for potential resurrection.

### PATCH /api/saved-items/:productId
Update notification preferences for a saved item.

Payload:
```json
{
  "notificationsEnabled": true,
  "priceDropEnabled": true,
  "backInStockEnabled": true,
  "minDropPercent": 5,
  "minDropAmount": 5.0,
  "stockAlertCooldownHours": 24
}
```

Validation:
- `minDropPercent`: 0-100
- `minDropAmount`: >= 0
- `stockAlertCooldownHours`: 1-168 (1 hour to 1 week)

### GET /api/saved-items/history
Get alert notification history for authenticated user.

Query params:
- `limit`: max items per page (default 50, max 100)
- `offset`: pagination offset (default 0)

Response:
```json
{
  "history": [
    {
      "id": "...",
      "type": "PRICE_DROP",
      "productId": "...",
      "productName": "...",
      "triggeredAt": "2026-01-13T...",
      "reason": "Price dropped from $25 to $20",
      "metadata": {
        "oldPrice": 25.0,
        "newPrice": 20.0,
        "retailer": "..."
      }
    }
  ],
  "_meta": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

MUST:
- Validate server-side.
- Enforce alert limits and cadence (uniform for all users in v1).
- Alert evaluation must not trigger from ineligible or unlisted Retailer inventory.
- Fail closed on ambiguous eligibility.

---

## Legacy Alerts/Watchlist Endpoints (Deprecated)

The following endpoints are deprecated and return 410 Gone:
- `PUT /api/alerts/:id`
- `DELETE /api/alerts/:id`
- Watchlist collection endpoints

Use the unified `/api/saved-items/*` endpoints instead.

---

## Dashboard (v5 Status-Oriented)

The dashboard is a status-oriented monitoring surface (ADR-020). It reports the
state of what a user is tracking and recent changes, without recommendations.

### GET /api/dashboard/state
Get resolved dashboard state for authenticated user.

Response:
```json
{
  "state": "HEALTHY",
  "watchlistCount": 12,
  "alertsConfigured": 10,
  "alertsMissing": 2,
  "priceDropsThisWeek": 3
}
```

States (if still used in implementation):
- `BRAND_NEW`: 0 saved items
- `NEW`: 1-4 saved items
- `NEEDS_ALERTS`: 5+ items, some without alerts configured
- `HEALTHY`: 5+ items, all alerts active
- `RETURNING`: 5+ items, active alerts with recent notifications
- `POWER_USER`: 7+ items, active alerts with frequent notifications

### GET /api/dashboard/watchlist-preview
Get limited preview of saved items for dashboard display.

Query params:
- `limit`: max items (default 3, max 10)

Response: Subset of saved items with prices.

### GET /api/dashboard/pulse
Get market pulse data for user's saved calibers.

Query params:
- `windowDays`: 1 or 7 (default 7)

Response:
```json
{
  "calibers": [
    {
      "caliber": "9mm",
      "currentAvg": 0.28,
      "trend": "DOWN",
      "trendPercent": -5.2,
      "priceContext": "LOWER_THAN_RECENT",
      "contextMeta": { "historicalAvg": 0.30 }
    }
  ],
  "_meta": {
    "calibersLimit": -1,
    "windowDays": 7
  }
}
```

Trend values: `UP` (>3%), `DOWN` (<-3%), `STABLE` (within ±3%)

---

## Admin

Admin endpoints may live in `apps/admin` route handlers or `apps/api` under `/admin/*`.

### GET /admin/rate-limits
Get rate limit metrics for all auth endpoints.

Response:
- `date`: The date for metrics
- `endpoints`: Per-endpoint metrics (signin, signup, refresh, oauth)
  - `totalRequests`, `blockedRequests`, `blockRate`
  - `topBlockedIps[]`: Top 10 blocked IPs with counts
- `summary`: Aggregate totals

### GET /admin/rate-limits/:endpoint
Get metrics for a specific endpoint.

### GET /admin/rate-limits/status/:ip
Check current rate limit status for a specific IP.

### DELETE /admin/rate-limits/:ip
Clear rate limits for a specific IP (unblock).

MUST:
- Write audit logs for every mutation.
- Impersonation must not bypass enforcement.
- Listing/eligibility overrides must be explicit, auditable, and independent of subscription status.

---

## AI Search Endpoints (If Exposed)

If AI-related endpoints exist (embeddings, explanation generation), they must be:
- safe-language
- removable without breaking search

Avoid exposing raw model outputs.

---

## TODO: Convert to OpenAPI

Recommended next step:
- Add `openapi.yaml` for the endpoints you actually ship in v1.
- Treat it as source of truth for agents and clients.

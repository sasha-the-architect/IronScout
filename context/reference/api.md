# API Reference

This document is a minimal, v1-safe API reference for IronScout. It is written for coding agents and implementers.

It is intentionally conservative:
- It documents what endpoints exist and what they should return.
- It does not over-specify fields that may vary.
- It encodes trust and enforcement requirements as MUST statements.

If you want machine-level precision, add `openapi.yaml` and treat it as the source of truth.

---

## Core Principles

- All tier enforcement is server-side (ADR-002).
- Dealer visibility is filtered at query time (ADR-005).
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

### Dealer
Expected: dealer portal auth.
Dealer endpoints must not leak cross-dealer data.

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
- sorting: `sort` (limited by tier)

Response (conceptual):
- `results[]`: canonical products
  - `product` (canonical fields)
  - `offers[]` (retailer + eligible dealer offers)
  - optional `historySummary` (tier-shaped)
- `meta`: paging, query interpretation (optional)

MUST:
- Enforce dealer eligibility at query time.
- Enforce tier shaping at response time.
- Avoid recommendation language or “deal verdict” fields in response for v1.

---

## Products

### GET /products/:id

Purpose:
- Product detail view.

Response (conceptual):
- canonical product fields
- current offers
- history (tier-shaped)
- related products (optional)

MUST:
- Never include ineligible dealer offers.
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
- Respect tier depth limits.
- Preserve append-only semantics (no rewriting history via API).

---

## Alerts

### POST /alerts
Create an alert.

Payload (conceptual):
- `productId` or query spec
- threshold rules (price below, in-stock)
- notification preferences

MUST:
- Validate server-side.
- Enforce tier limits (max alerts, cadence).

### GET /alerts
List alerts for authenticated user.

### DELETE /alerts/:id
Delete an alert (owner only).

Alert evaluation (system behavior):
- Must not trigger from ineligible dealer inventory.
- Must fail closed on ambiguous eligibility.

---

## Watchlists

### POST /watchlist
Add product to watchlist.

### GET /watchlist
List watchlist.

### DELETE /watchlist/:id
Remove item.

---

## Dealer (Portal-facing API)

These may live inside `apps/dealer` route handlers or in `apps/api` under `/dealer/*`. Either is fine. Contracts must hold.

### POST /dealer/feeds
Create/update a feed configuration.

### GET /dealer/feeds
List feeds and health.

### POST /dealer/feeds/:id/quarantine
Quarantine a feed.

MUST:
- Never expose other dealers’ data.
- Enforce subscription status for eligibility-related actions.

---

## Admin

Admin endpoints may live in `apps/admin` route handlers or `apps/api` under `/admin/*`.

### POST /admin/dealers/:id/suspend
Suspend dealer (removes consumer visibility).

### POST /admin/dealers/:id/reactivate
Reactivate dealer.

### POST /admin/dealers/:id/subscription
Change tier/status/billing method.

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

---

## AI Search Endpoints (If Exposed)

If AI-related endpoints exist (embeddings, explanation generation), they must be:
- gated by tier
- safe-language
- removable without breaking search

Avoid exposing raw model outputs.

---

## TODO: Convert to OpenAPI

Recommended next step:
- Add `openapi.yaml` for the endpoints you actually ship in v1.
- Treat it as source of truth for agents and clients.

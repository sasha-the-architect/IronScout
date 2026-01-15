# Quarantine Detail v1

## Goal

Provide an admin-only detail view for quarantined records that explains why an
item was quarantined and enables safe, auditable recovery actions without
breaking trust boundaries or append-only history.

## Non-Goals

- No direct edits to canonical products from quarantine.
- No forced promotion of quarantined items.
- No deletion or mutation of historical price records.
- No consumer-facing UI changes.

## Scope

Applies to:
- Admin portal quarantine list and a new detail view.
- Admin API endpoints for quarantine detail and actions.

Does not apply to:
- Consumer UI.
- Resolver scoring logic.
- Product creation flows outside resolver/admin review queue.

## Decision References

- ADR-004 Append-Only Price History
- ADR-005 Retailer Visibility Determined at Query Time
- ADR-009 Fail Closed on Ambiguity
- ADR-010 Ops Without Code Changes
- ADR-019 Product Resolver Architecture

## Key Requirements

1) Detail view must show raw feed row, normalized fields, and reason code.
2) Actions must be auditable and must not bypass resolver safeguards.
3) Reprocessing must require the item to still be quarantined.
4) No action may mutate price history or canonical products directly.

## Data Model

Uses existing `quarantined_records` and related entities. No schema changes.

### Source of Fields (Explicit)

`quarantined_records` fields:
- record: id, feedType, status, createdAt, updatedAt, feedId, runId, retailerId,
  sourceId, matchKey, rawData, parsedFields, blockingErrors

Derived/related fields (no new columns):
- reasonCode: derived from `blockingErrors` (use primary error or first entry).
- identityKey: `matchKey` (already stored).
- idType/idValue: derived from `matchKey` format (e.g. `URL_HASH:<hash>`,
  `NETWORK_ITEM_ID:<id>`, `SKU:<id>`). If parsing fails, show "unknown".
- normalized fields: derived from `parsedFields` if present, otherwise best-effort
  extraction from `rawData`.
- links: derived by joining through `product_links` using the source product
  identity (if a source product exists). This is optional and may be null.

### Parsed Fields Structure (Expected)

`parsedFields` should include (when available):
```
{
  name,
  brandNorm,
  caliberNorm,
  grain,
  packCount,
  upcNorm,
  urlNorm,
  price,
  inStock,
  identity: { type, value }
}
```

If `parsedFields` is missing, the detail view must still render using `rawData`
and show missing derived fields as `unknown`.

## API Endpoints (or Server Actions)

Admin UI currently prefers server actions. Either REST routes or server actions
are acceptable, but must be consistent across the admin app. If server actions
are used, they should mirror the behaviors below.

### GET /api/admin/quarantine/:id

Returns:
```
{
  record: { ... },
  raw: { ... },
  normalized: { ... },
  identity: { ... },
  errors: [ ... ],
  links: { ... }
}
```

### POST /api/admin/quarantine/:id/ack

Body:
```
{ "note": "string" }
```

Behavior:
- Marks record as reviewed/acknowledged by setting status to `DISMISSED`.
- Does not promote or reprocess the record.
- Writes admin audit log entry.

### POST /api/admin/quarantine/:id/reprocess

Behavior:
- Enqueues reprocess using the correct pipeline for `feedType`.
  - AFFILIATE: re-parse from `rawData` and attempt to create/update
    `source_products` + resolver link. Use `matchKey` for idempotent lookup.
  - RETAILER: re-parse from `rawData` and attempt to create/update
    `retailer_skus` + resolver link. Use `matchKey` for idempotent lookup.
- Guard: only if status is still `QUARANTINED`.
- If a downstream record already exists and resolves, mark `RESOLVED`.
- Writes admin audit log entry.

### POST /api/admin/quarantine/:id/create-alias

Body:
```
{ "aliasNorm": "string", "canonicalNorm": "string", "sourceType": "string" }
```

Behavior:
- Calls the existing brand alias creation flow (shared normalization + validation).
- Does not directly promote the quarantined record.
- Writes admin audit log entry.

## UI

### List

Add a "View" action per row to open the detail page.

### Detail Page Sections

1) Summary: feed, runId, status, reason code, timestamps.
2) Raw Row: original feed fields (collapsible).
3) Normalized Fields: parsed values used by resolver.
4) Identity: identityKey, URL hash, UPC presence.
5) Actions: Acknowledge, Reprocess, Create Brand Alias (if applicable).

## Observability

Logs:
- QUARANTINE_DETAIL_VIEWED (admin user, record id)
- QUARANTINE_ACKNOWLEDGED (admin user, record id, note)
- QUARANTINE_REPROCESS_ENQUEUED (admin user, record id)
- QUARANTINE_ALIAS_CREATED (admin user, record id, alias id)
- QUARANTINE_REPROCESS_FAILED (admin user, record id, error)
- QUARANTINE_ALIAS_CREATE_FAILED (admin user, record id, error)
- QUARANTINE_ACTION_UNAUTHORIZED (admin user, record id, action)

Metrics (optional):
- quarantine_actions_total{action="ack|reprocess|create_alias"}

## Failure Modes

- Missing record: return 404 with audit log of attempted access.
- Reprocess on non-quarantined item: return 409.
- Alias creation fails validation: return 400 with validation reason.
- Concurrent actions: return 409 if status has changed since load.

## Test Plan

Unit:
- Detail endpoint returns raw + normalized fields.
- Reprocess rejects non-quarantined or dismissed status.
- Alias creation is validated and audited.
- Ack sets status to DISMISSED and does not promote.
- Idempotent ack (repeat call) returns 200 with no additional change.

Integration:
- Quarantined item appears in list and detail view.
- Reprocess enqueues resolver job and leaves record unchanged.
- Concurrent ack + reprocess results in a single status transition.

## Idempotency

- Ack: safe to repeat; only the first call changes status.
- Reprocess: dedupe by `matchKey` + `runId` if possible; otherwise allow only one
  in-flight reprocess per record.
- Create alias: rely on alias uniqueness rules; duplicate alias attempts return
  a validation error.

## Acceptance Criteria

- Admin can view quarantined record details and see why it was quarantined.
- Admin can acknowledge or reprocess without bypassing resolver safeguards.
- All actions are audited.
- No changes to canonical product or price history are performed directly.

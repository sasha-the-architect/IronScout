# ADR-011A: Intent-Ready Saved Items (WatchlistItem Resolver Seam)

## Status
Proposed (Amendment to ADR-011)

## Extends
ADR-011: Unified Saved Items (Collapse Watchlist + Alerts)

## Scope
Internal refactor + schema extensions. **No user-visible behavior changes.**

---

## 1) Naming and Terminology (BLOCKER resolved)

**Confirmed:** Schema uses `watchlist_items` with grouping via `watchlist_collections`.

**Locked terminology alignment with ADR-011:**
- **User-facing:** “Saved Item” (per ADR-011)
- **Internal/domain + DB:** `WatchlistItem` (matches `watchlist_items`)
- **API DTO:** `SavedItemDTO` (per ADR-011, unchanged)

Rule:
- UI and product docs say **Saved Items**.
- Code and schema say **WatchlistItem**.
- API surface continues returning **SavedItemDTO**.

---

## 2) Goals

Create seams for future intent types (e.g. saved searches) while keeping v1 behavior (SKU saves) identical.

---

## 3) Non-goals (hard constraints)

- No saved search UI
- No multi-product matching logic in v1
- No changes to alert evaluation rules
- No endpoint removals or breaking client changes
- No N+1 regressions

---

## 4) Schema changes (complete and safe)

### 4.1 Add intent fields

Add to `watchlist_items`:

- `intent_type TEXT NOT NULL DEFAULT 'SKU'`
- `query_snapshot JSONB NULL`
- `deleted_at TIMESTAMP NULL`

**Named constraints** (for evolvability):

```sql
ALTER TABLE watchlist_items
  ADD COLUMN intent_type TEXT NOT NULL DEFAULT 'SKU',
  ADD COLUMN query_snapshot JSONB NULL,
  ADD COLUMN deleted_at TIMESTAMP NULL;

ALTER TABLE watchlist_items
  ADD CONSTRAINT watchlist_items_intent_type_check
  CHECK (intent_type IN ('SKU','SEARCH'));
```

### 4.2 Make `productId` nullable (required for SEARCH)

Future SEARCH intent must not require `productId`.

- Change Prisma: `productId String?`
- Make product relation optional

Add a cross-field correctness constraint:

```sql
ALTER TABLE watchlist_items
  ADD CONSTRAINT watchlist_items_intent_fields_check
  CHECK (
    (intent_type = 'SKU' AND product_id IS NOT NULL)
    OR
    (intent_type = 'SEARCH' AND product_id IS NULL AND query_snapshot IS NOT NULL)
  );
```

> v1 continues to create only `intent_type = 'SKU'`.

### 4.3 Indexes

Base indexes:

```sql
CREATE INDEX watchlist_items_intent_type_idx ON watchlist_items (intent_type);
CREATE INDEX watchlist_items_deleted_at_idx ON watchlist_items (deleted_at);
```

**Recommended optimization (common path):** active items per user

```sql
CREATE INDEX watchlist_items_active_user_idx
  ON watchlist_items (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
```

For large tables, prefer `CREATE INDEX CONCURRENTLY` (see Migration Risk Assessment).

---

## 5) QuerySnapshot shape (versioned)

Store a version in JSON.

```ts
export interface QuerySnapshotV1 {
  version: 1;
  searchText?: string;
  filters?: {
    caliber?: string[];
    brand?: string[];
    priceRange?: { min?: number; max?: number };
  };
  sortBy?: string;
}
```

No v1 validation required. Just persistence.

---

## 6) Type system enforcement (compile-time)

### 6.1 Internal domain model (aligns to `watchlist_items`)

Use Prisma-compatible types. `minDropAmount` uses Prisma `Decimal`.

```ts
import { Decimal } from '@prisma/client/runtime/library';

export interface WatchlistItem {
  id: string;
  userId: string;
  intentType: 'SKU' | 'SEARCH';
  querySnapshot: QuerySnapshotV1 | null;
  collectionId: string | null;  // FK to watchlist_collections
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  // Alert configuration (per ADR-011, existing fields)
  notificationsEnabled: boolean;
  priceDropEnabled: boolean;
  backInStockEnabled: boolean;
  minDropPercent: number;
  minDropAmount: Decimal;
  stockAlertCooldownHours: number;
  lastPriceNotifiedAt: Date | null;
  lastStockNotifiedAt: Date | null;
}

export interface WatchlistItemRecord extends WatchlistItem {
  productId: string | null;  // Only resolver/repo touches this
}

// User-facing DTO remains SavedItemDTO per ADR-011 (unchanged)
```

### 6.2 Repository contracts (locked)

- `getManyForResolver(ids): Promise<WatchlistItemRecord[]>` (internal only)
- `listForUser(userId): Promise<WatchlistItem[]>` (no productId exposed)

Rule:
- No downstream code has access to `productId` except resolver/repo.

---

## 7) Resolver seam without N+1

### 7.1 Resolver interface (unified)

```ts
export interface WatchlistItemResolution {
  productIds: string[];
  resolvedAt: Date;
}

export interface ResolveOptions {
  userId?: string;
}

export interface WatchlistItemResolver {
  resolve(itemId: string, opts?: ResolveOptions): Promise<WatchlistItemResolution>;
  resolveMany(
    itemIds: string[],
    opts?: ResolveOptions
  ): Promise<Map<string, WatchlistItemResolution>>;
}
```

Notes:
- `resolveMany` is the required method for hot paths (dashboard, alert cycles).
- `resolve` can delegate to `resolveMany` for convenience.

### 7.2 v1 behavior

- SKU: `productIds = [productId]`
- SEARCH: throw `NotImplemented` (v1)

Implementation must fetch records in **one query** for `resolveMany`.

---

## 8) Empty resolution handling (explicit)

When resolution returns `productIds: []`:

- **Alerter:** skip evaluation, log `WARN watchlist_item_resolution_empty {itemId,userId,intentType}`
- **Dashboard:** show row state `UNAVAILABLE` with “Product unavailable”, user can remove
- **API GET:** return item with `product: null`

No silent disappearance.

---

## 9) Alerts (aligned with existing schema)

- `alerts.watchlistItemId` already exists. Keep it.
- `AlertRuleType` (`PRICE_DROP`, `BACK_IN_STOCK`, `PRICE_THRESHOLD`) is already watch-agnostic.
- **No enum renames or WATCH_* additions in v1.**

### 9.1 Soft delete interaction

When a `WatchlistItem` is soft-deleted:
- Associated `alerts` remain in DB (no cascade).
- Alert evaluation MUST check `watchlistItem.deletedAt IS NULL` before firing.
- On resurrection, existing alerts become active again (no re-creation required).

---

## 10) Collections support

The existing `watchlist_collections` table and `collectionId` FK remain unchanged.

- Collections do **not** have `intent_type` (they group items, not define intent)
- A collection can contain both SKU and SEARCH items (future)
- Collection membership is orthogonal to resolution
- Resolver operates on individual `WatchlistItem`s, not collections

---

## 11) Alert configuration pass-through (no bloat)

Per ADR-011, WatchlistItem owns all notification preferences:
- `notificationsEnabled`, `priceDropEnabled`, `backInStockEnabled`
- `minDropPercent`, `minDropAmount`, `stockAlertCooldownHours`
- `lastPriceNotifiedAt`, `lastStockNotifiedAt`

These fields are **not** part of resolution. Resolver returns `productIds` only.

Alerter workflow:
1. Load WatchlistItems (includes alert config)
2. Call resolver to get `productIds`
3. Evaluate alert rules using config from WatchlistItem
4. Fetch product/price data for resolved productIds

---

## 12) Soft delete, uniqueness, and duplicates (resolved + clarified)

### 12.1 SKU uniqueness and resurrection

Current schema has a uniqueness invariant like:
- `@@unique([userId, productId])`

With soft delete, re-saving a deleted SKU item would violate uniqueness.

**Locked resolution:** keep the unique constraint and implement **resurrection** on save.

```ts
const existing = await prisma.watchlist_items.findFirst({
  where: { userId, productId } // include soft-deleted
});

if (existing) {
  if (existing.deletedAt) {
    // Resurrect. Preserve all user preferences and membership.
    return prisma.watchlist_items.update({
      where: { id: existing.id },
      data: { deletedAt: null } // updatedAt auto-managed by Prisma
    });
  }
  return existing;
}

return prisma.watchlist_items.create({ data: { userId, productId /* defaults */ } });
```

**Resurrection policy (explicit):** resurrection preserves all prior preferences, alerts linkage, and collection membership. Only `deletedAt` changes (and `updatedAt` is updated automatically).

Unsave behavior:
- Set `deletedAt = now` (do not hard delete).

### 12.2 SEARCH items and duplicates (clarification)

Because SQL treats `NULL != NULL`, the existing `@@unique([userId, productId])` does **not** prevent duplicates for SEARCH items (where `productId IS NULL`).

**Intended v1 behavior:** SEARCH intent is not implemented, but the schema permits it.  
**Future policy (to decide when SEARCH ships):**
- Either add `query_snapshot_hash` and enforce `@@unique([userId, querySnapshotHash])` for SEARCH, or
- Implement application-level duplicate detection.

Add-on idea:
- `query_snapshot_hash` can be a stable hash of canonicalized JSON.

---

## 13) Dashboard price resolution (no N+1)

Dashboard needs “best current price among eligible retailers” per saved item.

Locked pattern:
1. Fetch WatchlistItems for user (no product joins required at this stage)
2. `resolver.resolveMany(itemIds)` → productIds
3. Batched prices query over all resolved productIds:
   - `WHERE productId IN (...) AND inStock = true AND visiblePriceWhere(...)`
   - `ORDER BY price ASC`
4. Reduce per productId to best price
5. Map back to WatchlistItem rows

---

## 14) API compatibility (locked)

- Keep existing routes and payload shapes from ADR-011 (`/api/saved-items`, SavedItemDTO)
- Internal naming changes are allowed
- No client-breaking changes in v1

---

## 15) Migration rollback (documented)

Rollback SQL (if needed):

```sql
ALTER TABLE watchlist_items DROP CONSTRAINT IF EXISTS watchlist_items_intent_fields_check;
ALTER TABLE watchlist_items DROP CONSTRAINT IF EXISTS watchlist_items_intent_type_check;

DROP INDEX IF EXISTS watchlist_items_sku_active_uniq;
DROP INDEX IF EXISTS watchlist_items_active_user_idx;
DROP INDEX IF EXISTS watchlist_items_intent_type_idx;
DROP INDEX IF EXISTS watchlist_items_deleted_at_idx;

ALTER TABLE watchlist_items
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS query_snapshot,
  DROP COLUMN IF EXISTS intent_type;
```

Note:
- Reverting `product_id` back to NOT NULL requires confirming there are no NULLs first (should be true before SEARCH ships).

---

## 16) Migration risk assessment

- Adding columns with defaults is online in PG 11+ (but still touches the table).
- Adding CHECK constraints validates existing rows and may take time on large tables.
- Making `productId` nullable is metadata-only and fast.
- Index creation can be heavy. For large tables use:
  - `CREATE INDEX CONCURRENTLY ...`

Operational guidance:
- For tables approaching or exceeding ~1M rows, run during low-traffic windows.
- Consider splitting into two migrations:
  1) add nullable columns and indexes
  2) add cross-field CHECK constraints

---

## Acceptance criteria (updated)

1. Existing save/unsave flows unchanged
2. No N+1 regression in dashboard and alerter
3. `productId` not accessible outside repo + resolver (compile-time)
4. Resolver is async and batch-capable
5. `productId` nullable migration succeeds and preserves existing data
6. Collections unaffected
7. Alerts do not fire for soft-deleted items
8. Resurrection preserves preferences and reactivates existing alerts
9. Tests pass

---

## ADR-011 cross-reference

ADR-011 should reference this file as:

- `ADR-017-Intent-Ready-Saved-Items.md`

---

## 17) Minor clarifications (non-blocking)

### 17.1 resolveMany behavior for missing or deleted IDs

`resolveMany(itemIds)` returns a `Map<itemId, WatchlistItemResolution>`.

Edge cases:
- **Non-existent IDs:** omitted from the returned Map (caller can detect via missing key).
- **Soft-deleted IDs (`deletedAt IS NOT NULL`):** omitted from the returned Map. Resolver only resolves **active** items.

### 17.2 Soft delete filter location (query-time)

All queries that load WatchlistItems for user-facing operations (dashboard, alerter, API) MUST include:

- `WHERE deleted_at IS NULL`

Exceptions:
- Explicit admin/audit endpoints or cleanup jobs that intentionally include deleted items.

### 17.3 Repository contracts and soft delete

Repository methods in normal flows return **only active** items:

- `getManyForResolver(ids): Promise<WatchlistItemRecord[]>` → excludes deleted
- `listForUser(userId): Promise<WatchlistItem[]>` → excludes deleted

Optional admin/audit helper (only if needed later):
- `getManyIncludingDeleted(ids): Promise<WatchlistItemRecord[]>`

### 17.4 Decimal to number mapping (DTO consistency)

Internal domain uses Prisma `Decimal` for `minDropAmount`. `SavedItemDTO` (ADR-011) uses `number`.

Mapping layer must convert:
- `minDropAmount: parseFloat(item.minDropAmount.toString())`

(Existing `saved-items.ts` likely already does this. Keep consistent.)

### 17.5 deleted_at index justification

`watchlist_items_deleted_at_idx` is primarily for:
- cleanup jobs (e.g. `WHERE deleted_at < NOW() - INTERVAL '90 days'`)
- analytics (count deletions over time)

The partial index `watchlist_items_active_user_idx` covers the common “active items per user” path.

### 17.6 Rollback note for productId NOT NULL

To revert `product_id` to NOT NULL (only if no SEARCH items exist):
1. Verify: `SELECT COUNT(*) FROM watchlist_items WHERE product_id IS NULL;` must be 0
2. Run: `ALTER TABLE watchlist_items ALTER COLUMN product_id SET NOT NULL;`

### 17.7 Typed NotImplemented error

Use a typed error for SEARCH intent in v1:

```ts
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented`);
    this.name = 'NotImplementedError';
  }
}

// In resolver:
if (record.intentType === 'SEARCH') {
  throw new NotImplementedError('SEARCH intent resolution');
}
```

---

## 18) Review-driven fixes (must adopt before merge)

This section incorporates critical review findings to prevent accidental scope expansion and operational risk.

### 18.1 Prevent accidental SEARCH row proliferation (NULL uniqueness)

Making `productId` nullable while keeping `@@unique([userId, productId])` allows unlimited SEARCH rows per user because `NULL` values do not collide in PostgreSQL.

**Locked for v1:** SEARCH intent creation MUST be gated at the application layer. No API path may create `intent_type='SEARCH'` rows in v1.

**Locked for v1:** Add a partial unique index that enforces SKU uniqueness for active rows:

```sql
-- Enforce uniqueness for active SKU items only
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS watchlist_items_sku_active_uniq
ON watchlist_items (user_id, product_id)
WHERE intent_type = 'SKU' AND deleted_at IS NULL AND product_id IS NOT NULL;
```

**Future (before SEARCH ships):** introduce a separate uniqueness policy for SEARCH, e.g. `query_snapshot_hash` with `UNIQUE(user_id, query_snapshot_hash)` for active SEARCH rows, or application-level duplicate detection.

### 18.2 Column naming in SQL migrations (snake_case vs camelCase)

The CHECK constraints in §4.2 must reference **actual database column names**, not Prisma field names.

- If Prisma maps `productId` → `product_id` and `querySnapshot` → `query_snapshot`, use the snake_case names.
- If you have custom `@map` directives, adjust accordingly.

**Implementation requirement:** verify the generated DB column names before applying the constraint, and ensure the migration matches:

```sql
-- Example verification
-- \d watchlist_items
-- or query information_schema.columns
```

### 18.3 Soft delete + uniqueness sequencing

If a partial unique index is introduced (as in §18.1), it MUST exclude `deleted_at IS NOT NULL` so that:
- a resurrect update can occur without a uniqueness violation, and
- active SKU rows remain unique.

Resurrection logic remains the canonical behavior. The index simply codifies the invariant at the DB layer.

### 18.4 Index creation must avoid write locks

On large `watchlist_items`, `CREATE INDEX` without `CONCURRENTLY` can block writes.

**Locked:** use `CONCURRENTLY` at minimum for `watchlist_items_active_user_idx` and `watchlist_items_sku_active_uniq`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS watchlist_items_active_user_idx
  ON watchlist_items (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
```

### 18.5 SavedItemDTO mapping must tolerate null product (future-proof)

Even though v1 does not create SEARCH items, the API mapping layer must not assume product details are always present.

- If a WatchlistItem resolves to zero products, the API should return the SavedItem with `product` fields as `null` or omit derived fields consistently.
- Existing code paths that assume non-null `productId` must be hardened to avoid runtime crashes.

### 18.6 Alerter and soft delete filter verification

Requirement from §9.1 is non-negotiable:

- Alert evaluation must exclude soft-deleted WatchlistItems (`deleted_at IS NULL`).

**Implementation checklist:**
- Ensure the alerter queries join WatchlistItems with `WHERE deleted_at IS NULL`.
- Add a regression test: create a saved item, soft-delete it, verify no alerts fire.

### 18.7 Collections assumptions

Collections may contain mixed intent types in the future. Therefore:
- collection list/count queries must not assume `productId` is always present.
- any “unique by product” logic must be guarded to apply only to `intent_type='SKU'`.

---

## 19) Locked invariants and gating (final alignment)

### 19.1 SKU uniqueness (authoritative)

Active SKU saved items MUST be unique per user.

**Enforced by DB:**

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS watchlist_items_sku_active_uniq
ON watchlist_items (user_id, product_id)
WHERE intent_type = 'SKU' AND deleted_at IS NULL AND product_id IS NOT NULL;
```

This invariant is relied upon by resurrection logic and must not be weakened.

### 19.2 SEARCH intent gating (v1 and Phase 2)

SEARCH intent creation is **explicitly disabled** in v1 and Phase 2.

- No API, job, or admin path may create `intent_type='SEARCH'`.
- Resolver MUST throw `NotImplementedError` if invoked for SEARCH.
- Schema supports SEARCH for future ADRs only.

This prevents accidental proliferation of NULL `productId` rows.

### 19.3 SavedItemDTO null-product safety (future)

Because SEARCH is gated, v1 APIs MAY continue assuming SKU-backed items.
Before SEARCH ships, a new ADR must:
- Harden SavedItemDTO to allow null product fields, OR
- Introduce a SEARCH-specific DTO.

No implicit behavior change is allowed.



# Saved Items Phase 2: Implementation Plan (Draft)

**Status**: Draft (non-authoritative)

## Goal
One user concept: **Saved Items**. One action: **Save**.

Saving creates:
- A persistent WatchlistItem row (preferences + state)
- Default Alert rule markers (PRICE_DROP, BACK_IN_STOCK)
- User-configurable thresholds and cooldowns

## Design Principle (Locked In)
> Alert records are declarative rule markers; all user preferences and runtime state are stored on WatchlistItem.

---

## Schema (Implemented)

### WatchlistItem (Saved Item preferences row)
```prisma
model WatchlistItem {
  id        String @id @default(cuid())
  userId    String
  productId String

  // Notification preferences
  notificationsEnabled Boolean @default(true)
  priceDropEnabled     Boolean @default(true)
  backInStockEnabled   Boolean @default(true)

  // Anti-spam thresholds
  minDropPercent Int     @default(5)   // 0-100
  minDropAmount  Decimal @default(5.0) @db.Decimal(10, 2)

  // Cooldowns
  stockAlertCooldownHours Int       @default(24)
  lastStockNotifiedAt     DateTime?
  lastPriceNotifiedAt     DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  alerts Alert[]

  @@unique([userId, productId])
}
```

### Alert (Declarative rule marker)
```prisma
model Alert {
  id              String        @id @default(cuid())
  userId          String
  productId       String
  watchlistItemId String
  ruleType        AlertRuleType  // PRICE_DROP | BACK_IN_STOCK
  isEnabled       Boolean       @default(true)

  @@unique([userId, productId, ruleType])
}
```

---

## Default Rules and Semantics

**PRICE_DROP**: Notify when `dropAbs > 0 AND (dropPct >= minDropPercent OR dropAbs >= minDropAmount)`
- Defaults: minDropPercent=5, minDropAmount=$5

**BACK_IN_STOCK**: Notify only on transition OOS → inStock
- Throttle: `now - lastStockNotifiedAt >= stockAlertCooldownHours` (default 24h)

---

## API Contract

### 1. List Saved Items
```
GET /api/saved-items
```
Returns `SavedItemDTO[]` with product info and preferences.

### 2. Save Item (Idempotent)
```
POST /api/saved-items/:productId
```
- Upsert WatchlistItem with defaults if missing
- Upsert Alert rows for PRICE_DROP and BACK_IN_STOCK if missing
- All in one DB transaction
- Returns `SavedItemDTO`

### 3. Unsave Item
```
DELETE /api/saved-items/:productId
```
Hard delete WatchlistItem + cascade delete Alerts.

### 4. Update Preferences
```
PATCH /api/saved-items/:productId
```
Body:
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
- minDropPercent: 0–100
- minDropAmount: >= 0
- stockAlertCooldownHours: 1–168

---

## SavedItemDTO (UI Contract)

```typescript
interface SavedItemDTO {
  id: string
  productId: string
  name: string
  brand: string
  caliber: string
  price: number | null
  inStock: boolean
  imageUrl: string | null
  savedAt: string

  // Notification preferences
  notificationsEnabled: boolean
  priceDropEnabled: boolean
  backInStockEnabled: boolean
  minDropPercent: number
  minDropAmount: number
  stockAlertCooldownHours: number
}
```

---

## Task List

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Prisma schema: add prefs to WatchlistItem, simplify Alert | P0 | ✅ Done |
| 2 | Save Service (`saved-items.ts`) with transaction + idempotency | P0 | Pending |
| 3 | Endpoint `/api/saved-items` (GET/POST/DELETE/PATCH) | P0 | Pending |
| 4 | API client: `saveItem()`, `getSavedItems()`, `updateSavedItem()` | P0 | Pending |
| 5 | Hooks: `useSavedItems()` replaces watchlist + alerts hooks | P0 | Pending |
| 6 | Saved Items Manager UI for `/dashboard/saved` | P0 | Pending |
| 7 | Save dialog rename + wire to save endpoint | P0 | Pending |
| 8 | Notification Drawer with controls | P1 | Pending |
| 9 | Alert engine: enforce thresholds + cooldowns | P1 | Pending |
| 10 | Deprecate old routes through new service | P1 | Pending |

---

## Files

### New Files
1. `apps/api/src/services/saved-items.ts` - Core save/merge logic
2. `apps/api/src/routes/saved-items.ts` - New unified endpoints
3. `apps/web/components/products/save-item-dialog.tsx` - Renamed dialog
4. `apps/web/components/dashboard/saved-items-manager.tsx` - List component
5. `apps/web/components/dashboard/notification-drawer.tsx` - Settings drawer
6. `apps/web/hooks/use-saved-items.ts` - Unified hook

### Modified Files
1. `packages/db/schema.prisma` - Updated schema ✅
2. `apps/api/src/routes/index.ts` - Register new route
3. `apps/web/lib/api.ts` - Add API client functions
4. `apps/web/app/dashboard/saved/page.tsx` - Use new manager
5. `apps/web/types/dashboard.ts` - Update SavedItemDTO

### Deprecated (Phase 3 removal)
1. `apps/api/src/routes/watchlist.ts`
2. `apps/api/src/routes/alerts.ts`
3. `apps/web/hooks/use-watchlist.ts`
4. `apps/web/hooks/use-alerts.ts`
5. `apps/web/components/dashboard/alerts-manager.tsx`

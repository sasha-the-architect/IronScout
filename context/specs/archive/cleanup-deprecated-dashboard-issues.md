# GitHub Issues: Deprecated Dashboard Cleanup

Copy these to create GitHub issues. Execute in order listed.

---

## Issue 1: Delete deprecated dashboard v5 components

**Labels:** `tech-debt`, `cleanup`, `low-risk`
**Priority:** Low

### Description
Delete deprecated dashboard v5 components that are no longer used after the My Loadout migration.

### Files to Delete
- `apps/web/components/dashboard/v5/dashboard-v5.tsx`
- `apps/web/components/dashboard/v5/dashboard-v5-updated.tsx`
- `apps/web/components/dashboard/v5/spotlight-card.tsx`
- `apps/web/components/dashboard/v5/spotlight-notice.tsx`
- `apps/web/components/dashboard/v5/watchlist-row.tsx`
- `apps/web/components/dashboard/v5/types.ts`

### Acceptance Criteria
- [ ] Files deleted
- [ ] `pnpm --filter @ironscout/web build` passes
- [ ] No runtime errors on dashboard page

---

## Issue 2: Delete deprecated "deals" components

**Labels:** `tech-debt`, `cleanup`, `low-risk`
**Priority:** Low
**Blocked by:** Issue 1

### Description
Delete deprecated deals/best-prices components replaced by loadout cards.

### Files to Delete
- `apps/web/components/dashboard/organisms/deals-for-you.tsx`
- `apps/web/components/dashboard/organisms/todays-best-moves.tsx`
- `apps/web/components/dashboard/organisms/best-prices.tsx`
- `apps/web/components/dashboard/market-deals.tsx`

### Acceptance Criteria
- [ ] Files deleted
- [ ] Update `organisms/index.ts` if needed
- [ ] `pnpm --filter @ironscout/web build` passes

---

## Issue 3: Delete deprecated dashboard hooks

**Labels:** `tech-debt`, `cleanup`, `low-risk`
**Priority:** Low
**Blocked by:** Issue 2

### Description
Delete hooks that served the deprecated dashboard components.

### Files to Delete
- `apps/web/hooks/use-deals-for-you.ts`
- `apps/web/hooks/use-dashboard-v5.ts`
- `apps/web/hooks/use-market-pulse.ts` (if exists)

### Acceptance Criteria
- [ ] Files deleted
- [ ] `pnpm --filter @ironscout/web build` passes

---

## Issue 4: Clean up lib/api.ts deprecated functions

**Labels:** `tech-debt`, `cleanup`, `low-risk`
**Priority:** Low
**Blocked by:** Issue 3

### Description
Remove deprecated API client functions that called old dashboard endpoints.

### Changes in `apps/web/lib/api.ts`
- Remove `getDashboardV5()` function
- Remove `getDealsForYou()` function
- Remove type imports from `@/components/dashboard/v5/types`

### Acceptance Criteria
- [ ] Functions removed
- [ ] No TypeScript errors
- [ ] `pnpm --filter @ironscout/web build` passes

---

## Issue 5: Remove deprecated /api/dashboard/v5 endpoint

**Labels:** `tech-debt`, `cleanup`, `api`, `low-risk`
**Priority:** Low
**Blocked by:** Issue 4

### Description
Remove the deprecated v5 dashboard API endpoint and its service.

### Changes
1. In `apps/api/src/routes/dashboard.ts`:
   - Remove import for `getDashboardV5Data`
   - Remove `router.get('/v5', ...)` handler
   - Remove unused `getMarketDeals` imports if applicable

2. Delete `apps/api/src/services/dashboard-v5.ts`

### Acceptance Criteria
- [ ] Endpoint removed
- [ ] Service file deleted
- [ ] `pnpm --filter @ironscout/api build` passes
- [ ] `pnpm --filter @ironscout/api test` passes

---

## Issue 6: Neutralize search bar example queries

**Labels:** `copy`, `ux`, `adr-006`
**Priority:** Medium

### Description
Change search bar placeholder examples to use neutral language per ADR-006 (no "best", "cheap" implying optimal purchases).

### File
`apps/web/components/search/ai-search-bar.tsx` (lines 16-22)

### Current
```typescript
const exampleQueries = [
  "best 9mm for home defense",
  "cheap bulk .223 for the range",
  ...
]
```

### Change to
```typescript
const exampleQueries = [
  "9mm defensive loads",
  "bulk .223 range ammo",
  "match grade .308 for precision",
  "5.56 NATO for AR15",
  "subsonic 300 blackout",
]
```

### Acceptance Criteria
- [ ] No "best", "cheap", "ideal" in example queries
- [ ] Examples still demonstrate search intent parsing
- [ ] Manual verification: search bar renders correctly

---

## Issue 7: Evaluate market-deals.ts for removal or rename

**Labels:** `tech-debt`, `needs-investigation`
**Priority:** Low
**Blocked by:** Issue 5

### Description
After dashboard cleanup, investigate if `market-deals.ts` service is still used elsewhere. If not, delete. If yes, consider renaming to neutral terminology in a future ADR.

### Investigation
```bash
grep -r "market-deals\|getMarketDeals\|MarketDeal" apps/api/src --include="*.ts"
```

### Decision Tree
- **If no usages:** Delete `apps/api/src/services/market-deals.ts`
- **If still used:** Create follow-up issue for rename discussion

### Acceptance Criteria
- [ ] Investigation completed
- [ ] Action taken (delete or document for future)

---

## Execution Order

```
Issue 1 → Issue 2 → Issue 3 → Issue 4 → Issue 5 → Issue 7
                                            ↓
                                      Issue 6 (can run in parallel)
```

## Estimated Effort

| Issue | Effort | Risk |
|-------|--------|------|
| 1 | 15 min | None |
| 2 | 15 min | None |
| 3 | 10 min | None |
| 4 | 15 min | Low |
| 5 | 20 min | Low |
| 6 | 10 min | None |
| 7 | 15 min | None |

**Total:** ~1.5 hours of work, split across safe PRs
# Status: Archived
Historical cleanup notes. Not authoritative.

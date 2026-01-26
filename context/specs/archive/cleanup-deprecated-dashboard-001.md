# Cleanup: Deprecated Dashboard Code Removal

**Created:** 2026-01-26
**Author:** System Audit
**Priority:** Low (Tech Debt)
**Risk Level:** Low (dead code removal)

---

## Overview

The dashboard has been migrated from v5/deals-based architecture to the new **My Loadout** system. The old code is now dead but still exists in the codebase. This spec breaks removal into small, safe chunks.

**Active system:**
- `apps/web/app/dashboard/page.tsx` → uses `useLoadout` hook
- `apps/api/src/routes/dashboard.ts` → `/api/dashboard/loadout` endpoint
- `apps/api/src/services/loadout.ts` → clean service

**Dead code to remove:**
- Dashboard v5 components and hooks
- "Deals" terminology components
- Market deals service (from dashboard context)
- Deprecated API endpoint

---

## Tasks (Execute in Order)

### Phase 1: Frontend Component Cleanup

#### Task 1.1: Delete deprecated dashboard v5 components
**Files to delete:**
```
apps/web/components/dashboard/v5/dashboard-v5.tsx
apps/web/components/dashboard/v5/dashboard-v5-updated.tsx
apps/web/components/dashboard/v5/spotlight-card.tsx
apps/web/components/dashboard/v5/spotlight-notice.tsx
apps/web/components/dashboard/v5/watchlist-row.tsx
apps/web/components/dashboard/v5/types.ts
apps/web/components/dashboard/v5/index.ts (if exists)
```

**Verification:**
```bash
# Before: Ensure no imports exist
grep -r "from.*dashboard/v5" apps/web --include="*.tsx" --include="*.ts" | grep -v "tsconfig"
# Should only show: use-dashboard-v5.ts and lib/api.ts (will be cleaned in later tasks)

# After: Build succeeds
pnpm --filter @ironscout/web build
```

---

#### Task 1.2: Delete deprecated "deals" components
**Files to delete:**
```
apps/web/components/dashboard/organisms/deals-for-you.tsx
apps/web/components/dashboard/organisms/todays-best-moves.tsx
apps/web/components/dashboard/organisms/best-prices.tsx
apps/web/components/dashboard/market-deals.tsx
```

**Verification:**
```bash
# Before: Ensure no imports exist
grep -r "DealsForYou\|TodaysBestMoves\|BestPrices\|PersonalizedFeed\|TopMatch" apps/web --include="*.tsx" --include="*.ts"
# Should only show the files themselves (self-imports)

# After: Build succeeds
pnpm --filter @ironscout/web build
```

---

#### Task 1.3: Update organisms index if needed
**File:** `apps/web/components/dashboard/organisms/index.ts`

**Action:** Remove exports for deleted components if they exist in the barrel file.

**Verification:**
```bash
pnpm --filter @ironscout/web build
```

---

### Phase 2: Frontend Hook Cleanup

#### Task 2.1: Delete deprecated useDealsForYou hook
**Files to delete:**
```
apps/web/hooks/use-deals-for-you.ts
```

**Verification:**
```bash
# Before: Ensure no imports exist (should be none after Task 1.2)
grep -r "useDealsForYou\|use-deals-for-you" apps/web --include="*.tsx" --include="*.ts"

# After: Build succeeds
pnpm --filter @ironscout/web build
```

---

#### Task 2.2: Delete deprecated useDashboardV5 hook
**Files to delete:**
```
apps/web/hooks/use-dashboard-v5.ts
```

**Verification:**
```bash
# Before: Ensure no imports exist
grep -r "useDashboardV5\|use-dashboard-v5" apps/web --include="*.tsx" --include="*.ts"

# After: Build succeeds
pnpm --filter @ironscout/web build
```

---

#### Task 2.3: Delete deprecated useMarketPulse hook (if exists)
**Check if file exists:**
```bash
ls apps/web/hooks/use-market-pulse.ts
```

**If exists, delete after verifying no imports.**

---

### Phase 3: Frontend API Client Cleanup

#### Task 3.1: Remove deprecated API functions from lib/api.ts
**File:** `apps/web/lib/api.ts`

**Functions to remove:**
- `getDashboardV5()`
- `getDealsForYou()`
- Related type imports from `@/components/dashboard/v5/types`

**Action:**
1. Search for these functions in the file
2. Remove the function definitions
3. Remove the type import at top of file

**Verification:**
```bash
# Ensure no callers exist
grep -r "getDashboardV5\|getDealsForYou" apps/web --include="*.tsx" --include="*.ts"
# Should return nothing after hooks deleted

pnpm --filter @ironscout/web build
```

---

### Phase 4: API Service Cleanup

#### Task 4.1: Remove deprecated dashboard-v5 service
**File to delete:**
```
apps/api/src/services/dashboard-v5.ts
```

**Prerequisite:** Task 4.2 must be done first (remove route that uses this service)

---

#### Task 4.2: Remove deprecated /api/dashboard/v5 endpoint
**File:** `apps/api/src/routes/dashboard.ts`

**Action:**
1. Remove the import: `import { getDashboardV5Data } from '../services/dashboard-v5'`
2. Remove the route handler for `router.get('/v5', ...)`

**Verification:**
```bash
pnpm --filter @ironscout/api build
pnpm --filter @ironscout/api test
```

---

#### Task 4.3: Remove market-deals service import from dashboard routes
**File:** `apps/api/src/routes/dashboard.ts`

**Action:**
1. Check if `getMarketDeals` or `getMarketDealsWithGunLocker` are used in any remaining routes
2. If not used, remove the import line

**Note:** The `market-deals.ts` service file may be used elsewhere (e.g., search). Only remove the import from dashboard.ts, not the service itself.

**Verification:**
```bash
grep -r "getMarketDeals" apps/api/src/routes/
# Check if any routes still use it

pnpm --filter @ironscout/api build
```

---

#### Task 4.4: Evaluate market-deals.ts service for deletion
**File:** `apps/api/src/services/market-deals.ts`

**Action:**
1. Search for usages across the entire API
2. If only used by now-deleted dashboard routes, delete the file
3. If used elsewhere, leave it (but consider renaming in a separate task)

```bash
grep -r "market-deals\|getMarketDeals\|MarketDeal" apps/api/src --include="*.ts"
```

---

### Phase 5: Search Bar Placeholder (Separate PR)

#### Task 5.1: Change search bar placeholder to neutral language
**File:** `apps/web/components/search/ai-search-bar.tsx`

**Current (line 16-22):**
```typescript
const exampleQueries = [
  "best 9mm for home defense",
  "cheap bulk .223 for the range",
  "match grade .308 long range",
  "AR15 ammo for beginners",
  "subsonic 300 blackout",
]
```

**Change to:**
```typescript
const exampleQueries = [
  "9mm defensive loads",
  "bulk .223 range ammo",
  "match grade .308 for precision",
  "5.56 NATO for AR15",
  "subsonic 300 blackout",
]
```

**Rationale:** Removes "best" and "cheap" which imply IronScout finds optimal purchases (violates ADR-006 spirit).

**Verification:**
```bash
pnpm --filter @ironscout/web build
# Manual: Check search page renders correctly
```

---

## Execution Order

```
Phase 1 (Frontend Components) → Phase 2 (Hooks) → Phase 3 (API Client) → Phase 4 (API Services) → Phase 5 (Search Bar)
```

Each phase should be a separate PR for easy rollback.

---

## Rollback Plan

If any phase causes issues:
1. Revert the specific PR
2. All changes are deletions of dead code, so rollback is safe
3. No data migrations involved

---

## Success Criteria

- [ ] `pnpm build` succeeds in all workspaces
- [ ] `pnpm test` passes in all workspaces
- [ ] No grep matches for deleted exports/functions
- [ ] Dashboard page still renders and functions correctly
- [ ] Search page still renders with new placeholders

---

## Out of Scope

- Renaming `market-deals.ts` if used by search (separate ADR discussion)
- Renaming any database tables or API response types
- Changes to the loadout service (it's already clean)
# Status: Archived
Historical cleanup notes. Not authoritative.

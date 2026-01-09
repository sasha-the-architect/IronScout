# Dealer → Merchant Terminology Migration Plan

## Overview

This plan systematically renames all "dealer" references to "merchant" across the codebase to eliminate terminology confusion. The migration affects ~1,562 occurrences across 122 code files.

**Guiding Principles:**
- Work from infrastructure outward (types → code → UI → docs)
- Maintain working state between phases
- Run tests after each phase
- Commit after each phase for easy rollback

---

## Terminology Definitions

Per `context/architecture/00_system_overview.md`:

> Legacy terminology notice: Some paths, queues, or historical references use the term "dealer".
> The canonical model is **Merchant** (portal account) and **Retailer** (consumer storefront).

### Merchant (B2B Customer)
- Business entity with a portal account
- Submits inventory via feeds
- Receives pricing insights
- Has subscription tier (hobbyist, serious, national, top-tier)
- Database: `merchants`, `merchant_users`, `retailer_feeds`, `retailer_skus`, `merchant_insights`

### Retailer (Consumer Storefront)
- Store/website that sells ammunition to consumers
- Can be scraped (affiliate feeds, web scraping)
- Can be claimed by a Merchant via `merchant_retailers`
- Has visibility status for consumer search
- Database: `retailers`, `sources`

### Migration Rule
**ALL "dealer" references → "merchant"**

There are NO cases where "dealer" should become "retailer". The "dealer" terminology was the legacy name for what is now "merchant".

---

## Phase 0: Pre-Migration Setup
**Estimated Changes:** 0 code changes
**Risk:** None

### Tasks
- [ ] Create feature branch: `refactor/dealer-to-merchant-terminology`
- [ ] Document current test status (baseline)
- [ ] Ensure all tests pass before starting
- [ ] Back up any local environment data

### Verification
```bash
pnpm test
pnpm build
```

---

## Phase 1: Delete Broken Seed File
**Estimated Changes:** 1 file deletion
**Risk:** Low (file is already broken)

### Rationale
`packages/db/seed-dealer-portal-test.ts` references deleted Prisma models (`prisma.dealer`, `prisma.dealerUser`, etc.). It cannot run and should be removed or rewritten.

### Tasks
- [ ] Delete `packages/db/seed-dealer-portal-test.ts`
- [ ] Or rename to `seed-merchant-portal-test.ts` and update to use current models

### Verification
```bash
pnpm --filter @ironscout/db build
```

---

## Phase 2: Rename Harvester Directory Structure
**Estimated Changes:** ~20 file moves, ~200 import updates
**Risk:** Medium (many import paths change)

### Rationale
The entire `apps/harvester/src/dealer/` directory should be renamed to `merchant/` to match the domain terminology.

### 2.1 Rename Directory
```
apps/harvester/src/dealer/  →  apps/harvester/src/merchant/
```

### 2.2 Files to Move
| Old Path | New Path |
|----------|----------|
| `dealer/index.ts` | `merchant/index.ts` |
| `dealer/benchmark.ts` | `merchant/benchmark.ts` |
| `dealer/feed-ingest.ts` | `merchant/feed-ingest.ts` | Completed: exports `retailerFeedIngestWorker`
| `dealer/ftp-fetcher.ts` | `merchant/ftp-fetcher.ts` |
| `dealer/insight.ts` | `merchant/insight.ts` |
| `dealer/scheduler.ts` | `merchant/scheduler.ts` |
| `dealer/sku-match.ts` | `merchant/sku-match.ts` |
| `dealer/subscription.ts` | `merchant/subscription.ts` |
| `dealer/connectors/*` | `merchant/connectors/*` |
| `dealer/__tests__/*` | `merchant/__tests__/*` |

### 2.3 Update Imports
Update all files that import from `./dealer/` or `../dealer/`:
- `apps/harvester/src/worker.ts`
- `apps/harvester/src/ops/bullboard.ts`
- `apps/harvester/src/config/queues.ts`

### Verification
```bash
pnpm --filter harvester build
pnpm --filter harvester test
```

---

## Phase 3: Rename Type Definitions
**Estimated Changes:** ~50 type renames
**Risk:** Medium (TypeScript will catch mismatches)

### Rationale
Rename types/interfaces before updating code that uses them. TypeScript compiler will help catch any missed references.

### 3.1 Harvester Types
| Old Name | New Name | File |
|----------|----------|------|
| `DealerTier` | `MerchantTier` | `scale-data-generator.ts` |
| `MockDealerSku` | `MockMerchantSku` | `scale-pipeline.test.ts` |
| `MockDealerInsight` | `MockMerchantInsight` | `scale-pipeline.test.ts` |
| `DealerFeedJobData` | `RetailerFeedIngestJobData` | `queues.ts` |
| `DealerBenchmarkJobData` | `MerchantBenchmarkJobData` | `queues.ts` |
| `DealerInsightJobData` | `MerchantInsightJobData` | `queues.ts` |

### 3.2 Queue Names
| Old Name | New Name |
|----------|----------|
| `DEALER_FEED` | `RETAILER_FEED_INGEST` |
| `DEALER_BENCHMARK` | `MERCHANT_BENCHMARK` |
| `DEALER_INSIGHT` | `MERCHANT_INSIGHT` |

### Verification
```bash
pnpm --filter harvester type-check
pnpm --filter harvester test
```

---

## Phase 4: Rename Notification Files
**Estimated Changes:** ~160 changes across 9 files
**Risk:** Medium

### 4.1 File Renames
| Old Path | New Path |
|----------|----------|
| `notifications/dealer-signup.ts` | `notifications/merchant-signup.ts` |
| `notifications/dealer-status.ts` | `notifications/merchant-status.ts` |

### 4.2 Function/Class Renames
| Old Name | New Name |
|----------|----------|
| `sendDealerSignupNotification` | `sendMerchantSignupNotification` |
| `sendDealerStatusNotification` | `sendMerchantStatusNotification` |
| `DealerSignupEmail` | `MerchantSignupEmail` |
| `DealerStatusEmail` | `MerchantStatusEmail` |

### 4.3 Update Index Exports
Update `packages/notifications/src/index.ts` exports

### 4.4 Update All Callers
- `apps/merchant/app/api/auth/register/route.ts`
- `apps/admin/app/api/merchants/[id]/approve/route.ts`
- `apps/admin/app/api/merchants/[id]/suspend/route.ts`
- etc.

### Verification
```bash
pnpm --filter @ironscout/notifications build
pnpm --filter @ironscout/merchant build
pnpm --filter @ironscout/admin build
```

---

## Phase 5: Rename Merchant App Routes
**Estimated Changes:** ~6 route files
**Risk:** Low (internal admin routes)

### Route Renames
| Old Route | New Route |
|-----------|-----------|
| `/api/admin/dealers/[id]/approve` | `/api/admin/merchants/[id]/approve` |
| `/api/admin/dealers/[id]/suspend` | `/api/admin/merchants/[id]/suspend` |
| `/api/admin/dealers/[id]/reactivate` | `/api/admin/merchants/[id]/reactivate` |

### Directory Move
```
apps/merchant/app/api/admin/dealers/  →  apps/merchant/app/api/admin/merchants/
```

### Verification
```bash
pnpm --filter @ironscout/merchant build
```

---

## Phase 6: Rename Variables and Parameters
**Estimated Changes:** ~800 variable renames
**Risk:** Medium-High (large scope)

### 6.1 Common Variable Renames
| Old Name | New Name | Scope |
|----------|----------|-------|
| `dealerId` | `merchantId` | All files |
| `dealerIds` | `merchantIds` | All files |
| `dealer` | `merchant` | Variable names |
| `dealers` | `merchants` | Variable names |
| `dealerSkus` | `merchantSkus` | Harvester |
| `dealerPrices` | `merchantPrices` | Harvester |
| `dealerData` | `merchantData` | Various |
| `dealerFeed` | `retailerFeed` | Various |
| `dealerUser` | `merchantUser` | Various |

### 6.2 Function Parameter Renames
Update function signatures:
```typescript
// Before
async function processFeed(dealerId: string, feedId: string)
// After
async function processFeed(merchantId: string, feedId: string)
```

### 6.3 Approach
Process by directory:
1. `apps/harvester/src/merchant/` (formerly dealer/)
2. `apps/merchant/`
3. `apps/admin/`
4. `apps/api/`
5. `packages/notifications/`

### Verification
```bash
pnpm type-check
pnpm test
```

---

## Phase 7: Update UI Strings and Comments
**Estimated Changes:** ~200 string/comment updates
**Risk:** Low (no functional impact)

### 7.1 User-Facing Strings
Search for and update:
- Error messages: "Dealer not found" → "Merchant not found"
- UI labels: "Dealer Portal" → "Merchant Portal"
- Email content: "Dear Dealer" → "Dear Merchant"
- Log messages

### 7.2 Code Comments
Update JSDoc and inline comments:
```typescript
// Before: Simulates DealerSku record creation
// After: Simulates MerchantSku record creation
```

### Verification
```bash
pnpm build
# Manual review of UI
```

---

## Phase 8: Update Configuration and Settings
**Estimated Changes:** ~50 changes
**Risk:** Low

### 8.1 System Settings
`packages/db/system-settings.ts`:
- Setting keys referencing "dealer"
- Default values

### 8.2 Admin Settings UI
`apps/admin/app/settings/`:
- Constants
- Labels
- Queue names display

### 8.3 Environment Variables (if any)
Check for any `DEALER_*` environment variables

### Verification
```bash
pnpm build
# Test settings UI
```

---

## Phase 9: Update Documentation
**Estimated Changes:** ~936 occurrences across 54 files
**Risk:** None (documentation only)

### 9.1 Active Documentation (`context/`)
Priority files:
- `context/apps/01_dealer.md` → rename to `01_merchant.md`
- `context/architecture/*.md`
- `context/operations/*.md`
- `context/specs/*.md`

### 9.2 Archive Documentation (`context/archive/`)
Lower priority but should be updated for consistency:
- `context/archive/docs/apps/dealer.md`
- `context/archive/docs/product/dealer.md`

### 9.3 Reference Files
- `context/reference/repo_map.md`
- `context/reference/api.md`
- `context/reference/commands.md`

### Verification
```bash
# Review markdown files for consistency
```

---

## Phase 10: Final Cleanup
**Estimated Changes:** Variable
**Risk:** Low

### Tasks
- [ ] Run full test suite
- [ ] Run full build
- [ ] Search for any remaining "dealer" references
- [ ] Update this migration plan to mark as complete
- [ ] Delete this migration plan file (or archive it)

### Final Verification
```bash
# Search for any remaining references
rg -i "dealer" --type ts --type tsx

# Full build and test
pnpm build
pnpm test
```

---

## Execution Checklist

| Phase | Description | Status | Commit |
|-------|-------------|--------|--------|
| 0 | Pre-migration setup | ✅ | - |
| 1 | Delete broken seed file | ✅ | pending |
| 2 | Rename harvester directory | ✅ | pending |
| 3 | Rename type definitions | ✅ | pending |
| 4 | Rename notification files | ✅ | pending |
| 5 | Rename merchant app routes | ✅ | pending |
| 6 | Rename variables/parameters | ✅ | pending |
| 7 | Update UI strings/comments | ✅ | pending |
| 8 | Update configuration | ✅ | pending |
| 9 | Update documentation | 🔄 | pending |
| 10 | Final cleanup | 🔄 | pending |

---

## Rollback Plan

If issues arise:
1. Each phase has its own commit - revert to last known good commit
2. Feature branch allows easy abandonment if needed
3. No database migrations required (schema already uses "merchant")

---

## Notes

- The Prisma schema is already clean (uses `merchants`, `merchant_users`, etc.)
- Database tables already use correct naming
- This is purely a code/documentation cleanup
- Estimated total effort: 4-6 hours of focused work
- Can be done incrementally across multiple sessions

# Integration Test Plan: Timing & Race Condition Coverage

## Phase 0: Reconnaissance Summary

### Test Locations
- `apps/api/src/**/__tests__/*.test.ts` - API unit tests
- `apps/harvester/src/**/__tests__/*.test.ts` - Harvester tests
- `packages/*/src/__tests__/*.test.ts` - Package tests
- Vitest config: `apps/harvester/vitest.config.ts`

### Integration Boundaries Identified
1. **BullMQ Queues** (harvester):
   - `affiliate-feed` (3 attempts, exponential 5s/15s/45s backoff)
   - `product-resolve` (3 attempts, exponential 1s/5s/25s)
   - `embedding-generate` (3 attempts, exponential 2s/8s/32s)
   - `alert`, `crawl`, `fetch`, `extract`, `normalize`, `write`

2. **Stripe Webhooks** (api):
   - `checkout.session.completed` → subscription creation
   - `invoice.paid` / `invoice.payment_failed` → renewal/downgrade
   - `customer.subscription.updated/deleted/paused/resumed`
   - Event routing: consumer vs merchant based on metadata.type

3. **External Services**:
   - **Stripe**: Webhook signature verification, subscription management
   - **Resend**: Email notifications (alerts, failures)
   - **OpenAI**: Embedding generation
   - **SFTP/FTP**: Affiliate feed downloads

4. **Database Patterns** (Prisma):
   - Transactions in `handleConsumerCheckoutCompleted` (subscription + user tier)
   - Atomic upserts in `enqueueProductResolve` (idempotency key)
   - Advisory locks in affiliate feed worker (`acquireAdvisoryLock`)
   - Two-phase claim/commit in alerter (`claimNotificationSlot`)

### Timing Mechanisms
- **BullMQ retries**: Configurable attempts + exponential backoff
- **JWT expiry**: Standard `exp` claim, verified via `jwt.verify()`
- **Rate limiting**: Redis sliding window (various windows per endpoint)
- **Alert cooldowns**: 7-day cooldown, 5-minute claim expiry
- **Feed scheduling**: `scheduleFrequencyHours`, `nextRunAt`
- **Consecutive failure tracking**: Auto-disable after 3 failures

---

## Phase 1: Invariants (MUST Statements)

### Webhook Idempotency
1. **STRIPE_WEBHOOK_IDEMPOTENT**: A Stripe webhook with the same `event.id` processed multiple times MUST result in exactly one state transition and one side effect (e.g., one tier upgrade, one audit log entry).

2. **STRIPE_WEBHOOK_ORDERING**: Out-of-order Stripe webhooks MUST NOT move subscription state backwards (e.g., `subscription.deleted` followed by delayed `invoice.paid` MUST NOT re-activate).

### Queue Processing
3. **BULLMQ_DEDUP_JOB_ID**: BullMQ jobs with the same `jobId` MUST be deduplicated - only one job processed for `RESOLVE_SOURCE_PRODUCT_<sourceProductId>`.

4. **BULLMQ_REDELIVERY_SAFE**: If a BullMQ job is retried (worker crash, timeout), it MUST NOT create duplicate database rows or send duplicate emails.

5. **AFFILIATE_RUN_ATOMICITY**: The affiliate feed run record creation and `job.updateData({ runId })` MUST be atomic - on retry, the same run record MUST be reused.

### Database Consistency
6. **PRICE_HISTORY_APPEND_ONLY**: Price records MUST be append-only. No existing price row may be modified or deleted by feed processing.

7. **TIER_ENFORCEMENT_SERVER_SIDE**: User tier MUST be resolved from database via JWT validation, NEVER from client headers. Ambiguous/expired tokens → FREE tier.

8. **TRANSACTION_ROLLBACK_SAFE**: If a Prisma transaction fails mid-flight (e.g., subscription created but user update fails), all changes MUST be rolled back.

### Alert Processing
9. **ALERT_EXACTLY_ONCE**: A price drop or back-in-stock alert for a given watchlist item MUST send exactly one notification per cooldown period, even under concurrent worker execution.

10. **ALERT_CLAIM_EXPIRY**: If an alert claim is stale (>5 minutes without commit), another worker MUST be able to claim and send the notification.

### Rate Limiting
11. **RATE_LIMIT_DISTRIBUTED**: Rate limits MUST be enforced consistently across API instances using Redis, not in-memory state.

12. **RATE_LIMIT_FAIL_OPEN**: Redis failures in rate limiting MUST fail open (allow request) but log the error.

### Auth & Security
13. **JWT_EXPIRY_BOUNDARY**: A JWT that expires during request processing MUST be rejected - no grace period.

14. **ADMIN_FAIL_CLOSED**: Missing or invalid admin credentials MUST reject the request, not downgrade to user-level access.

### Feed Processing
15. **CIRCUIT_BREAKER_BLOCKS_PROMOTION**: If >30% of products would expire (and ≥10 absolute), promotion MUST be blocked and notification sent.

16. **CONSECUTIVE_FAILURE_AUTO_DISABLE**: After 3 consecutive feed failures, the feed MUST be auto-disabled and notification sent.

---

## Phase 2: Test Matrix

| # | Scenario | Component | Trigger | Fault Injection | Time Control | Expected Invariant |
|---|----------|-----------|---------|-----------------|--------------|-------------------|
| 1 | Duplicate Stripe webhook (same event.id) | api/payments | HTTP POST /webhook | Replay exact payload twice | None | STRIPE_WEBHOOK_IDEMPOTENT |
| 2 | Out-of-order: deleted then paid | api/payments | HTTP POST /webhook | Send deleted, then paid (older created) | setSystemTime | STRIPE_WEBHOOK_ORDERING |
| 3 | Delayed invoice.paid after cancellation | api/payments | HTTP POST /webhook | Process deleted, wait, process paid | fake timers | STRIPE_WEBHOOK_ORDERING |
| 4 | Concurrent checkout.session.completed | api/payments | HTTP POST /webhook (x2) | Parallel execution, same session | Promise.all | STRIPE_WEBHOOK_IDEMPOTENT |
| 5 | BullMQ job retry after crash | harvester/affiliate | Job failure + retry | Throw on first attempt | None | BULLMQ_REDELIVERY_SAFE |
| 6 | Duplicate resolver job (same sourceProductId) | harvester/resolver | enqueueProductResolve x2 | Call twice rapidly | None | BULLMQ_DEDUP_JOB_ID |
| 7 | Resolver job redelivery | harvester/resolver | Worker stall | Mock stalled event | None | BULLMQ_REDELIVERY_SAFE |
| 8 | Affiliate run atomicity on retry | harvester/affiliate | Job retry | Fail after run creation | None | AFFILIATE_RUN_ATOMICITY |
| 9 | Lock contention (parallel feeds) | harvester/affiliate | Parallel job start | Two jobs same feedLockId | Promise.all | Lock exclusion |
| 10 | Price signature dedup | harvester/affiliate | Duplicate product in feed | Same product twice | None | PRICE_HISTORY_APPEND_ONLY |
| 11 | Alert concurrent claim | harvester/alerter | Parallel alert jobs | Same watchlistItemId | Promise.all | ALERT_EXACTLY_ONCE |
| 12 | Alert claim expiry | harvester/alerter | Stale claim | Set claimedAt to past | setSystemTime | ALERT_CLAIM_EXPIRY |
| 13 | Rate limit burst | api/auth | 101 requests | Rapid fire requests | None | RATE_LIMIT_DISTRIBUTED |
| 14 | Rate limit Redis failure | api/auth | Request during outage | Mock Redis error | None | RATE_LIMIT_FAIL_OPEN |
| 15 | JWT expiry mid-request | api/auth | Authenticated request | Token exp = now - 1s | setSystemTime | JWT_EXPIRY_BOUNDARY |
| 16 | JWT clock skew | api/auth | Token near expiry | Clock 30s ahead | setSystemTime | JWT_EXPIRY_BOUNDARY |
| 17 | Transaction partial failure | api/payments | checkout.session.completed | Fail user update in tx | Mock Prisma | TRANSACTION_ROLLBACK_SAFE |
| 18 | Circuit breaker trigger | harvester/affiliate | Large product expiry | >30% expiry | None | CIRCUIT_BREAKER_BLOCKS_PROMOTION |
| 19 | Circuit breaker percentage edge | harvester/affiliate | Exactly 30% expiry | 30/100 products | None | Edge case (should pass) |
| 20 | Consecutive failure auto-disable | harvester/affiliate | 3 failures | Throw 3x | None | CONSECUTIVE_FAILURE_AUTO_DISABLE |
| 21 | Recovery after failures | harvester/affiliate | Success after 2 failures | Fail 2x, succeed | None | consecutiveFailures reset |
| 22 | Timeout then success (429 backoff) | harvester/fetcher | SFTP download | Return [429, 429, 200] | fake timers | Retry with backoff |
| 23 | Partial downstream outage | harvester/affiliate | Resend down | Mock Resend error | None | Continue processing |
| 24 | Embedding API rate limit | harvester/embedding | OpenAI 429 | Return 429 with Retry-After | fake timers | Retry with backoff |
| 25 | Cancellation vs completion race | api/payments | subscription.deleted + paid | Near-simultaneous | Promise.race | Final state is deleted |
| 26 | Worker crash mid-processing | harvester/affiliate | Process abort | Throw mid-pipeline | None | Run status = RUNNING on restart |
| 27 | DB transaction race (lost update) | api/payments | Concurrent merchant update | Parallel updates | Promise.all | No lost updates |
| 28 | Permutation: webhook order variants | api/payments | Multiple event sequences | Fixed seed permutations | None | Invariants hold for all orders |
| 29 | Timezone edge: midnight crossing | harvester/alerter | Alert at 23:59:59 | setSystemTime to midnight | setSystemTime | Cooldown calculates correctly |
| 30 | Feed file not found (expected skip) | harvester/affiliate | SFTP 550 | Return FILE_NOT_FOUND | None | SUCCEEDED + skippedReason |

---

## Phase 3: High-ROI Test Implementation (Top 10)

See implementation files:
- `apps/api/src/__tests__/integration/stripe-webhook-idempotency.test.ts`
- `apps/api/src/__tests__/integration/stripe-webhook-ordering.test.ts`
- `apps/harvester/src/__tests__/integration/bullmq-dedup.test.ts`
- `apps/harvester/src/__tests__/integration/alert-claim-race.test.ts`
- `apps/api/src/__tests__/integration/rate-limit-distributed.test.ts`
- `apps/api/src/__tests__/integration/jwt-expiry-boundary.test.ts`
- `apps/harvester/src/__tests__/integration/circuit-breaker.test.ts`
- `apps/harvester/src/__tests__/integration/consecutive-failure.test.ts`
- `apps/api/src/__tests__/integration/transaction-rollback.test.ts`
- `apps/api/src/__tests__/integration/webhook-permutation.test.ts`

---

## Phase 4: Contract Tests

See implementation files:
- `apps/api/src/__tests__/contracts/stripe-webhook-schema.test.ts`
- `apps/api/src/__tests__/contracts/zod-validation.test.ts`
- `apps/harvester/src/__tests__/contracts/feed-parser-schema.test.ts`

---

## How to Run

```bash
# From repo root
pnpm --filter @ironscout/api test:run
pnpm --filter @ironscout/harvester test:run

# Run integration tests only
pnpm --filter @ironscout/api test:run src/__tests__/integration
pnpm --filter @ironscout/harvester test:run src/__tests__/integration

# Run with coverage
pnpm --filter @ironscout/api test:coverage
```

---

## Assumptions

1. **No real Redis in unit tests**: Tests mock Redis or use in-memory stores. Real Redis only in CI with isolated keyspaces.
2. **No real Stripe calls**: All Stripe SDK methods are mocked. Webhook signature verification uses test secrets.
3. **No real OpenAI/Resend**: All external API calls are mocked with deterministic responses.
4. **Prisma mocking**: Unit tests mock Prisma client. Integration tests may use test database in CI.
5. **BullMQ testing**: Most tests mock queue/worker. Integration tests use real Redis with unique queue names.
6. **Time control**: Uses `vi.useFakeTimers()` and `vi.setSystemTime()` for deterministic time behavior.

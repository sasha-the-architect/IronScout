# System Overview

This document describes IronScout's current system architecture as implemented in the codebase. It is intended to be accurate, operable, and conservative. It avoids product promises. Those live in `context/00_public_promises.md`.

Legacy terminology notice:
Some paths, queues, or historical references use the term “dealer”. The canonical model is Merchant (portal account) and Retailer (consumer storefront).

---

## High-Level Architecture

IronScout is a multi-app system with a shared database and a queue-backed ingestion pipeline.

### Applications

- **API (`apps/api`)**
  - Express service that exposes search, product, pricing, alerts, watchlist, and admin/ops endpoints.
  - Hosts the AI search service integration (intent parsing, embeddings, ranking).

- **Consumer Web (`apps/web`)**
  - Next.js App Router UI for consumers.
  - Includes user flows (signup, dashboard, search, pricing) and a lightweight admin area for embeddings/executions/logs/sources.

- **Merchant Portal (`apps/dealer` legacy path)**
  - Next.js App Router UI for Merchant onboarding and feed management (including quarantine and corrections workflows).
  - Merchant-specific dashboard and analytics surfaces.

- **Admin Portal (`apps/admin`)**
  - Next.js App Router UI for operations and Merchant lifecycle management.
  - Includes Merchant approval/suspension/reactivation routes and Merchant detail views.

- **Harvester (`apps/harvester`)**
  - Node worker process using BullMQ queues to ingest and normalize Retailer price data (including Merchant-submitted feeds).
  - Runs pipeline workers and legacy dealer-named ingestion/benchmark/insight jobs (Merchant portal ingestion).

### Shared Data Layer

- **Database:** Postgres via Prisma (`@ironscout/db`).
- **Search:** Embeddings and vector search are implemented from the API side against the database (pgvector is assumed by docs and code references).
- **Queues:** Redis + BullMQ for ingestion pipeline and Merchant portal background jobs (legacy dealer-* queue names).

---

## Core Data Flows

### 1) Consumer Search and Product Discovery

**Request path**
1. Consumer uses `apps/web` search UI.
2. `apps/web` calls `apps/api` search endpoints.
3. `apps/api`:
   - Parses intent (AI-assisted).
   - Applies explicit filters (Zod schema).
   - Queries canonical products and offers from Postgres.
   - Applies tier-based shaping (limits, history access, premium ranking).
4. Response is rendered in consumer UI (search results, product page, dashboard).

**Key components in API**
- `src/services/ai-search/*`
  - intent parsing
  - embedding service
  - ranking strategies (including premium ranking hooks)
- `src/routes/search.ts`, `src/routes/products.ts`

**Primary output**
- Canonical product groups + offer list (Retailer-administered offers) with price and availability and optionally history.

---

### 2) Retailer and Affiliate Ingestion (Harvester Pipeline)

Harvester is a queue pipeline. The rough sequence is:

1. **Schedule** enabled sources -> create execution record -> enqueue crawl/fetch work
2. **Fetch** source URLs (HTTP)
3. **Extract** offers from pages/feed payloads
4. **Normalize** extracted items (ammo-specific normalization)
5. **Write** upserts into Postgres
6. **Alert** triggers as appropriate

**Key components in Harvester**
- `src/scheduler/*` for crawl scheduling
- `src/fetcher/*`, `src/extractor/*`, `src/normalizer/*`, `src/writer/*`, `src/alerter/*`
- BullMQ queues defined in `src/config/queues.ts`

---

### 3) Merchant Portal Feed Ingestion (legacy dealer pipeline naming)

Merchants provide feeds. Harvester supports Merchant portal jobs (legacy dealer-* names):

- feed ingest
- SKU match
- benchmark
- insight generation

Merchant portal job scheduling runs inside the worker process via a scheduler function (interval-based) and enqueues BullMQ jobs (legacy dealer-* queues).

**Key components**
- `src/merchant/feed-ingest.ts`
- `src/merchant/sku-match.ts`
- `src/merchant/benchmark.ts`
- `src/merchant/insight.ts`
- `src/merchant/scheduler.ts` (starts an interval scheduler)

---

## Visibility Stack (Canonical)

- **Eligibility** (Retailer): `retailers.visibilityStatus = ELIGIBLE`
- **Entitlement** (Merchant↔Retailer listing): `merchant_retailers.listingStatus = LISTED` AND relationship `status = ACTIVE`
- **Corrections overlay**: Adjusts facts (prices) only; does not change eligibility/listing.
- **Query-time predicate**: consumer offers must satisfy eligibility AND entitlement. Subscription status is not a consumer visibility gate.
- **v1 constraint**: each Retailer belongs to exactly one Merchant; Merchants pay per Retailer listing.

This stack must be enforced in all consumer reads (search, product, dashboard, alerts).

---

## High-Level Architecture

IronScout is a multi-app system with a shared database and a queue-backed ingestion pipeline.

### Applications

- **API (`apps/api`)**
  - Express service that exposes search, product, pricing, alerts, watchlist, and admin/ops endpoints.
  - Hosts the AI search service integration (intent parsing, embeddings, ranking).

- **Consumer Web (`apps/web`)**
  - Next.js App Router UI for consumers.
  - Includes user flows (signup, dashboard, search, pricing) and a lightweight admin area for embeddings/executions/logs/sources.

- **Merchant Portal (`apps/dealer` legacy path)**
  - Next.js App Router UI for Merchant onboarding and feed management (including quarantine and corrections workflows).
  - Merchant-specific dashboard and analytics surfaces.

- **Admin Portal (`apps/admin`)**
  - Next.js App Router UI for operations and Merchant lifecycle management.
  - Includes Merchant approval/suspension/reactivation routes and Merchant detail views.

- **Harvester (`apps/harvester`)**
  - Node worker process using BullMQ queues to ingest and normalize Retailer price data (including Merchant-submitted feeds).
  - Runs pipeline workers and legacy dealer-named ingestion/benchmark/insight jobs (Merchant portal ingestion).

### Shared Data Layer

- **Database:** Postgres via Prisma (`@ironscout/db`).
- **Search:** Embeddings and vector search are implemented from the API side against the database (pgvector is assumed by docs and code references).
- **Queues:** Redis + BullMQ for ingestion pipeline and Merchant portal background jobs (legacy dealer-* queue names).

---

## Core Data Flows

### 1) Consumer Search and Product Discovery

**Request path**
1. Consumer uses `apps/web` search UI.
2. `apps/web` calls `apps/api` search endpoints.
3. `apps/api`:
   - Parses intent (AI-assisted).
   - Applies explicit filters (Zod schema).
   - Queries canonical products and offers from Postgres.
   - Applies tier-based shaping (limits, history access, premium ranking).
4. Response is rendered in consumer UI (search results, product page, dashboard).

**Key components in API**
- `src/services/ai-search/*`
  - intent parsing
  - embedding service
  - ranking strategies (including premium ranking hooks)
- `src/routes/search.ts`, `src/routes/products.ts`

**Primary output**
- Canonical product groups + offer list (Retailer-administered offers) with price and availability and optionally history.

---

### 2) Retailer and Affiliate Ingestion (Harvester Pipeline)

Harvester is a queue pipeline. The rough sequence is:

1. **Schedule** enabled sources -> create execution record -> enqueue crawl/fetch work
2. **Fetch** source URLs (HTTP)
3. **Extract** offers from pages/feed payloads
4. **Normalize** extracted items (ammo-specific normalization)
5. **Write** upserts into Postgres
6. **Alert** triggers as appropriate

**Key components in Harvester**
- `src/scheduler/*` for crawl scheduling
- `src/fetcher/*`, `src/extractor/*`, `src/normalizer/*`, `src/writer/*`, `src/alerter/*`
- BullMQ queues defined in `src/config/queues.ts`

---

### 3) Merchant Portal Feed Ingestion (legacy dealer pipeline naming)

Merchants provide feeds. Harvester supports Merchant portal jobs (legacy dealer-* names):

- feed ingest
- SKU match
- benchmark
- insight generation

Merchant portal job scheduling runs inside the worker process via a scheduler function (interval-based) and enqueues BullMQ jobs (legacy dealer-* queues).

**Key components**
- `src/merchant/feed-ingest.ts`
- `src/merchant/sku-match.ts`
- `src/merchant/benchmark.ts`
- `src/merchant/insight.ts`
- `src/merchant/scheduler.ts` (starts an interval scheduler)

---

## Visibility Stack (Canonical)

- **Eligibility** (Retailer): `retailers.visibilityStatus = ELIGIBLE`
- **Entitlement** (Merchant↔Retailer listing): `merchant_retailers.listingStatus = LISTED` AND relationship `status = ACTIVE`
- **Corrections overlay**: Adjusts facts (prices) only; does not change eligibility/listing.
- **Query-time predicate**: consumer offers must satisfy eligibility AND entitlement. Subscription status is not a consumer visibility gate.
- **v1 constraint**: each Retailer belongs to exactly one Merchant; Merchants pay per Retailer listing.

This stack must be enforced in all consumer reads (search, product, dashboard, alerts).

---

## Auth, Roles, and Enforcement Surfaces

### Consumer identity

- Consumer auth for web surfaces appears to be handled in Next.js route handlers under `apps/web/app/api/auth/*`.
- API enforces tier/limits through a tier configuration module in `apps/api/src/config/tiers.ts`.

### Merchant identity

- Merchant portal has its own auth flows under `apps/dealer/app/api/auth/*` (legacy path).
- Retailer feed management and quarantine endpoints exist in the portal under `apps/dealer/app/api/feed/*` (legacy path).

### Admin identity

- Admin portal uses NextAuth under `apps/admin/app/api/auth/[...nextauth]/route.ts`.
- Admin routes exist for Merchant approval and lifecycle actions under `apps/admin/app/api/dealers/*` (legacy path naming).

### Subscription and tier enforcement

- API tier gating is driven by `TIER_CONFIG` and helper functions (limits/history access/etc).
- Consumer visibility is governed by the visibility stack: Retailer eligibility (`visibilityStatus = ELIGIBLE`) + Merchant↔Retailer entitlement (`listingStatus = LISTED` and relationship `status = ACTIVE`). Subscription status is not a consumer visibility predicate.

---

## Observability and Operations

Current system provides:
- Execution records (crawler/execution tracking)
- Logs endpoints in API and UIs surfacing executions/logs
- Harvester console logs and queue stats

Operational needs are documented separately in `context/operations/*`.

---

## Inconsistencies and Decision Points

This section calls out concrete mismatches between code and current context docs. These require decisions and likely code changes.

### 1) API tier resolution trusts `X-User-Id` header (must change)
**Where**
- `apps/api/src/routes/search.ts` defines `getUserTier()` and explicitly states it checks `X-User-Id`.

**Why it conflicts**
- `context/03_release_criteria.md` and `context/05_security_and_trust.md` require server-side enforcement and no client spoofing.

**Decision needed**
- Choose a single identity mechanism for API:
  - verify a JWT from your web auth, or
  - use server-to-server auth from web to API, or
  - consolidate to a single Next.js API surface.
  
**Likely code change**
- Remove header-based tier lookup.
- Resolve tier from verified auth (JWT/session) or internal trusted token.

---

### 2) Out-of-scope features appear in tier config (must remain disabled)
**Where**
- `apps/api/src/config/tiers.ts` includes flags such as `buyWaitScore` and `verifiedSavings`.

**Why it conflicts**
- `context/02_v1_scope_and_cut_list.md` explicitly cuts verdicts and savings attribution.

**Decision needed**
- Keep flags as internal placeholders, but ensure:
  - no UI surfaces them,
  - no marketing references them,
  - no endpoints return these fields.

**Likely code change**
- Ensure response shaping strips any verdict/savings fields (even if computed) unless explicitly enabled later.

---

### 3) Merchant scheduler uses in-process interval scheduling (legacy dealer naming)
**Where**
- `apps/harvester/src/dealer/scheduler.ts` contains `setInterval(...)` via `startMerchantScheduler()` (legacy `startDealerScheduler()`).

**Why it matters**
- If you run more than one harvester worker instance, you can double-schedule Merchant jobs unless a distributed lock or singleton deployment is enforced.

**Decision needed**
- Declare an operating mode for v1:
  - **Singleton scheduler** (only one harvester instance runs Merchant scheduler), or
  - Add **distributed locking** (Redis lock), or
  - Move to BullMQ repeatable jobs as scheduler.

**Likely code change**
- If not singleton, add a Redis lock around the scheduler tick to prevent duplicates.

---

### 4) Embedding queue spec vs implementation (docs vs reality)
**Observed**
- API has embedding generation and backfill utilities in `apps/api/src/services/ai-search/embedding-service.ts`.
- Harvester does not appear to generate embeddings as part of ingestion.
- “embedding queue” design exists in prior docs, but the implemented path is API-centric.

**Decision needed**
- Choose one canonical approach:
  - Embeddings are generated in API (current reality), or
  - Embeddings are generated asynchronously in harvester/queue (spec direction).

**Likely code/doc change**
- If staying API-centric for v1, architecture docs should reflect that and treat queue-based embedding as deferred.

---

### 5) Two admin surfaces exist (web admin vs admin app)
**Observed**
- `apps/web` has `app/admin/*` pages for embeddings/executions/logs/sources.
- `apps/admin` is a separate admin portal for Merchant lifecycle.

**Decision needed**
- Confirm intended split:
  - consumer admin tools in `apps/web` and Merchant ops in `apps/admin`, or
  - consolidate admin into one portal to reduce surface area.

**Likely code/doc change**
- If split remains, document roles and access boundaries explicitly in `architecture/` and `apps/` docs.

---

## System Constraints (Current Reality)

- System is queue-backed and async. Data is not real-time.
- Merchant ingestion depends on feed health; Retailer eligibility enforcement is at query time.
- Trust depends on conservative language and server-side gating.
- Operational simplicity matters more than feature breadth in v1.

---

## Guiding Principle

> The architecture exists to enforce trust boundaries and keep ingestion predictable, not to maximize feature count.




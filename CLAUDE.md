# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IronScout.ai is an AI-powered ammunition search and price comparison platform that tracks and aggregates live product listings from multiple vendor sites. The platform provides proactive price monitoring, real-time alerts, AI-powered semantic search, and expert-level performance recommendations. Built as a pnpm monorepo with three main applications:

1. **Web App** (`apps/web/`) - Next.js 14 frontend with App Router
2. **API** (`apps/api/`) - Express.js REST API backend
3. **Harvester** (`apps/harvester/`) - BullMQ-based distributed crawling system with dealer portal workers

**Critical**: These are separate deployable services. The frontend CANNOT access the database directly and must use the API. The harvester runs independently as background workers.

## Key Differentiators

IronScout differentiates from competitors (AmmoSeek, etc.) through:
- **AI-Powered Semantic Search**: Natural language queries like "best 9mm for home defense with short barrel"
- **Performance-Aware Recommendations**: Rankings based on bullet type, suppressor compatibility, barrel length optimization
- **Best Value Scoring**: Composite algorithm considering price vs average, shipping, retailer trust, brand quality
- **Premium AI Features**: Deep analysis for Premium users vs basic search for Free tier
- **Dealer Portal**: Self-service portal for dealers to manage feeds and get market insights

## Development Commands

### Starting Services

All commands run from project root unless otherwise specified.

```bash
# Install dependencies (first time)
pnpm install

# Start all services in development
pnpm dev                           # Starts web (3000) + API (8000)

# Start individual services
cd apps/web && pnpm dev            # Frontend only (localhost:3000)
cd apps/api && pnpm dev            # API only (localhost:8000)
cd apps/harvester && pnpm worker   # Start harvester workers (including dealer workers)

# Harvester commands
cd apps/harvester
pnpm worker                        # Start all 10 pipeline workers
pnpm dev run                       # Trigger immediate crawl
pnpm dev schedule                  # Set up recurring hourly crawls
pnpm dev status                    # Show queue status
```

### Database Operations

Run from `packages/db/` or root:

```bash
cd packages/db

pnpm db:generate      # Generate Prisma client (after schema changes)
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema changes without migrations
pnpm db:studio        # Open Prisma Studio GUI
pnpm db:seed          # Seed products and retailers
pnpm db:seed-source   # Seed test crawl source
```

**Important**: After any schema.prisma changes, ALWAYS run `pnpm db:generate` to update the Prisma client.

### Build & Type Checking

```bash
pnpm build           # Build all apps (recursive)
pnpm lint            # Lint all apps (recursive)
pnpm type-check      # TypeScript check all apps (recursive)
```

## Architecture & Data Flow

### Service Communication

```
User → Web App (3000) → API (8000) → PostgreSQL
                                  ↗
Admin UI → API → Redis → Harvester Workers → PostgreSQL

Dealer → Dealer Portal → API → Redis → Dealer Workers → PostgreSQL
```

### Harvester Pipeline

The harvester uses a 10-worker pipeline architecture with BullMQ queues:

**Core Pipeline (6 workers):**
1. **Scheduler** - Creates crawl jobs from Source records
2. **Fetcher** - Downloads content (supports RSS, HTML, JSON, JS_RENDERED)
3. **Extractor** - Parses content and extracts product data
4. **Normalizer** - Standardizes data formats (prices, categories, brands)
5. **Writer** - Upserts products, retailers, and prices to PostgreSQL
6. **Alerter** - Checks for price changes and triggers user alerts

**Dealer Portal Pipeline (4 workers):**
1. **DealerFeedIngest** - Downloads and parses dealer CSV/XML/JSON feeds
2. **DealerSkuMatch** - Matches dealer SKUs to canonical products
3. **DealerBenchmark** - Calculates market price benchmarks per caliber
4. **DealerInsight** - Generates actionable insights for dealers

**Key Files**:
- `apps/harvester/src/worker.ts` - Starts all 10 workers
- `apps/harvester/src/scheduler/index.ts` - Job creation
- `apps/harvester/src/dealer/` - Dealer portal workers
- `apps/harvester/src/config/queues.ts` - Queue definitions

### Tier System

**FREE Tier:**
- 5 alerts max, 60-minute delay
- 20 search results
- Basic AI purpose detection
- Standard relevance ranking

**PREMIUM Tier ($4.99/mo):**
- Unlimited real-time alerts
- 100 search results, 365-day price history
- Advanced AI: purpose-optimized ranking, Best Value scores
- Premium filters: +P, subsonic, velocity, bullet type
- Performance badges and AI explanations

Configuration: `apps/api/src/config/tiers.ts`

## Database Schema (Prisma)

### Core Models

- **User** - Authentication, tier (FREE/PREMIUM)
- **Product** - Product catalog with Premium AI fields
- **Retailer** - Stores with tier (STANDARD/PREMIUM)
- **Price** - Price tracking with shipping costs
- **Alert** - User price alerts
- **ProductReport** - User-submitted data issues
- **Source/Execution/ExecutionLog** - Crawl tracking

### Premium AI Fields on Product

```prisma
bulletType         BulletType?      // JHP, FMJ, SP, etc.
pressureRating     PressureRating?  // STANDARD, PLUS_P, NATO
muzzleVelocityFps  Int?             // For subsonic detection
isSubsonic         Boolean?         // Suppressor filtering
shortBarrelOptimized Boolean?       // Compact pistol optimization
suppressorSafe     Boolean?         // Suppressor compatibility
lowFlash           Boolean?         // Low-light optimization
lowRecoil          Boolean?         // Reduced recoil
controlledExpansion Boolean?        // Overpenetration limit
matchGrade         Boolean?         // Competition quality
dataSource         DataSource?      // How data was populated
dataConfidence     Decimal?         // Quality score 0.00-1.00
embedding          vector(1536)     // Semantic search vector
```

### Dealer Portal Models

- **Dealer** - Dealer registration, auth, verification
- **DealerFeed** - Feed configuration and status
- **DealerSku** - Individual SKU prices from feeds
- **CanonicalSku** - Product matching bridge
- **MarketBenchmark** - Price benchmarks by caliber
- **DealerInsight** - Actionable insights
- **PixelEvent/ClickEvent** - Attribution tracking

## API Routes (`apps/api/src/routes/`)

### Core Routes
- `products.ts` - Product search
- `alerts.ts` - Price alert management
- `ads.ts` - Advertisement retrieval
- `payments.ts` - Stripe webhook handling
- `sources.ts` - Crawl source CRUD
- `executions.ts` - Execution management
- `logs.ts` - Execution log retrieval
- `harvester.ts` - Harvester control endpoints

### AI Search Routes (`search.ts`)
- `POST /api/search/semantic` - AI-powered semantic search
- `POST /api/search/parse` - Parse query intent (debugging)
- `GET /api/search/suggestions` - Autocomplete
- `POST /api/search/nl-to-filters` - Natural language to filter conversion
- `GET /api/search/premium-filters` - Premium filter definitions
- `GET /api/search/admin/embedding-stats` - Embedding coverage
- `GET /api/search/admin/ballistic-stats` - Premium field coverage
- `POST /api/search/admin/backfill-embeddings` - Trigger backfill
- `GET /api/search/debug/calibers` - Debug caliber values
- `GET /api/search/debug/purposes` - Debug purpose values
- `GET /api/search/debug/bullet-types` - Debug bullet types

### Reports Routes (`reports.ts`)
- `POST /api/reports` - Create product report
- `GET /api/reports` - List reports (admin)
- `GET /api/reports/:id` - Get single report
- `GET /api/reports/product/:productId` - Reports for product
- `PATCH /api/reports/:id` - Update report status
- `GET /api/reports/stats/summary` - Report statistics

## AI Search Services (`apps/api/src/services/ai-search/`)

- `embedding-service.ts` - OpenAI text-embedding-3-small
- `intent-parser.ts` - Natural language parsing
- `search-service.ts` - Semantic search with pgvector
- `premium-ranking.ts` - Performance-aware ranking
- `best-value-score.ts` - Composite value algorithm
- `ammo-knowledge.ts` - Domain knowledge

**Key Functions:**
```typescript
// Main search function
aiSearch(query, { page, limit, sortBy, explicitFilters, userTier })

// Intent parsing
parseSearchIntent(query, { userTier })

// Premium ranking
applyPremiumRanking(products, { premiumIntent, userPurpose, includeBestValue })

// Best Value calculation
calculateBestValueScore(product, userPurpose)
```

## Frontend Patterns (`apps/web/`)

### Structure

- `app/` - Next.js App Router pages
- `app/admin/` - Admin console
- `app/auth/` - Authentication pages
- `components/` - Reusable React components
- `components/ui/` - Shadcn/UI primitives
- `lib/api.ts` - API client functions

### Authentication

- NextAuth.js with Google OAuth
- PrismaAdapter for user storage
- JWT sessions with user.id injection
- Tier passed via X-User-Id header

## Environment Configuration

### Required Variables

**Root `.env`**:
```env
DATABASE_URL="postgresql://..."
```

**API `.env`** (`apps/api/.env`):
```env
DATABASE_URL="postgresql://..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
FRONTEND_URL="http://localhost:3000"
OPENAI_API_KEY="sk-..."  # For embeddings
PORT=8000
REDIS_HOST="localhost"
REDIS_PORT=6379
```

**Web `.env.local`** (`apps/web/.env.local`):
```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

## Adding New Features

### New AI Search Filter

1. Add field to Product model in `schema.prisma`
2. Add to BulletType/PressureRating enums if needed
3. Update `intent-parser.ts` to extract from queries
4. Update `premium-ranking.ts` boost logic
5. Add to `search.ts` filter validation schema
6. Update `search.ts` Premium filters endpoint
7. Run `pnpm db:generate && pnpm db:migrate`

### New Dealer Portal Feature

1. Add model to `schema.prisma` in Dealer Portal section
2. Create worker in `apps/harvester/src/dealer/`
3. Add queue to `apps/harvester/src/config/queues.ts`
4. Register worker in `apps/harvester/src/worker.ts`
5. Add API routes for frontend access

## Testing the System

### Quick Test Flow

1. Start all services (3 terminals)
2. Access http://localhost:3000
3. Test AI search with queries like:
   - "cheap 9mm brass"
   - "best defensive .45 ACP low flash"
   - "subsonic .300 blackout for suppressor"
4. Admin console: http://localhost:3000/admin
   - View embedding stats
   - Run embedding backfill
   - Check ballistic field coverage

### Admin Embedding Tools

1. Navigate to Admin > Embeddings
2. View embedding coverage stats
3. View ballistic field stats (Phase 2)
4. Trigger backfill for products without embeddings
5. Monitor progress

## Important Constraints

1. **No direct database access from frontend** - Always use API
2. **pnpm only** - npm/yarn will break workspace references
3. **Always import `prisma` from `@ironscout/db`**
4. **Tier checks in API** - Use `getUserTier()` helper and `hasFeature()`
5. **Premium filters stripped for FREE** - Backend enforces tier limits
6. **Redis required** - Both harvester and AI search cache need Redis
7. **OpenAI API key required** - For embedding generation

## Code Style & Conventions

- TypeScript strict mode enabled
- Zod schemas for API validation
- Async/await preferred
- Error handling in API routes
- Component naming: PascalCase
- Mobile-first responsive design
- CommonMark for markdown (blank lines before lists)

---
*Last updated: December 7, 2025*

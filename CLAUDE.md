# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZeroedIn s an AI-powered shopping assistant platform that tracks and aggregates live product listings for ammunition, gun parts & accessories from multiple vendor sites. The platform provides proactive price monitoring, real-time alerts, and AI-powered product recommendations. Built as a pnpm monorepo with three main applications:


1. **Web App** (`apps/web/`) - Next.js 14 frontend with App Router
2. **API** (`apps/api/`) - Express.js REST API backend
3. **Harvester** (`apps/harvester/`) - BullMQ-based distributed crawling system

**Critical**: These are separate deployable services. The frontend CANNOT access the database directly and must use the API. The harvester runs independently as background workers.

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
cd apps/harvester && pnpm worker   # Start harvester workers

# Harvester commands
cd apps/harvester
pnpm worker                        # Start all 6 pipeline workers
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
```

### Harvester Pipeline

The harvester uses a 6-stage pipeline architecture with BullMQ queues:

1. **Scheduler** - Creates crawl jobs from Source records
2. **Fetcher** - Downloads content (supports RSS, HTML, JSON, JS_RENDERED)
3. **Extractor** - Parses content and extracts product data
4. **Normalizer** - Standardizes data formats (prices, categories, brands)
5. **Writer** - Upserts products, retailers, and prices to PostgreSQL
6. **Alerter** - Checks for price changes and triggers user alerts

**Key Files**:
- `apps/harvester/src/worker.ts` - Starts all 6 workers
- `apps/harvester/src/scheduler/index.ts` - Job creation
- `apps/harvester/src/config/queues.ts` - Queue definitions
- Each stage has its own worker and queue for parallel processing

### Execution Tracking

Every crawl creates an `Execution` record with:
- Status: PENDING → RUNNING → SUCCESS/FAILED
- Metrics: itemsFound, itemsUpserted, duration
- Detailed logs in `ExecutionLog` table (CRAWL_START, FETCH_OK, EXTRACT_OK, etc.)

View in admin console at http://localhost:3000/admin

## Database Schema (Prisma)

### MVP Models

Core models in active use:

- **User** - Authentication, tier (FREE/PREMIUM)
- **Product** - Product catalog
- **Retailer** - Stores with tier (STANDARD/PREMIUM)
- **Price** - Price tracking history
- **Alert** - User price alerts (PRICE_DROP, BACK_IN_STOCK, NEW_PRODUCT)
- **Advertisement** - Ads for search results
- **Subscription** - User/retailer subscriptions (Stripe integration)
- **Source** - Crawl source configuration (URL, type, interval)
- **Execution** - Crawl job execution records
- **ExecutionLog** - Detailed pipeline logs

### Post-MVP Models (Stubs Only)

These models exist in schema but are NOT implemented in MVP:
- **DataSubscription** - DaaS API access (marked with POST-MVP comment)
- **MarketReport** - Market analytics (marked with POST-MVP comment)

**Do NOT implement features using these models** unless explicitly requested.

### Important Relations

- User → Alert, Subscription (CASCADE delete)
- Product → Price, Alert (CASCADE delete)
- Retailer → Price, Subscription (CASCADE delete)
- Source → Execution (CASCADE delete)
- Execution → ExecutionLog (CASCADE delete)

## Frontend Patterns (`apps/web/`)

### Structure

- `app/` - Next.js App Router pages (server components by default)
- `app/admin/` - Admin console for managing crawl sources and viewing logs
- `app/auth/` - Authentication pages
- `components/` - Reusable React components
- `components/admin/` - Admin-specific components
- `components/ui/` - Shadcn/UI primitives
- `lib/api.ts` - API client functions with TypeScript interfaces
- `lib/utils.ts` - Utility functions

### Server vs Client Components

- **Server Components** (default): Layout, static pages, data fetching
- **Client Components** (`'use client'`): Interactive features (search filters, forms, admin console)

### API Integration

Frontend calls API via functions in `lib/api.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function searchProducts(params: SearchParams) {
  const response = await fetch(`${API_BASE}/api/products/search?...`)
  return response.json()
}
```

**Never access Prisma directly from frontend**. Always use API endpoints.

### Authentication

- NextAuth.js with Google OAuth
- PrismaAdapter for user storage
- JWT sessions with user.id injection
- Configuration: `app/api/auth/[...nextauth]/route.ts`

## API Patterns (`apps/api/`)

### Route Structure

Each feature area has a dedicated router in `src/routes/`:

- `products.ts` - Product search
- `alerts.ts` - Price alert management
- `ads.ts` - Advertisement retrieval
- `payments.ts` - Stripe webhook handling
- `sources.ts` - Crawl source CRUD
- `executions.ts` - Execution management and manual triggers
- `logs.ts` - Execution log retrieval
- `harvester.ts` - Harvester control endpoints
- `data.ts` - DaaS endpoints (POST-MVP, stub only)

### Standard Pattern

```typescript
import { Router } from 'express'
import { prisma } from '@zeroedin/db'
import { z } from 'zod'

const router = Router()

// Zod schema for validation
const searchSchema = z.object({
  query: z.string(),
  // ...
})

router.get('/search', async (req, res) => {
  const params = searchSchema.parse(req.query)
  const results = await prisma.product.findMany({ /* ... */ })
  res.json(results)
})

export default router
```

### Database Access

Always import Prisma from shared package:

```typescript
import { prisma } from '@zeroedin/db'  // ✅ Correct
```

Never instantiate a new PrismaClient in API or web code.

### CORS Configuration

API allows requests from frontend URL (configured in `src/index.ts`). Environment variable `FRONTEND_URL` controls CORS origin.

## Monorepo & Workspace Setup

### Package Manager

**CRITICAL**: This project uses `pnpm` workspaces. Do NOT use npm or yarn.

### Workspace Structure

```
ZeroedIn/
├── apps/
│   ├── api/         - Express backend
│   ├── web/         - Next.js frontend
│   └── harvester/   - BullMQ workers
├── packages/
│   └── db/          - Shared Prisma schema
├── package.json     - Root workspace config
└── pnpm-workspace.yaml
```

### Shared Dependencies

The `@zeroedin/db` package is shared across all apps:

```typescript
// In any app
import { prisma } from '@zeroedin/db'
```

When you modify `packages/db/schema.prisma`, all apps automatically get the updated types after running `pnpm db:generate`.

## Environment Configuration

### Required Variables

**Root `.env`** (for database operations):
```env
DATABASE_URL="postgresql://username:password@host:5432/zeroedin"
```

**API `.env`** (`apps/api/.env`):
```env
DATABASE_URL="postgresql://..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
FRONTEND_URL="http://localhost:3000"
PORT=8000
REDIS_HOST="localhost"
REDIS_PORT=6379
```

**Web `.env.local`** (`apps/web/.env.local`):
```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-secure-secret"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

**Harvester** uses same DATABASE_URL and REDIS_* variables as API (reads from packages/db/.env or apps/api/.env).

### Setup from Examples

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

## External Dependencies

### Required Services

1. **PostgreSQL** - Database (tested with PostgreSQL 14+)
   - Default connection: 10.10.9.28:5432
   - Database name: zeroedin

2. **Redis** - Queue system for harvester
   - Default: localhost:6379
   - Install: `sudo apt install redis-server` (WSL/Linux)
   - Start: `sudo service redis-server start`
   - Test: `redis-cli ping` (should return PONG)

### Payment Integration

Stripe is configured for subscriptions:
- Use test keys during development
- Webhook endpoint: `/api/payments/webhook`
- Set up webhook in Stripe dashboard for local testing (use Stripe CLI)

## Adding New Features

### New API Endpoint

1. Create route file: `apps/api/src/routes/feature.ts`
2. Define Zod validation schema
3. Implement route handlers with Prisma queries
4. Register in `apps/api/src/index.ts`: `app.use('/api/feature', featureRouter)`
5. Add client function to `apps/web/lib/api.ts`
6. Use in frontend components

### New Page

1. Create directory: `apps/web/app/path-name/`
2. Add `page.tsx` (server component by default)
3. Add `'use client'` only if interactive features needed
4. Import components from `components/`
5. Fetch data via API client functions (not direct Prisma)

### Database Model Change

1. Edit `packages/db/schema.prisma`
2. Create migration: `cd packages/db && pnpm db:migrate`
3. Generate client: `pnpm db:generate`
4. Update TypeScript interfaces in `apps/web/lib/api.ts` if needed
5. Update API endpoints to use new fields

### New Harvester Source Type

1. Add new `SourceType` enum value to schema.prisma
2. Update extractor logic in `apps/harvester/src/extractor/index.ts`
3. Add type-specific parsing (e.g., XML, API format)
4. Run migration and test with admin console

## Testing the System

### Quick Test Flow

1. Start all services:
   ```bash
   # Terminal 1
   cd apps/harvester && pnpm worker

   # Terminal 2
   cd apps/api && pnpm dev

   # Terminal 3
   cd apps/web && pnpm dev
   ```

2. Access admin console: http://localhost:3000/admin
3. Navigate to Sources page
4. Click "Run Now" on test source
5. Watch Executions page for status updates
6. View detailed logs in Logs page

### Expected Results

- Execution status: PENDING → RUNNING → SUCCESS
- Dashboard stats increase (items harvested count)
- Logs show: CRAWL_START, FETCH_OK, EXTRACT_OK, NORMALIZE_OK, WRITE_OK, EXEC_DONE
- Products appear in main search

## Common Issues & Solutions

### Prisma Client Not Found

```bash
cd packages/db
pnpm db:generate
```

### Redis Connection Error

```bash
# Start Redis
sudo service redis-server start  # WSL/Linux
docker start redis               # Docker

# Verify
redis-cli ping
```

### Workers Not Processing Jobs

1. Check Redis is running
2. Verify workers started: `cd apps/harvester && pnpm worker`
3. Check worker terminal for errors
4. Verify execution status in admin console

### API 404 Errors

- Check `NEXT_PUBLIC_API_URL` is set correctly in web app
- Verify API server is running on correct port
- Check CORS configuration in API allows frontend origin

## Important Constraints

1. **No direct database access from frontend** - Always use API
2. **pnpm only** - npm/yarn will break workspace references
3. **Always import `prisma` from `@zeroedin/db`** - Never instantiate PrismaClient
4. **Post-MVP features** - Do not implement DataSubscription or MarketReport features unless explicitly requested
5. **Redis required** - Harvester cannot function without Redis
6. **Cascading deletes** - Be aware that deleting users/products/sources will cascade delete related records

## Code Style & Conventions

- TypeScript strict mode enabled
- Frontend interfaces defined in `lib/api.ts`
- Zod schemas for API validation
- Async/await preferred over promises
- Error handling: try/catch in API routes, error responses with proper status codes
- Component naming: PascalCase for components, kebab-case for files
- Mobile-first responsive design with Tailwind breakpoints

## Responsive Design

Tailwind breakpoints used throughout:
- `sm:` 640px and up
- `md:` 768px and up
- `lg:` 1024px and up
- `xl:` 1280px and up

Layout adapts from single-column (mobile) to multi-column grids (desktop).

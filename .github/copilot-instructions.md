# ZeroedIn Copilot Instructions

AI coding agents should use this guide to understand the ZeroedIn architecture and conventions for maximum productivity.

## Architecture Overview

**ZeroedIn** is an AI-powered shopping assistant platform built as a monorepo with clear separation between frontend and backend.

- **Framework**: Next.js 14 (frontend) + Express.js (backend)
- **Package Manager**: pnpm workspaces (critical - all scripts use `pnpm`, not npm)
- **Database**: PostgreSQL with Prisma ORM
- **Deployment Model**: Decoupled services (frontend @ localhost:3000, API @ localhost:8000)

### Core Service Boundaries

1. **Web App** (`apps/web/`): Next.js with App Router, handles UI, authentication sessions, stripe integration
2. **API** (`apps/api/`): Express REST API, database queries, business logic
3. **Database Package** (`packages/db/`): Shared Prisma schema and client (critical import: `@zeroedin/db`)

**Key Insight**: The frontend and API are separate deployable units. Frontend cannot directly access database—must go through API.

## Critical Development Workflow

```bash
# Root level - starts BOTH services in parallel
pnpm dev                    # API on :8000 + Next.js on :3000

# Individual service development
cd apps/web && pnpm dev     # Frontend only
cd apps/api && pnpm dev     # Backend only
cd packages/db && pnpm db:migrate  # Database operations
```

**Important**: Use workspace root for all development. `pnpm dev` from root starts both services and is required for full functionality.

### Database Commands (always run from `packages/db/` or root)
```bash
pnpm db:generate    # Update Prisma client after schema changes
pnpm db:migrate     # Run pending migrations
pnpm db:studio      # Open visual database editor
```

## Component & Module Structure

### Frontend Patterns (`apps/web/`)

**Pages use Server Components by default** (`app/` router):
- Layout components (Header, Footer) are server components
- Client-heavy features (search filters, auth) use `'use client'` directive
- Search results use streaming with `Promise.all()` to fetch products + ads in parallel

**Component Organization**:
- `components/layout/` - Header, Footer (main layout)
- `components/dashboard/` - Dashboard widgets
- `components/search/` - Search-specific components (SearchResults, SearchFilters)
- `components/ui/` - Shadcn UI primitives (Button, Card, etc.)
- `lib/api.ts` - API client functions (searchProducts, getAds, etc.)
- `lib/utils.ts` - Utility functions

**Authentication**: NextAuth.js with Google OAuth, JWT sessions (see `app/providers.tsx` and `app/api/auth/[...nextauth]/route.ts`)

### API Patterns (`apps/api/`)

**Route Structure**: Each major feature gets a router in `src/routes/`:
- `products.ts` - GET /api/products/search (mock data currently)
- `alerts.ts` - Price alert management
- `ads.ts` - Advertisement retrieval
- `payments.ts` - Stripe webhook handling
- `data.ts` - DaaS endpoints (POST-MVP)

**Key Pattern**: Routes use Zod for validation before database queries (see `products.ts` searchSchema example)

**Database Access**: All routes import `{ prisma }` from `@zeroedin/db` and use Prisma client directly

## Data Flow & API Integration

1. **Frontend Request**: Component calls API function from `lib/api.ts`
2. **API Endpoint**: Route handler in `apps/api/src/routes/*.ts` handles request
3. **Database**: Prisma queries in route handlers
4. **Response**: JSON response with typed interfaces

**CORS Setup**: API allows requests from frontend URL (configured in `apps/api/src/index.ts`)

**Environment Variables**: Frontend needs `NEXT_PUBLIC_API_URL` (localhost:8000 in dev), API needs `FRONTEND_URL` for CORS

## Database Schema (Prisma)

**MVP Models**:
- `User` (tier: FREE/PREMIUM) - NextAuth.js compatible
- `Product` - Product catalog
- `Retailer` (tier: STANDARD/PREMIUM) - Dealer prioritization
- `Price` - Price tracking (includes inStock boolean)
- `Alert` (type: PRICE_DROP/BACK_IN_STOCK/NEW_PRODUCT) - User alerts
- `Advertisement` (type: DISPLAY/SPONSORED_PRODUCT/BANNER) - Ad content
- `Subscription` - User and retailer subscriptions (Stripe integration)

**POST-MVP Models (stubs, not MVP)**:
- `DataSubscription`, `MarketReport` - DaaS features marked with comment

**Key Relations**:
- User → Alert, Subscription
- Product → Price, Alert
- Retailer → Price, Subscription
- All Cascade on delete

## TypeScript & Conventions

- **Frontend types**: Defined in `lib/api.ts` (Product, Price, Retailer, etc.)
- **Shared exports**: `packages/db/index.ts` exports `{ prisma }` for both web and api
- **No shared components**: UI lives in web only, API has no React

**Type Strategy**: Frontend interfaces in api.ts match Prisma models; this is intentional for simplicity.

## UI/Styling

- **Framework**: Tailwind CSS + Shadcn/UI
- **Approach**: Mobile-first responsive design
- **Layout**: Header/Footer in layout.tsx, main content in page.tsx files
- **Globals**: `app/globals.css` contains Tailwind directives

**Responsive Breakpoints**: sm (640px), md (768px), lg (1024px), xl (1280px)

## Authentication & Payments

- **Auth**: NextAuth.js → Google OAuth → PrismaAdapter (users created automatically)
- **Sessions**: JWT strategy, user.id injected in session via callback
- **Stripe**: Secret key in backend, publishable key in frontend
- **Webhooks**: Stripe events handled in `/api/payments` route

## Common Tasks

### Adding a New API Endpoint
1. Create route file in `apps/api/src/routes/feature.ts`
2. Import and register in `apps/api/src/index.ts`: `app.use('/api/feature', featureRouter)`
3. Add Zod schema for validation
4. Use `prisma` from `@zeroedin/db` for queries
5. Add API client function in `apps/web/lib/api.ts`
6. Call from components with proper error handling

### Adding a New Page
1. Create folder structure in `apps/web/app/path/`
2. Add `page.tsx` (server component by default)
3. Import components from `components/`
4. Use `'use client'` only if needing interactivity
5. Call API client functions for data (not direct DB access)

### Database Schema Changes
1. Modify `packages/db/schema.prisma`
2. Create migration: `pnpm db:migrate` (auto-generates from schema diff)
3. Regenerate client: `pnpm db:generate`
4. Update TypeScript interfaces if adding new fields

## Known Patterns & Quirks

- **Mock Data**: API currently returns mock product data; real implementation pending
- **Ad Injection**: Search results mix real products with ads at intervals (see SearchResults component)
- **Retailer Tiers**: STANDARD vs PREMIUM retailers shown with different prominence (handled in data layer)
- **Cost**: All API endpoints are free tier, no authentication required yet on API routes

## Gotchas

- **pnpm required**: npm/yarn will break workspace references
- **Prisma imports**: Always `import { prisma } from '@zeroedin/db'`, never instantiate Prisma client directly
- **Environment setup**: Both API and web need distinct env files; NEXTAUTH_SECRET required for auth
- **API Base URL**: Defaults to localhost:8000 if `NEXT_PUBLIC_API_URL` not set (check `lib/api.ts`)
- **NextAuth callbacks**: Session and JWT callbacks in route.ts must include user.id injection for TypeScript safety

## File Reference Guide

| File/Dir | Purpose |
|----------|---------|
| `apps/web/app/` | Page routes (App Router) |
| `apps/web/components/` | Reusable React components |
| `apps/web/lib/api.ts` | API client with type defs |
| `apps/api/src/index.ts` | Express app setup + router registration |
| `apps/api/src/routes/` | REST endpoint handlers |
| `packages/db/schema.prisma` | Data model definitions |
| `packages/db/index.ts` | Prisma client export |

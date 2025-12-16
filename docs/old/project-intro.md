# IronScout.ai - AI-Powered Ammunition Search & Price Comparison

IronScout.ai is an AI-native ammunition search platform that goes beyond basic price comparison to provide expert-level guidance through advanced AI analysis. The platform helps shooters find ammunition optimized for their specific use cases (barrel length, suppressor compatibility, defensive vs. training, etc.) while providing the best value.

## 🎯 What Makes IronScout Different

Unlike competitors like AmmoSeek, IronScout provides:

- **AI-Powered Natural Language Search**: "best 9mm for home defense with short barrel"
- **Performance-Aware Recommendations**: Rankings based on bullet type, +P ratings, suppressor compatibility
- **Best Value Scoring**: Composite algorithm beyond simple price comparison
- **Expert-Level Guidance**: AI explanations for ammunition selection
- **Dealer Portal**: Self-service tools for dealers to manage feeds and get market insights

## 🚀 Features

### Consumer Features

**FREE Tier:**
- Natural language search
- Basic AI purpose detection
- Up to 5 price alerts (60-min delay)
- 20 search results per query
- Standard relevance ranking

**PREMIUM Tier ($4.99/mo):**
- Unlimited real-time alerts
- 100 search results per query
- 365-day price history
- Advanced AI features:
  - Purpose-optimized ranking
  - Performance-aware matching
  - Best Value Score
  - AI explanations
  - Premium filters (+P, subsonic, velocity, bullet type)
  - Performance badges ("Low flash", "Short-barrel optimized")

### Dealer Portal Features
- Self-service feed management (CSV, XML, JSON)
- Automatic SKU matching to canonical products
- Market price benchmarking
- Actionable insights (overpriced, underpriced, stock opportunities)
- Attribution tracking

### Admin Features
- Harvester monitoring dashboard
- Embedding coverage stats
- Premium field population tracking
- Manual crawl triggers
- Product report management

## 🏗️ Architecture

### Technology Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn/UI
- **API**: Express.js, TypeScript, Zod validation
- **Database**: PostgreSQL with pgvector extension
- **ORM**: Prisma with vector support
- **Authentication**: NextAuth.js with Google OAuth
- **Payments**: Stripe SDK
- **Queue/Worker**: BullMQ + Redis
- **AI**: OpenAI text-embedding-3-small (1536 dimensions)

### Project Structure

```
IronScout/
├── apps/
│   ├── api/                 # Express.js backend API
│   │   ├── src/
│   │   │   ├── routes/      # API route handlers
│   │   │   ├── services/    # Business logic (AI search, etc.)
│   │   │   ├── config/      # Tier config, etc.
│   │   │   └── index.ts     # Main server file
│   │   └── package.json
│   ├── web/                 # Next.js frontend application
│   │   ├── app/             # Next.js app router pages
│   │   ├── components/      # React components
│   │   ├── lib/             # Utility functions and API clients
│   │   └── package.json
│   ├── admin/               # Admin portal (dealer management)
│   │   ├── app/             # Admin pages
│   │   ├── lib/             # Auth (JWT verify), utilities
│   │   └── package.json
│   ├── dealer/              # Dealer self-service portal
│   │   ├── app/             # Dealer dashboard pages
│   │   ├── lib/             # Auth, utilities
│   │   └── package.json
│   └── harvester/           # BullMQ worker system
│       ├── src/
│       │   ├── scheduler/   # Job scheduling
│       │   ├── fetcher/     # Feed/page fetching
│       │   ├── extractor/   # Content parsing
│       │   ├── normalizer/  # Data standardization
│       │   ├── writer/      # Database upserts
│       │   ├── alerter/     # Notification triggers
│       │   ├── dealer/      # Dealer portal workers
│       │   └── worker.ts    # Main worker entry
│       └── package.json
├── packages/
│   └── db/                  # Shared database schema
│       ├── schema.prisma    # Prisma database schema
│       └── index.ts         # Database client exports
├── docs/                    # Architecture documentation
└── pnpm-workspace.yaml      # pnpm workspace configuration
```

### Service Architecture

```
User → Web App (3000) → API (8000) → PostgreSQL
                                  ↗
                       Redis ← Harvester (10 workers)

Admin → Admin Portal (3002) ───┼─── JWT Cookie Auth ───┘
         (shares auth via cookie domain: .ironscout.ai)

Dealer → Dealer Portal (3003) → API → Redis → Dealer Workers (4)
```

## 🛠️ Local Development Setup

### Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL 14+ with pgvector extension
- Redis 7+

### Installation

1. **Clone and install**
   ```bash
   git clone <repository-url>
   cd IronScout
   pnpm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

3. **Set up the database**
   ```bash
   cd packages/db
   pnpm db:generate
   pnpm db:migrate
   ```

4. **Start all services**
   ```bash
   # Terminal 1: Web + API
   pnpm dev
   
   # Terminal 2: Harvester workers
   cd apps/harvester && pnpm worker
   ```

### Environment Variables

**API `.env`:**
```env
DATABASE_URL="postgresql://..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
FRONTEND_URL="http://localhost:3000"
OPENAI_API_KEY="sk-..."
REDIS_HOST="localhost"
REDIS_PORT=6379
PORT=8000
```

**Web `.env.local`:**
```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

## 🔧 Available Scripts

### Root Level
- `pnpm dev` - Start web + API
- `pnpm build` - Build all apps
- `pnpm lint` - Lint all packages

### Database (`packages/db`)
- `pnpm db:generate` - Generate Prisma client
- `pnpm db:migrate` - Run migrations
- `pnpm db:push` - Push schema changes
- `pnpm db:studio` - Open Prisma Studio
- `pnpm db:seed` - Seed test data

### Harvester (`apps/harvester`)
- `pnpm worker` - Start all workers
- `pnpm dev run` - Trigger immediate crawl
- `pnpm dev schedule` - Set up recurring crawls
- `pnpm dev status` - Show queue status

## 🗄️ Database Schema Highlights

### Core Models
- **User**: Auth, tier (FREE/PREMIUM)
- **Product**: Catalog with Premium AI fields
- **Retailer**: Stores with tier prioritization
- **Price**: Price tracking with shipping
- **Alert**: User price alerts
- **Source/Execution**: Crawl tracking

### Premium AI Fields on Product
```prisma
bulletType         BulletType?      // JHP, FMJ, SP, etc.
pressureRating     PressureRating?  // STANDARD, PLUS_P, NATO
muzzleVelocityFps  Int?             // Subsonic detection
isSubsonic         Boolean?         // Suppressor filtering
shortBarrelOptimized Boolean?       // Compact pistol optimization
suppressorSafe     Boolean?         // Suppressor compatibility
lowFlash           Boolean?         // Low-light optimization
lowRecoil          Boolean?         // Reduced recoil
controlledExpansion Boolean?        // Overpenetration limit
matchGrade         Boolean?         // Competition quality
embedding          vector(1536)     // Semantic search
```

### Dealer Portal Models
- **Dealer**: Registration, auth, verification
- **DealerFeed**: Feed configuration and status
- **DealerSku**: Individual prices from feeds
- **CanonicalSku**: Product matching bridge
- **MarketBenchmark**: Price benchmarks
- **DealerInsight**: Actionable recommendations

## 📊 API Endpoints

### Search API (`/api/search`)
- `POST /semantic` - AI-powered search
- `POST /parse` - Parse intent (debug)
- `GET /suggestions` - Autocomplete
- `POST /nl-to-filters` - NL → filters
- `GET /premium-filters` - Filter definitions

### Admin Endpoints
- `GET /api/search/admin/embedding-stats`
- `GET /api/search/admin/ballistic-stats`
- `POST /api/search/admin/backfill-embeddings`

## 🚀 Deployment

**Render.com Configuration:**
- Web: Next.js static build
- API: Node.js service
- Database: PostgreSQL with pgvector
- Redis: Managed Redis instance

See `render.yaml` for full deployment configuration.

## 📈 Current Status

### ✅ Completed
- Tier system (FREE/PREMIUM)
- AI semantic search with pgvector
- Premium ranking algorithm
- Best Value Score calculation
- Premium filters and badges
- Product reporting system
- Dealer portal workers
- Market benchmarking
- Insight generation

### 🔄 In Progress
- Dealer portal frontend UI
- Price history visualization
- Additional affiliate networks

### 📋 Planned
- Playwright for JS-rendered sites
- ML-based product matching
- Image analysis verification

---

## Deployment URLs

| Service | Production | Render |
|---------|------------|--------|
| Web | ironscout.ai | ironscout-web.onrender.com |
| Admin | admin.ironscout.ai | ironscout-admin.onrender.com |
| Dealer | dealer.ironscout.ai | ironscout-dealer.onrender.com |
| API | api.ironscout.ai | ironscout-api.onrender.com |

---

*Built with ❤️ by the IronScout.ai team*
*Last updated: December 10, 2025*

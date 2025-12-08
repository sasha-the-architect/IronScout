# IronScout.ai — Full Application Specification v6

## Overview
IronScout.ai is an AI-native ammunition search and price comparison platform that discovers, normalizes, and presents product deals across the internet. It differentiates from competitors like AmmoSeek through advanced AI-powered semantic search, performance-aware recommendations, and expert-level guidance for selecting ammunition optimized for specific use cases.

---

## 1. Project Goal
Create a platform that provides genuine expert-level guidance through AI analysis, not just basic price comparison. Premium features focus on deeper AI analysis and performance-aware recommendations rather than artificial limitations on Free tier functionality.

---

## 2. Core Value Proposition

### For Consumers
- **Natural Language Search**: "best 9mm for home defense with short barrel"
- **Performance-Aware Recommendations**: Understand bullet types, +P ratings, suppressor compatibility
- **Best Value Scoring**: Composite algorithm beyond simple price comparison
- **Expert Guidance**: AI explanations for why specific ammunition suits specific uses

### For Dealers
- **Self-Service Portal**: Manage feeds, track performance, get market insights
- **Market Benchmarking**: Know how prices compare to market averages
- **Actionable Insights**: Opportunities for price optimization and stock management

---

## 3. Technology Stack
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn/UI
- **API:** Express.js, TypeScript, Zod validation
- **Database:** PostgreSQL with pgvector extension
- **ORM:** Prisma with vector support
- **Authentication:** NextAuth.js with Google OAuth
- **Payment:** Stripe SDK
- **Queue/Worker:** BullMQ + Redis
- **AI:** OpenAI text-embedding-3-small (1536 dimensions)

---

## 4. Architecture Overview

### Monorepo Structure
```
IronScout/
├── apps/
│   ├── web/           - Next.js frontend
│   ├── api/           - Express.js API
│   └── harvester/     - BullMQ workers
├── packages/
│   └── db/            - Shared Prisma schema
└── docs/              - Architecture documentation
```

### Service Communication
```
User → Web App (3000) → API (8000) → PostgreSQL
                                  ↗
                       Redis ← Harvester Workers

Dealer → Dealer Portal → API → Redis → Dealer Workers
```

---

## 5. Tier System

### FREE Tier ($0)
| Feature | Limit |
|---------|-------|
| Active Alerts | 5 max |
| Alert Delay | 60 minutes |
| Search Results | 20 max |
| Price History | None |
| AI Features | Basic purpose detection only |

### PREMIUM Tier ($4.99/mo or $49.99/yr)
| Feature | Limit |
|---------|-------|
| Active Alerts | Unlimited |
| Alert Delay | Real-time |
| Search Results | 100 max |
| Price History | 365 days |
| AI Features | Full suite |

#### Premium AI Features
- **Advanced Purpose Interpretation**: Deep semantic analysis of intent
- **Purpose-Optimized Ranking**: Results ranked for user's specific use case
- **Performance-Aware Matching**: Bullet type, reliability, barrel optimization
- **AI Explanations**: "These loads are optimized for..."
- **Best Value Score**: Composite value scoring algorithm
- **Reliability Insights**: Brand/product reliability data
- **Premium Filters**: +P, subsonic, velocity, bullet construction
- **Performance Badges**: "Low flash", "Short-barrel optimized"
- **Advanced Sorting**: Best Match, Best Value, Most Reliable

---

## 6. AI Search System

### Intent Parser
Extracts structured intent from natural language queries:

**Basic Intent (FREE + PREMIUM):**
```typescript
{
  calibers: ["9mm"],
  purpose: "defense",
  grainWeights: [124, 147],
  caseMaterials: ["brass"],
  brands: ["federal", "speer"],
  minPrice, maxPrice,
  inStockOnly: true
}
```

**Premium Intent (PREMIUM only):**
```typescript
{
  preferredBulletTypes: ["JHP", "BJHP"],
  suppressorUse: true,
  barrelLength: "short",
  environment: "indoor",
  safetyConstraints: ["low-overpenetration", "low-flash"],
  rankingBoosts: {
    shortBarrelOptimized: 1.5,
    lowFlash: 1.2,
    controlledExpansion: 1.3
  }
}
```

### Premium Ranking Algorithm

**Score Breakdown (0-100 points):**
1. **Base Relevance (0-40)**: Vector similarity + keyword match
2. **Performance Match (0-30)**: Premium field matching to intent
3. **Best Value Score (0-20)**: Price efficiency calculation
4. **Safety Bonus (0-10)**: Safety constraint fulfillment

### Best Value Score Algorithm

**Factors:**
- **Price vs Average**: -50 to +50 (positive = below average)
- **Shipping Value**: 0-20 (free shipping = max)
- **Retailer Trust**: 0-15 (Premium tier = max)
- **Brand Quality**: 0-10 (match-grade = max)
- **Purpose Fit**: 0-15 (exact match = max)

**Grade Scale:**
- A: 85-100
- B: 70-84
- C: 55-69
- D: 40-54
- F: 0-39

---

## 7. Database Schema Highlights

### Product Premium Fields
```sql
-- Bullet construction (critical for purpose matching)
bullet_type VARCHAR           -- JHP, FMJ, SP, BJHP, HST, etc.

-- Pressure rating (safety and +P filtering)
pressure_rating VARCHAR       -- STANDARD, PLUS_P, PLUS_P_PLUS, NATO

-- Velocity data (subsonic detection)
muzzle_velocity_fps INTEGER
is_subsonic BOOLEAN

-- Optimization flags (Premium AI features)
short_barrel_optimized BOOLEAN
suppressor_safe BOOLEAN
low_flash BOOLEAN
low_recoil BOOLEAN
controlled_expansion BOOLEAN
match_grade BOOLEAN

-- Data quality tracking
data_source VARCHAR           -- MANUFACTURER, PARSED, AI_INFERRED
data_confidence DECIMAL(3,2)  -- 0.00-1.00

-- Semantic search
embedding vector(1536)        -- OpenAI text-embedding-3-small
```

### Indexes for Premium Queries
```sql
CREATE INDEX idx_products_caliber ON products(caliber);
CREATE INDEX idx_products_bullet_type ON products(bullet_type);
CREATE INDEX idx_products_pressure_rating ON products(pressure_rating);
CREATE INDEX idx_products_is_subsonic ON products(is_subsonic);
CREATE INDEX idx_products_purpose ON products(purpose);
```

---

## 8. Harvester Workers

### Core Pipeline (6 workers)
1. **Scheduler** → Creates crawl jobs
2. **Fetcher** → Downloads feeds/pages
3. **Extractor** → Parses content
4. **Normalizer** → Standardizes data
5. **Writer** → Database upserts
6. **Alerter** → Notification triggers

### Dealer Portal Pipeline (4 workers)
1. **DealerFeedIngest** → Parse dealer CSV/XML/JSON
2. **DealerSkuMatch** → Match to canonical products
3. **DealerBenchmark** → Calculate market benchmarks
4. **DealerInsight** → Generate actionable insights

### Dealer Insight Types
- **OVERPRICED**: Dealer price above market average
- **UNDERPRICED**: Opportunity for price increase
- **STOCK_OPPORTUNITY**: High demand items dealer is OOS
- **ATTRIBUTE_GAP**: Missing data preventing benchmarks

---

## 9. API Endpoints

### Search API
```
POST /api/search/semantic          - AI-powered search
POST /api/search/parse             - Parse intent (debug)
GET  /api/search/suggestions       - Autocomplete
POST /api/search/nl-to-filters     - NL → filters
GET  /api/search/premium-filters   - Filter definitions
GET  /api/search/admin/embedding-stats
GET  /api/search/admin/ballistic-stats
POST /api/search/admin/backfill-embeddings
```

### Reports API
```
POST /api/reports                  - Create report
GET  /api/reports                  - List reports (admin)
GET  /api/reports/:id              - Get report
PATCH /api/reports/:id             - Update status
GET  /api/reports/stats/summary    - Statistics
```

---

## 10. Dealer Portal Architecture

### Models
- **Dealer**: Auth, verification, status (PENDING/ACTIVE/SUSPENDED)
- **DealerFeed**: Feed config (URL, FTP, upload), status, schedule
- **DealerSku**: Individual prices from feeds
- **CanonicalSku**: Bridge to canonical products
- **MarketBenchmark**: Price/availability by caliber
- **DealerInsight**: Actionable recommendations

### Feed Processing Flow
```
1. Scheduler triggers at feed interval
2. FeedIngest downloads and parses
3. DealerSku records created/updated
4. SkuMatch attempts canonical matching:
   - HIGH: UPC + Brand + Pack match
   - MEDIUM: Attribute match (no UPC)
   - LOW: Partial match (flagged)
5. Benchmark recalculates market averages
6. Insight generates recommendations
```

### Matching Confidence Levels
- **HIGH**: UPC + Brand + Pack size all match
- **MEDIUM**: Caliber + Brand + Attributes match (no UPC)
- **LOW**: Partial match, flagged for manual review
- **NONE**: Cannot match, excluded from benchmarks

---

## 11. Product Roadmap

### Phase 1 — MVP ✅
- Basic search with AI intent parsing
- User alerts with tier-based delays
- Stripe subscription integration
- Admin harvester dashboard

### Phase 2 — Premium AI (Current) ✅
- Premium field schema (bulletType, pressureRating, etc.)
- Performance-aware ranking algorithm
- Best Value Score calculation
- Premium filter support in search
- pgvector semantic search
- Embedding management admin UI

### Phase 3 — Dealer Portal (Current) ✅
- Dealer registration and auth
- Feed configuration and ingestion
- SKU matching to canonical products
- Market benchmarking
- Insight generation

### Phase 4 — Enhancement (Next)
- Playwright for JS-rendered sites
- Price history visualization
- More affiliate networks (CJ, Rakuten)
- ML-based product matching
- Image analysis for verification

---

## 12. Key Decisions & Learnings

### Tier Strategy
Premium features provide genuine value through expert-level guidance and deeper AI analysis, NOT artificial limitations on Free tier. Free users still get useful basic search.

### Implementation Approach
Complex features use phased rollout:
- Phase 1: Schema + config
- Phase 2: Backend services
- Phase 3: Frontend integration

### Performance Optimization
- Hash-based feed caching (70-90% processing saved)
- pgvector HNSW index for fast similarity
- Price cache with 1hr TTL
- Batch embedding generation

### Data Quality
- Confidence scores track data reliability
- Data source enum tracks provenance
- Reports system for user feedback
- Admin tools for monitoring coverage

---

## 13. Acceptance Criteria

### AI Search
- ✅ Natural language queries parsed correctly
- ✅ Tier-appropriate results and features
- ✅ Premium ranking with performance matching
- ✅ Best Value scores calculated
- ✅ Performance badges displayed

### Dealer Portal
- ✅ Feed ingestion working (CSV, XML, JSON)
- ✅ SKU matching with confidence levels
- ✅ Market benchmarks calculated
- ✅ Insights generated automatically

### Admin Tools
- ✅ Embedding stats visible
- ✅ Ballistic field coverage tracked
- ✅ Backfill process manageable
- ✅ Debug endpoints available

---

*Last updated: December 7, 2025*

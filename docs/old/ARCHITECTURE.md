# IronScout.ai Scalable Ingestion Pipeline Architecture

## High-Level Flow

```
[Affiliate Feeds] ─┐
                   ├─> [Parser Layer] -> [Normalizer] -> [DB]
[Scrapers] ────────┘

[Dealer Feeds] ─> [Feed Ingest] -> [SKU Match] -> [Benchmark] -> [Insight]

[Admin Portal] ─> [JWT Cookie Auth] -> [Admin API] -> [DB]
     └── Shares auth with main Web App via cookie domain .ironscout.ai
```

## Implementation Status

### ✅ Completed Components

#### 1. Database Schema (`packages/db/schema.prisma`)

**Core Models:**
- **Product**: UPC (unique), caliber, grain_weight, case_material, purpose, round_count, metadata
- **Retailer**: name, website (unique), tier, network affiliation
- **Price**: product_id, retailer_id, price, in_stock, url, shipping costs
- **Source**: Affiliate network configuration, feed hash for change detection
- **Execution/ExecutionLog**: Full crawl tracking and debugging
- **ProductReport**: User-submitted product data issues

**Premium AI Fields (Phase 2):**
- `bulletType` - JHP, FMJ, SP, etc. (BulletType enum)
- `pressureRating` - STANDARD, PLUS_P, PLUS_P_PLUS, NATO
- `muzzleVelocityFps` - Velocity data for subsonic detection
- `isSubsonic` - For suppressor use filtering
- `shortBarrelOptimized` - Compact pistol optimization
- `suppressorSafe` - Suppressor compatibility
- `lowFlash` - Reduced muzzle flash
- `lowRecoil` - Reduced felt recoil
- `controlledExpansion` - Overpenetration limit design
- `matchGrade` - Competition quality indicator
- `dataSource` - How data was populated
- `dataConfidence` - Data quality score

**Dealer Portal Models:**
- **Dealer**: Registration, authentication, verification
- **DealerFeed**: Feed configuration, status, last run metadata
- **DealerSku**: Individual SKU prices from dealer feeds
- **CanonicalSku**: Product matching bridge table
- **MarketBenchmark**: Price/availability benchmarks per caliber
- **DealerInsight**: Actionable insights for dealers
- **PixelEvent/ClickEvent**: Attribution tracking
- **DealerNotificationPref**: Notification settings
- **AdminAuditLog**: Admin action tracking

#### 2. Tier System (`apps/api/src/config/tiers.ts`)

**FREE Tier:**
- 5 active alerts max
- 60-minute alert delay
- 20 search results max
- Basic AI purpose detection
- Standard relevance ranking

**PREMIUM Tier ($4.99/mo or $49.99/yr):**
- Unlimited alerts
- Real-time notifications
- 100 search results max
- 365-day price history
- Advanced AI features:
  - Purpose-optimized ranking
  - Performance-aware matching
  - AI explanations
  - Best Value scoring
  - Reliability insights
  - Premium filters (+P, subsonic, velocity)
  - Performance badges
  - Advanced sorting (Best Value, Most Reliable)

#### 3. AI Search System (`apps/api/src/services/ai-search/`)

**Files:**
- `embedding-service.ts` - OpenAI text-embedding-3-small integration
- `intent-parser.ts` - Natural language query parsing
- `search-service.ts` - Semantic search with pgvector
- `premium-ranking.ts` - Performance-aware ranking for Premium users
- `best-value-score.ts` - Composite value scoring algorithm
- `ammo-knowledge.ts` - Domain knowledge for ammo queries

**Features:**
- Natural language search ("cheap 9mm bulk ammo in stock")
- Semantic similarity via pgvector
- Explicit filter overrides
- Tier-aware result limits
- Premium ranking with:
  - Base relevance (0-40 pts)
  - Performance match (0-30 pts)
  - Best Value score (0-20 pts)
  - Safety bonus (0-10 pts)

#### 4. Best Value Score Algorithm

Calculates composite 0-100 score considering:
- Price vs caliber average (-50 to +50 pts)
- Shipping value (0-20 pts)
- Retailer trust/tier (0-15 pts)
- Brand quality tier (0-10 pts)
- Purpose fit (0-15 pts)

Brand tiers: budget, mid-tier, premium, match-grade

#### 5. Normalization Layer (`apps/harvester/src/normalizer/`)
- ✅ `ammo-utils.ts` - Comprehensive ammo normalization
  - `extractCaliber()` - 40+ caliber patterns
  - `extractGrainWeight()` - Grain extraction with validation
  - `extractCaseMaterial()` - Brass, Steel, Aluminum, Nickel, Polymer
  - `classifyPurpose()` - FMJ=Target, JHP=Defense, SP=Hunting, OTM=Precision
  - `extractRoundCount()` - Rounds per box
  - `generateProductId()` - UPC-first, hash fallback
  - `normalizeAmmoProduct()` - Orchestrates all normalization

#### 6. Parser Layer (`apps/harvester/src/parsers/`)
- ✅ **Base Interface** - `FeedParser` with unified `ParsedProduct` output
- ✅ **ImpactParser** - Auto-detects CSV/XML/JSON
- ✅ **AvantLinkParser** - Supports CSV/XML/JSON with AvantLink field mappings
- ✅ **ShareASaleParser** - Supports pipe-delimited CSV, XML, JSON

#### 7. Writer Layer (`apps/harvester/src/writer/`)
- ✅ UPC-based product consolidation
- ✅ Upserts Product with all ammo fields
- ✅ Upserts Retailer with unique website constraint
- ✅ Creates Price records with shipping cost fields

#### 8. Fetcher Layer (`apps/harvester/src/fetcher/`)
- ✅ Pagination support (query params, path-based)
- ✅ Auto-detection of empty results
- ✅ **Feed hash caching** - SHA-256 hash comparison for change detection
- ✅ **Route to parser vs scraper** - Automatic routing based on affiliateNetwork

#### 9. Dealer Portal Workers (`apps/harvester/src/dealer/`)

**Workers:**
- `feed-ingest.ts` - Download and parse dealer feeds (CSV, XML, JSON)
- `sku-match.ts` - Match dealer SKUs to canonical products (UPC/attribute matching)
- `benchmark.ts` - Calculate market price benchmarks per caliber
- `insight.ts` - Generate actionable insights (overpriced, underpriced, stock opportunities)

**Queue Pipeline:**
```
DealerFeed → FeedIngest → SkuMatch → Benchmark → Insight
```

**Scheduler:** Auto-schedules based on dealer feed intervals (configurable)

### ⚠️ Pending Components

#### 10. Scraper Layer (Playwright)
**Purpose**: Handle JavaScript-rendered pages

**When to use**:
- Source type = `JS_RENDERED`
- Site requires JavaScript to load products
- Anti-bot protection

**Implementation**:
```typescript
// apps/harvester/src/fetcher/playwright-fetcher.ts
import playwright from 'playwright'

export async function fetchWithPlaywright(url: string) {
  const browser = await playwright.chromium.launch()
  const page = await browser.newPage()
  await page.goto(url)
  const content = await page.content()
  await browser.close()
  return content
}
```

## Data Flow Examples

### Affiliate Feed Flow

```
1. Scheduler triggers feed refresh (12h interval)
2. Fetcher downloads feed → checks hash
   - If unchanged: Skip
   - If changed: Continue
3. Parser (ImpactParser) parses CSV/XML/JSON
   Output: { retailer, name, price, upc, ... }
4. Normalizer extracts ammo metadata
   Output: { productId, caliber, grain, case, purpose, bulletType, ... }
5. Writer upserts to DB
   - Product (by productId/UPC)
   - Retailer (by website)
   - Price (new record with shipping)
```

### Dealer Portal Flow

```
1. Dealer scheduler triggers feed refresh (based on interval)
2. FeedIngest worker downloads dealer CSV/XML
3. Parse rows into DealerSku records
4. SkuMatch worker matches to canonical products:
   - HIGH: UPC + Brand + Pack match
   - MEDIUM: Attribute match without UPC
   - LOW: Partial match (flagged for review)
5. Benchmark worker calculates market prices by caliber
6. Insight worker generates actionable insights:
   - OVERPRICED: Dealer price above market
   - UNDERPRICED: Opportunity for promotion
   - STOCK_OPPORTUNITY: High demand, dealer OOS
```

### AI Search Flow

```
1. User submits query: "best 9mm for home defense with short barrel"
2. Intent parser extracts:
   - caliber: "9mm"
   - purpose: "defense"
   - premiumIntent.barrelLength: "short"
   - premiumIntent.safetyConstraints: ["low-overpenetration"]
3. Vector search finds semantically similar products
4. For Premium users:
   - Apply performance-aware ranking boosts
   - Calculate Best Value scores
   - Generate AI explanations
   - Extract performance badges
5. Return ranked results with Premium metadata
```

## Database Schema

### Products (Canonical)
```sql
CREATE TABLE products (
  id VARCHAR PRIMARY KEY,
  upc VARCHAR UNIQUE,
  name VARCHAR NOT NULL,
  caliber VARCHAR,
  grain_weight INTEGER,
  case_material VARCHAR,
  purpose VARCHAR,
  round_count INTEGER,
  
  -- Premium AI Fields
  bullet_type VARCHAR,          -- BulletType enum
  pressure_rating VARCHAR,      -- PressureRating enum
  muzzle_velocity_fps INTEGER,
  is_subsonic BOOLEAN,
  short_barrel_optimized BOOLEAN,
  suppressor_safe BOOLEAN,
  low_flash BOOLEAN,
  low_recoil BOOLEAN,
  controlled_expansion BOOLEAN,
  match_grade BOOLEAN,
  data_source VARCHAR,
  data_confidence DECIMAL(3,2),
  
  -- Vector embedding for semantic search
  embedding vector(1536),
  
  metadata_json JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_products_caliber ON products(caliber);
CREATE INDEX idx_products_bullet_type ON products(bullet_type);
CREATE INDEX idx_products_pressure_rating ON products(pressure_rating);
CREATE INDEX idx_products_is_subsonic ON products(is_subsonic);
CREATE INDEX idx_products_purpose ON products(purpose);
```

### Prices
```sql
CREATE TABLE prices (
  id VARCHAR PRIMARY KEY,
  product_id VARCHAR REFERENCES products(id),
  retailer_id VARCHAR REFERENCES retailers(id),
  price DECIMAL NOT NULL,
  in_stock BOOLEAN,
  url VARCHAR,
  
  -- Shipping fields
  shipping_cost DECIMAL(10,2),
  free_shipping_minimum DECIMAL(10,2),
  shipping_notes VARCHAR,
  
  created_at TIMESTAMP
);

CREATE INDEX idx_prices_product ON prices(product_id, created_at DESC);
CREATE INDEX idx_prices_in_stock ON prices(in_stock);
```

## API Endpoints

### Search API (`/api/search`)
- `POST /semantic` - AI-powered semantic search with tier filtering
- `POST /parse` - Parse query without searching (debugging)
- `GET /suggestions` - Autocomplete suggestions
- `POST /nl-to-filters` - Convert natural language to filter object
- `GET /premium-filters` - Get available Premium filter definitions
- `GET /admin/embedding-stats` - Embedding coverage stats
- `GET /admin/ballistic-stats` - Premium field coverage stats
- `POST /admin/backfill-embeddings` - Trigger embedding backfill
- `GET /admin/backfill-progress` - Get backfill progress
- `GET /debug/calibers` - List unique caliber values
- `GET /debug/purposes` - List unique purpose values
- `GET /debug/bullet-types` - List unique bullet types

### Reports API (`/api/reports`)
- `POST /` - Create product report
- `GET /` - List reports (admin)
- `GET /:id` - Get single report
- `GET /product/:productId` - Get reports for product
- `PATCH /:id` - Update report status (admin)
- `DELETE /:id` - Delete report (admin)
- `GET /stats/summary` - Report statistics

## Performance Optimizations

### Feed Processing
- **Hash-based caching**: Skip unchanged feeds (saves 70-90% processing)
- **Batch upserts**: Insert 1000s of products in single transaction
- **Parallel parsing**: Process multiple feeds concurrently

### AI Search
- **pgvector indexing**: HNSW index for fast similarity search
- **Embedding caching**: Store embeddings on product records
- **Batch embedding**: Process 50 products at a time for backfill
- **Price cache**: Cache caliber price averages (1hr TTL)

### Database
- **Indexes**: On caliber, bulletType, pressureRating, isSubsonic, purpose
- **Partitioning**: Partition prices by date for historical queries
- **JSONB**: Flexible metadata without schema changes

## Monitoring & Alerts

### Execution Monitoring
- Track success/failure rates per source
- Alert on consecutive failures
- Dashboard showing items harvested per day

### AI Search Health
- Embedding coverage percentage
- Premium field population rates
- Search latency metrics

### Dealer Portal
- Feed health status (HEALTHY/WARNING/FAILED)
- SKU match rates by confidence level
- Benchmark freshness

## Next Steps

### Immediate
1. Implement Playwright support for JS-rendered pages
2. Build dealer portal frontend UI
3. Add backfill job for Premium AI fields

### Short-term
1. Add more affiliate networks (CJ, Rakuten)
2. Implement price history API with tier access
3. Build admin UI for managing sources
4. Add execution monitoring dashboard

### Medium-term
1. ML-based product matching (for products without UPC)
2. Automatic brand/caliber correction
3. Image analysis for verification
4. Predictive pricing models

---
## Admin Portal Architecture

The admin portal (`apps/admin/`) is a separate Next.js application for dealer management.

### Authentication Flow

```
┌──────────────────┐     ┌──────────────────┐
│  ironscout.ai    │     │ admin.ironscout.ai│
│   (Web App)      │     │  (Admin Portal)  │
├──────────────────┤     ├──────────────────┤
│                  │     │                  │
│  NextAuth Login  │     │  Read JWT Cookie │
│        │        │     │        │        │
│        ▼        │     │        ▼        │
│  Set Cookie      │─────▶  Verify JWT     │
│  domain:         │     │        │        │
│  .ironscout.ai   │     │        ▼        │
│                  │     │  Check email in  │
│                  │     │  ADMIN_EMAILS    │
└──────────────────┘     └──────────────────┘
```

### Key Points

1. **No separate login** - Admin uses main site's NextAuth
2. **Cookie sharing** - JWT cookie set with `domain: .ironscout.ai`
3. **Auto-redirect** - Unauthenticated users redirected to main login
4. **Email whitelist** - Only `ADMIN_EMAILS` can access
5. **OAuth required** - Admins must use Google OAuth (verified email)

### Environment Variables

**Web App** (sets cookie):
```env
COOKIE_DOMAIN=.ironscout.ai
ADMIN_URL=https://admin.ironscout.ai  # Allow redirect after login
```

**Admin App** (reads cookie):
```env
NEXTAUTH_SECRET=same-as-web-app  # Must match!
ADMIN_EMAILS=admin@example.com,another@admin.com
```

### Deployment

| Service | URL | Render Service |
|---------|-----|----------------|
| Web | ironscout.ai | ironscout-web |
| Admin | admin.ironscout.ai | ironscout-admin |

Cloudflare DNS:
```
CNAME admin -> ironscout-admin.onrender.com (proxy: OFF)
```

See `docs/ADMIN_PORTAL.md` for complete documentation.

---
*Last updated: December 10, 2025*

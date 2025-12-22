# AI Search System

IronScout's AI search system provides semantic search, intent parsing, and performance-aware ranking for ammunition products.

## Overview

The AI search system enables natural language queries like:
- "best 9mm for home defense with short barrel"
- "cheap brass case .223 for range practice"
- "subsonic .300 blackout for suppressor"

## Architecture

```
User Query
    │
    ▼
┌─────────────────┐
│  Intent Parser  │ ── Extracts structured intent from natural language
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Embedding Search│ ── pgvector similarity search
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Premium Ranking │ ── Performance-aware reranking (PREMIUM only)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│Best Value Score │ ── Composite value calculation (PREMIUM only)
└─────────────────┘
    │
    ▼
Search Results
```

---

## Components

### 1. Embedding Service

**File**: `apps/api/src/services/ai-search/embedding-service.ts`

Generates vector embeddings using OpenAI's text-embedding-3-small model (1536 dimensions).

```typescript
// Generate embedding for a query
const embedding = await generateEmbedding("9mm hollow point for defense");

// Batch generate for products
await backfillProductEmbeddings({ batchSize: 100 });
```

**Key Functions**:
- `generateEmbedding(text)` - Single text to vector
- `generateEmbeddings(texts)` - Batch generation
- `backfillProductEmbeddings()` - Populate missing embeddings

**Configuration**:
- Model: `text-embedding-3-small`
- Dimensions: 1536
- Stored in: `Product.embedding` (pgvector column)

---

### 2. Intent Parser

**File**: `apps/api/src/services/ai-search/intent-parser.ts`

Extracts structured intent from natural language queries.

#### Basic Intent (FREE + PREMIUM)

```typescript
interface BasicIntent {
  calibers: string[];           // ["9mm", ".45 ACP"]
  purpose: string;              // "defense", "range", "hunting"
  grainWeights: number[];       // [124, 147]
  caseMaterials: string[];      // ["brass", "steel"]
  brands: string[];             // ["federal", "speer"]
  minPrice?: number;
  maxPrice?: number;
  inStockOnly: boolean;
}
```

#### Premium Intent (PREMIUM only)

```typescript
interface PremiumIntent {
  preferredBulletTypes: BulletType[];  // ["JHP", "BJHP"]
  suppressorUse: boolean;
  barrelLength: "short" | "standard" | "long";
  environment: "indoor" | "outdoor";
  safetyConstraints: string[];         // ["low-overpenetration", "low-flash"]
  rankingBoosts: {
    shortBarrelOptimized?: number;     // 1.5x boost
    lowFlash?: number;                 // 1.2x boost
    controlledExpansion?: number;      // 1.3x boost
  };
}
```

**Key Functions**:
- `parseSearchIntent(query, { userTier })` - Main parsing function
- Returns tier-appropriate intent structure

---

### 3. Search Service

**File**: `apps/api/src/services/ai-search/search-service.ts`

Main search orchestration combining vector similarity with filters.

```typescript
const results = await aiSearch(query, {
  page: 1,
  limit: 20,
  sortBy: "relevance",
  explicitFilters: { caliber: "9mm" },
  userTier: "PREMIUM"
});
```

**Search Flow**:

1. Parse intent from query
2. Generate query embedding
3. Vector similarity search with pgvector
4. Apply explicit filters (caliber, brand, price range)
5. Apply Premium ranking (if PREMIUM tier)
6. Calculate Best Value scores (if PREMIUM tier)
7. Return paginated results

**Vector Search Query**:

```sql
SELECT *, embedding <=> $1 AS distance
FROM products
WHERE embedding IS NOT NULL
  AND caliber = $2
ORDER BY distance
LIMIT 100;
```

---

### 4. Premium Ranking

**File**: `apps/api/src/services/ai-search/premium-ranking.ts`

Performance-aware reranking for PREMIUM users based on their specific use case.

#### Score Breakdown (0-100 points)

| Component | Points | Description |
|-----------|--------|-------------|
| Base Relevance | 0-40 | Vector similarity + keyword match |
| Performance Match | 0-30 | Premium field matching to intent |
| Best Value Score | 0-20 | Price efficiency calculation |
| Safety Bonus | 0-10 | Safety constraint fulfillment |

#### Ranking Boosts

```typescript
const boosts = {
  // For "short barrel" intent
  shortBarrelOptimized: 1.5,  // 50% boost if product is optimized

  // For "low light / indoor" intent
  lowFlash: 1.2,              // 20% boost for low-flash ammo

  // For "defense" purpose
  controlledExpansion: 1.3,   // 30% boost for controlled expansion

  // For "suppressor" intent
  suppressorSafe: 1.4,        // 40% boost for suppressor-safe
  isSubsonic: 1.3,            // 30% boost for subsonic
};
```

**Key Functions**:
- `applyPremiumRanking(products, { premiumIntent, userPurpose, includeBestValue })`
- Returns reranked products with scores and explanations

---

### 5. Best Value Score

**File**: `apps/api/src/services/ai-search/best-value-score.ts`

Composite algorithm for determining overall value beyond simple price comparison.

#### Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Price vs Average | -50 to +50 | Positive = below market average |
| Shipping Value | 0-20 | Free shipping = max points |
| Retailer Trust | 0-15 | Premium tier retailers = max |
| Brand Quality | 0-10 | Match-grade = max |
| Purpose Fit | 0-15 | Exact match for user's purpose |

#### Grade Scale

| Grade | Score Range |
|-------|-------------|
| A | 85-100 |
| B | 70-84 |
| C | 55-69 |
| D | 40-54 |
| F | 0-39 |

**Key Functions**:
- `calculateBestValueScore(product, userPurpose)`
- Returns score (0-100) and grade (A-F)

---

### 6. Ammo Knowledge Base

**File**: `apps/api/src/services/ai-search/ammo-knowledge.ts`

Domain-specific knowledge for ammunition characteristics.

**Includes**:
- Caliber aliases ("9mm" = "9x19", "9mm Luger", "9mm Parabellum")
- Purpose mappings (defense → JHP, range → FMJ)
- Bullet type characteristics
- Brand quality ratings
- Subsonic velocity thresholds per caliber

---

## API Endpoints

### Search Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search/semantic` | POST | Main AI-powered search |
| `/api/search/parse` | POST | Parse intent (debugging) |
| `/api/search/suggestions` | GET | Autocomplete suggestions |
| `/api/search/nl-to-filters` | POST | Convert NL to filter object |
| `/api/search/premium-filters` | GET | Get available premium filters |

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search/admin/embedding-stats` | GET | Embedding coverage stats |
| `/api/search/admin/ballistic-stats` | GET | Premium field coverage |
| `/api/search/admin/backfill-embeddings` | POST | Trigger embedding backfill |

### Debug Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search/debug/calibers` | GET | List caliber values |
| `/api/search/debug/purposes` | GET | List purpose values |
| `/api/search/debug/bullet-types` | GET | List bullet types |

---

## Premium Fields on Product

```prisma
model Product {
  // Bullet construction
  bulletType         BulletType?      // JHP, FMJ, SP, BJHP, HST, etc.

  // Pressure rating
  pressureRating     PressureRating?  // STANDARD, PLUS_P, PLUS_P_PLUS, NATO

  // Velocity data
  muzzleVelocityFps  Int?
  isSubsonic         Boolean?

  // Optimization flags
  shortBarrelOptimized Boolean?
  suppressorSafe       Boolean?
  lowFlash             Boolean?
  lowRecoil            Boolean?
  controlledExpansion  Boolean?
  matchGrade           Boolean?

  // Data quality
  dataSource         DataSource?      // MANUFACTURER, PARSED, AI_INFERRED
  dataConfidence     Decimal?         // 0.00-1.00

  // Vector embedding
  embedding          Unsupported("vector(1536)")?
}
```

---

## Tier Differences

| Feature | FREE | PREMIUM |
|---------|------|---------|
| Basic intent parsing | Yes | Yes |
| Vector similarity search | Yes | Yes |
| Search results limit | 20 | 100 |
| Premium intent parsing | No | Yes |
| Performance-aware ranking | No | Yes |
| Best Value scores | No | Yes |
| Premium filters (+P, subsonic) | No | Yes |
| AI explanations | No | Yes |
| Performance badges | No | Yes |

---

## Database Indexes

```sql
-- Vector similarity index (HNSW for fast approximate search)
CREATE INDEX idx_products_embedding ON products
USING hnsw (embedding vector_cosine_ops);

-- Filter indexes
CREATE INDEX idx_products_caliber ON products(caliber);
CREATE INDEX idx_products_bullet_type ON products(bullet_type);
CREATE INDEX idx_products_pressure_rating ON products(pressure_rating);
CREATE INDEX idx_products_is_subsonic ON products(is_subsonic);
CREATE INDEX idx_products_purpose ON products(purpose);
```

---

## Adding New AI Features

### New Filter Field

1. Add field to `Product` model in `schema.prisma`
2. Add to relevant enum if needed (BulletType, PressureRating, etc.)
3. Update `intent-parser.ts` to extract from queries
4. Update `premium-ranking.ts` boost logic
5. Add to `search.ts` filter validation schema
6. Update premium filters endpoint
7. Run `pnpm db:generate && pnpm db:migrate`

### New Ranking Factor

1. Add boost configuration to `premium-ranking.ts`
2. Update score calculation logic
3. Add explanation text for UI
4. Update tests

---

## Monitoring

### Embedding Coverage

Monitor via Admin UI or API:
- Total products
- Products with embeddings
- Coverage percentage
- Recent backfill progress

### Search Quality

Track:
- Average result count per query
- Click-through rates
- Time to first click
- Premium conversion from search

---

*Last updated: December 14, 2024*

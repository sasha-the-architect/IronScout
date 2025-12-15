# Dealer Portal - Architecture Consolidation

## Executive Summary

The Dealer Portal will be a **separate Next.js app** (`apps/dealer`) with its own auth, UI, and API routes. It will share the database and some utilities with the existing monorepo but has distinct data models and workflows.

---

## 1. Existing vs New Components

### ✅ REUSE (Already Exists)

| Component | Location | Dealer Portal Usage |
|-----------|----------|---------------------|
| **Database (Prisma)** | `packages/db` | Extend schema with dealer tables |
| **Redis/BullMQ** | `apps/harvester/src/config` | Reuse for dealer feed jobs |
| **Ammo normalization** | `apps/harvester/src/normalizer/ammo-utils.ts` | Reuse for SKU attribute extraction |
| **Feed parsers** | `apps/harvester/src/parsers` | Reference patterns for dealer feeds |
| **Product/Price/Retailer models** | `packages/db/schema.prisma` | Link dealer data to existing products |

### 🔄 EXTEND (Modify Existing)

| Component | Current State | Required Changes |
|-----------|---------------|------------------|
| **Retailer model** | Basic: name, website, tier | Add: `dealerId` FK, additional metadata |
| **Source model** | IronScout-managed feeds | Keep separate - dealers use `DealerFeed` |
| **Product model** | Canonical products | Add: `CanonicalSku` linking for benchmarks |

### 🆕 NEW (Build Fresh)

| Component | Purpose |
|-----------|---------|
| **Dealer app** | `apps/dealer` - Next.js app with dealer UI |
| **Dealer auth** | Email/password, separate from consumer NextAuth |
| **Dealer data models** | dealers, dealer_feeds, dealer_skus, etc. |
| **Dealer worker** | Feed ingestion, matching, benchmarks, insights |
| **Benchmarking engine** | Price aggregation with confidence scoring |
| **Insights engine** | Overpriced/underpriced/stock opportunity detection |
| **Pixel tracking** | JS snippet + server endpoint for revenue attribution |
| **Admin proxy** | Impersonation with audit logging |

---

## 2. Data Model Consolidation

### 2.1 Schema Comparison

| ENG-SPEC Table | Existing Equivalent | Decision |
|----------------|---------------------|----------|
| `dealers` | None (User is consumer) | **NEW** - Separate dealer accounts |
| `feeds` | `Source` | **NEW as `DealerFeed`** - Dealers manage their own feeds |
| `feed_runs` | `Execution` / `ExecutionLog` | **REUSE pattern** - Create `DealerFeedRun` |
| `dealer_skus` | None | **NEW** - Raw SKUs before mapping |
| `canonical_skus` | `Product` (partial) | **NEW** - Dedicated master catalog |
| `pricing_snapshots` | `Price` | **EXTEND** - Add dealer context for benchmarks |
| `benchmarks` | None | **NEW** |
| `insights` | None | **NEW** |
| `pixel_events` | None | **NEW** |
| `admin_audit_log` | None | **NEW** |

### 2.2 Proposed Schema Additions

```prisma
// =============================================
// DEALER PORTAL MODELS
// =============================================

model Dealer {
  id              String        @id @default(cuid())
  email           String        @unique
  passwordHash    String
  emailVerified   Boolean       @default(false)
  businessName    String
  websiteUrl      String
  phone           String?
  status          DealerStatus  @default(PENDING)
  tier            DealerTier    @default(FOUNDING)
  pixelApiKey     String?       @unique
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  feeds           DealerFeed[]
  skus            DealerSku[]
  insights        DealerInsight[]
  pixelEvents     PixelEvent[]
  retailer        Retailer?     @relation(fields: [retailerId], references: [id])
  retailerId      String?       @unique

  @@map("dealers")
}

model DealerFeed {
  id              String        @id @default(cuid())
  dealerId        String
  feedType        FeedType
  url             String?
  username        String?       // Encrypted
  password        String?       // Encrypted
  scheduleMinutes Int           @default(60)
  status          FeedStatus    @default(PENDING)
  lastSuccessAt   DateTime?
  lastFailureAt   DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  dealer          Dealer        @relation(fields: [dealerId], references: [id], onDelete: Cascade)
  runs            DealerFeedRun[]

  @@map("dealer_feeds")
}

model DealerFeedRun {
  id              String        @id @default(cuid())
  dealerId        String
  feedId          String
  status          FeedRunStatus
  errors          Json?         // Array of error objects
  rowCount        Int           @default(0)
  processedCount  Int           @default(0)
  failedCount     Int           @default(0)
  startedAt       DateTime      @default(now())
  completedAt     DateTime?

  feed            DealerFeed    @relation(fields: [feedId], references: [id], onDelete: Cascade)

  @@index([dealerId])
  @@index([feedId])
  @@map("dealer_feed_runs")
}

model DealerSku {
  id                String        @id @default(cuid())
  dealerId          String
  feedRunId         String?
  
  // Raw data from feed
  rawTitle          String
  rawDescription    String?
  rawPrice          Decimal       @db.Decimal(10, 2)
  rawUpc            String?
  rawCaliber        String?
  rawGrain          String?
  rawCase           String?
  rawBulletType     String?
  rawPackSize       Int?
  rawInStock        Boolean       @default(true)
  rawUrl            String?
  
  // Mapping status
  canonicalSkuId    String?
  mappingConfidence MappingConfidence @default(NONE)
  needsReview       Boolean       @default(false)
  
  // Parsed hints (from AI/regex)
  parsedCaliber     String?
  parsedGrain       Int?
  parsedPackSize    Int?
  parsedBulletType  String?
  
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  dealer            Dealer        @relation(fields: [dealerId], references: [id], onDelete: Cascade)
  canonicalSku      CanonicalSku? @relation(fields: [canonicalSkuId], references: [id])

  @@index([dealerId])
  @@index([canonicalSkuId])
  @@index([needsReview])
  @@map("dealer_skus")
}

model CanonicalSku {
  id              String        @id @default(cuid())
  upc             String?       @unique
  caliber         String
  grain           Int
  caseType        String?
  bulletType      String?
  brand           String
  packSize        Int
  name            String        // Canonical display name
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  dealerSkus      DealerSku[]
  pricingSnapshots PricingSnapshot[]
  benchmarks      Benchmark[]

  // Link to existing Product for buyer-facing search
  productId       String?
  product         Product?      @relation(fields: [productId], references: [id])

  @@index([caliber, grain, brand, packSize])
  @@map("canonical_skus")
}

model PricingSnapshot {
  id              String        @id @default(cuid())
  canonicalSkuId  String
  dealerId        String
  price           Decimal       @db.Decimal(10, 2)
  packSize        Int
  inStock         Boolean       @default(true)
  createdAt       DateTime      @default(now())

  canonicalSku    CanonicalSku  @relation(fields: [canonicalSkuId], references: [id])

  @@index([canonicalSkuId])
  @@index([dealerId])
  @@index([createdAt])
  @@map("pricing_snapshots")
}

model Benchmark {
  id              String        @id @default(cuid())
  canonicalSkuId  String        @unique
  medianPrice     Decimal       @db.Decimal(10, 2)
  minPrice        Decimal       @db.Decimal(10, 2)
  maxPrice        Decimal       @db.Decimal(10, 2)
  sellerCount     Int
  source          BenchmarkSource
  confidence      BenchmarkConfidence
  updatedAt       DateTime      @updatedAt

  canonicalSku    CanonicalSku  @relation(fields: [canonicalSkuId], references: [id])

  @@map("benchmarks")
}

model DealerInsight {
  id              String        @id @default(cuid())
  dealerId        String
  dealerSkuId     String?
  type            InsightType
  confidence      InsightConfidence
  message         String
  metadata        Json?         // { dealerPrice, marketMedian, marketRange, sellerCount, source }
  dismissedUntil  DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  dealer          Dealer        @relation(fields: [dealerId], references: [id], onDelete: Cascade)

  @@index([dealerId])
  @@index([type])
  @@map("dealer_insights")
}

model PixelEvent {
  id              String        @id @default(cuid())
  dealerId        String
  orderId         String
  orderValue      Decimal       @db.Decimal(10, 2)
  skuList         Json?         // Array of SKU identifiers
  userAgent       String?
  ipHash          String?
  createdAt       DateTime      @default(now())

  dealer          Dealer        @relation(fields: [dealerId], references: [id], onDelete: Cascade)

  @@index([dealerId])
  @@index([createdAt])
  @@map("pixel_events")
}

model ClickEvent {
  id              String        @id @default(cuid())
  dealerId        String
  productId       String?
  dealerSkuId     String?
  sessionId       String?
  userAgent       String?
  ipHash          String?
  createdAt       DateTime      @default(now())

  @@index([dealerId])
  @@index([createdAt])
  @@map("click_events")
}

model AdminAuditLog {
  id              String        @id @default(cuid())
  adminId         String
  dealerId        String?
  impersonation   Boolean       @default(false)
  action          String
  metadata        Json?
  createdAt       DateTime      @default(now())

  @@index([adminId])
  @@index([dealerId])
  @@map("admin_audit_logs")
}

// =============================================
// DEALER PORTAL ENUMS
// =============================================

enum DealerStatus {
  PENDING           // Awaiting email verification
  ACTIVE            // Verified and operational
  SUSPENDED         // Admin suspended
}

enum DealerTier {
  FOUNDING          // Free 12-month program
  BASIC             // Free limited features
  PRO               // Paid full features
  ENTERPRISE        // Custom
}

enum FeedType {
  URL               // Public HTTP/HTTPS
  AUTH_URL          // Basic Auth URL
  FTP               // FTP
  SFTP              // SFTP
  UPLOAD            // Manual CSV upload
}

enum FeedStatus {
  PENDING           // Not yet run
  HEALTHY           // Last run successful
  WARNING           // Last run had non-fatal issues
  FAILED            // Last run failed
}

enum FeedRunStatus {
  RUNNING
  SUCCESS
  WARNING
  FAILURE
}

enum MappingConfidence {
  HIGH              // UPC + Brand + Pack match
  MEDIUM            // Attribute match without UPC
  LOW               // Partial match, needs review
  NONE              // Cannot map
}

enum BenchmarkSource {
  INTERNAL          // IronScout dealer data
  EXTERNAL          // Public market data
}

enum BenchmarkConfidence {
  HIGH              // ≥3 internal dealers, fresh data
  MEDIUM            // External data or limited internal
  NONE              // Insufficient data
}

enum InsightType {
  OVERPRICED
  UNDERPRICED
  STOCK_OPPORTUNITY
  ATTRIBUTE_GAP
}

enum InsightConfidence {
  HIGH
  MEDIUM
}
```

---

## 3. App Structure

### 3.1 New App: `apps/dealer`

```
apps/dealer/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── verify/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Authenticated layout
│   │   ├── page.tsx                # Dashboard home
│   │   ├── feed/
│   │   │   ├── page.tsx            # Feed configuration
│   │   │   └── runs/page.tsx       # Feed run history
│   │   ├── skus/
│   │   │   ├── page.tsx            # SKU list with filters
│   │   │   └── [id]/page.tsx       # SKU detail + mapping
│   │   ├── insights/page.tsx       # Insights list
│   │   ├── analytics/
│   │   │   ├── page.tsx            # Analytics overview
│   │   │   └── revenue/page.tsx    # Revenue (pixel-enabled)
│   │   ├── settings/
│   │   │   ├── page.tsx            # Settings hub
│   │   │   ├── account/page.tsx    # Account settings
│   │   │   ├── billing/            # Subscription billing
│   │   │   │   ├── page.tsx        # Billing page (server)
│   │   │   │   ├── billing-settings.tsx  # Billing UI (client)
│   │   │   │   └── actions.ts      # Checkout/portal actions
│   │   │   ├── feed/page.tsx       # Feed settings
│   │   │   ├── pixel/page.tsx      # Pixel setup
│   │   │   ├── notifications/page.tsx
│   │   │   └── contacts/           # Contact management
│   │   │       ├── page.tsx
│   │   │       ├── actions.ts
│   │   │       └── contacts-list.tsx
│   │   └── export/page.tsx         # Data export
│   └── api/
│       ├── auth/[...nextauth]/route.ts  # Or custom auth
│       ├── feed/route.ts
│       ├── skus/route.ts
│       ├── insights/route.ts
│       ├── analytics/route.ts
│       └── pixel/route.ts
├── components/
├── lib/
│   ├── auth.ts                     # Dealer auth utilities
│   └── api.ts                      # API client
└── ...
```

### 3.2 Worker Extension: `apps/harvester` or new `apps/dealer-worker`

**Option A: Extend Harvester** (Recommended for MVP)
- Add new queues: `dealer-feed`, `dealer-match`, `dealer-benchmark`, `dealer-insight`
- Add new workers alongside existing ones
- Share Redis connection and patterns

**Option B: Separate Worker** (Future scale)
- Independent deployment and scaling
- Cleaner separation of concerns

---

## 4. Background Jobs

### 4.1 Job Queues (BullMQ)

| Queue | Purpose | Schedule |
|-------|---------|----------|
| `dealer-feed-ingest` | Download + parse dealer feeds | Hourly + manual |
| `dealer-sku-match` | Match dealer SKUs to canonical | After ingest |
| `dealer-benchmark` | Calculate price benchmarks | Every 2 hours |
| `dealer-insight` | Generate insights | After benchmark |
| `dealer-notification` | Send emails | On events + weekly |

### 4.2 Job Flow

```
[Scheduler] 
    ↓
[dealer-feed-ingest] → Download → Parse → Insert DealerSku rows
    ↓
[dealer-sku-match] → UPC match → Attribute match → Flag needs_review
    ↓
[dealer-benchmark] → Aggregate PricingSnapshots → Calculate benchmarks
    ↓
[dealer-insight] → Compare dealer price vs benchmark → Generate insights
    ↓
[dealer-notification] → Send emails based on events + preferences
```

---

## 5. API Endpoints

### 5.1 Dealer Portal API (`apps/dealer/app/api`)

```
# Auth
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/logout          # Clears session, redirects to dealer.ironscout.ai
POST   /api/auth/logout          # Returns JSON with redirectTo URL
POST   /api/auth/verify-email
POST   /api/auth/reset-password/request
POST   /api/auth/reset-password/complete
GET    /api/auth/me

# Feed
GET    /api/feed                    # Get feed config
POST   /api/feed                    # Create/update feed
POST   /api/feed/test               # Test connection
POST   /api/feed/refresh            # Manual refresh (rate limited)
GET    /api/feed/runs               # Feed run history

# SKUs
GET    /api/skus                    # List with filters
GET    /api/skus/:id                # Detail with hints
POST   /api/skus/:id/map            # Apply mapping
POST   /api/skus/:id/resolve        # Fix attributes

# Benchmarks
GET    /api/benchmarks              # Get benchmarks for dealer SKUs

# Insights
GET    /api/insights                # List active insights
POST   /api/insights/:id/dismiss    # Dismiss for N days

# Analytics
GET    /api/analytics/clicks        # Click metrics
GET    /api/analytics/skus          # Top SKUs
GET    /api/analytics/revenue       # Revenue (pixel only)

# Pixel
GET    /api/pixel                   # Get key + instructions
POST   /api/pixel/rotate            # Rotate key

# Settings
GET    /api/settings
PATCH  /api/settings
GET    /api/settings/notifications
PATCH  /api/settings/notifications

# Export
POST   /api/export                  # Generate CSV export
```

### 5.2 Public Pixel Endpoint (`apps/api`)

```
POST   /api/pixel/track             # Receive pixel events
       - Input: { dealerKey, orderId, orderValue, skuList }
       - Validates key, rate limits, stores event
```

### 5.3 Admin Endpoints (`apps/api` or `apps/dealer`)

```
GET    /api/admin/dealers           # List all dealers
GET    /api/admin/dealers/:id       # Dealer detail
POST   /api/admin/dealers/:id/suspend
POST   /api/admin/dealers/:id/approve
POST   /api/admin/dealers/:id/impersonate
GET    /api/admin/feeds             # System feed status
GET    /api/admin/audit             # Audit log
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create `apps/dealer` Next.js app
- [ ] Add Prisma schema for dealer models
- [ ] Run migration
- [ ] Implement dealer auth (register, login, verify, reset)
- [ ] Basic dashboard layout

### Phase 2: Feed Ingestion (Week 2-3)
- [ ] Feed configuration UI
- [ ] Feed test endpoint
- [ ] Add dealer feed jobs to harvester
- [ ] DealerFeedRun logging
- [ ] Feed status dashboard

### Phase 3: SKU Mapping (Week 3-4)
- [ ] SKU list with filters (needs_review, unmapped)
- [ ] SKU detail with parsed hints
- [ ] Manual mapping UI
- [ ] Attribute resolution UI
- [ ] CanonicalSku seeding

### Phase 4: Benchmarks & Insights (Week 4-5)
- [ ] PricingSnapshot capture after feed runs
- [ ] Benchmark calculation job
- [ ] Insight generation job
- [ ] Insights dashboard
- [ ] Dismiss functionality

### Phase 5: Analytics & Pixel (Week 5-6)
- [ ] Click tracking integration
- [ ] Pixel setup UI
- [ ] Pixel tracking endpoint
- [ ] Revenue dashboard
- [ ] Analytics aggregation

### Phase 6: Polish & Admin (Week 6-7)
- [ ] Notifications (email setup)
- [ ] Settings pages
- [ ] Data export
- [ ] Admin dealer list
- [ ] Admin impersonation with audit

---

## 7. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Separate app vs routes in existing | **Separate `apps/dealer`** | Different auth, different users, cleaner separation |
| Dealer auth method | **Email/password (custom)** | No OAuth complexity, dealers expect traditional login |
| Feed jobs location | **Extend `apps/harvester`** | Reuse infrastructure, patterns, Redis connection |
| CanonicalSku vs Product | **New CanonicalSku table** | Products are buyer-facing; CanonicalSku is for dealer benchmarking |
| Benchmark storage | **Dedicated table** | Pre-computed for fast reads, clear confidence tracking |
| Click tracking | **Extend existing or new** | Need to link to dealer context |

---

## 8. Final Decisions (CONFIRMED)

| Question | Decision | Details |
|----------|----------|----------|
| Deployment | **Subdomain** | `dealer.ironscout.ai` - separate Next.js app |
| Dealer approval | **Manual admin approval** | Dealers self-register → PENDING → Admin reviews/approves → ACTIVE |
| External benchmark data | **Internal only for MVP** | No external APIs exist yet; rely on IronScout harvester + dealer data |
| Admin access | **Reuse existing IronScout admin auth** | Existing admins from main site get full dealer portal access |
| Dealer auth | **Email/password** | Username/password credentials, separate from consumer OAuth |
| Data isolation | **Strict dealer scoping** | Dealers see ONLY their own data; admins see all + can impersonate |

---

## 9. Authentication Architecture

### 9.1 Two Auth Contexts

```
┌─────────────────────────────────────────────────────────────────┐
│                    dealer.ironscout.ai                          │
├─────────────────────────────────────────────────────────────────┤
│  Path: /login, /register                                        │
│  Auth: DealerCredentialsProvider (email/password)               │
│  Session: { dealerId, email, role: 'DEALER' }                   │
│  Access: Own dealer data only                                   │
├─────────────────────────────────────────────────────────────────┤
│  Path: /admin/*                                                 │
│  Auth: Reuse existing admin check (ADMIN_EMAILS env var)        │
│  Session: { adminEmail, role: 'ADMIN' }                         │
│  Access: All dealer data, impersonation, audit log              │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Admin Access Strategy (CONFIRMED)

**Shared Admin Session via Existing IronScout Auth**
- Admins log in via main ironscout.ai with existing OAuth (Google)
- Dealer portal checks for admin session cookie (cross-subdomain)
- Admin must be in ADMIN_EMAILS env var (existing mechanism)
- If admin, grant full access to all dealer data + admin nav
- Admin actions logged to AdminAuditLog with adminEmail

**Cross-Domain Cookie Setup:**
- Set cookie domain to `.ironscout.ai` to share between subdomains
- Or use JWT token validation against main site

**Implementation:**
```typescript
// apps/dealer/lib/auth.ts
export async function getSession(req: Request) {
  // Check for dealer session first
  const dealerSession = await getDealerSession(req);
  if (dealerSession) {
    return { type: 'dealer', dealer: dealerSession };
  }
  
  // Check for admin session (from main site cookie)
  const adminSession = await getAdminSession(req);
  if (adminSession && ADMIN_EMAILS.includes(adminSession.email)) {
    return { type: 'admin', admin: adminSession };
  }
  
  return null;
}
```

### 9.3 Dealer Registration Flow

```
1. Dealer visits dealer.ironscout.ai/register
2. Fills form: email, password, businessName, website, etc.
3. Email verification sent
4. Dealer verifies email → status: PENDING
5. Admin sees pending dealer in /admin/dealers
6. Admin reviews, approves → status: ACTIVE
7. Dealer receives "approved" email
8. Dealer can now set up feed
```

### 9.4 Authorization Middleware

```typescript
// apps/dealer/middleware.ts
export async function middleware(req: NextRequest) {
  const session = await getSession(req);
  const path = req.nextUrl.pathname;
  
  // Public routes
  if (path.startsWith('/login') || path.startsWith('/register')) {
    return NextResponse.next();
  }
  
  // Admin routes - require admin
  if (path.startsWith('/admin')) {
    if (session?.type !== 'admin') {
      return NextResponse.redirect('/login');
    }
    return NextResponse.next();
  }
  
  // Dealer routes - require dealer OR admin
  if (!session) {
    return NextResponse.redirect('/login');
  }
  
  // If admin viewing dealer routes, they see admin UI
  // If dealer, scope all queries to their dealerId
  return NextResponse.next();
}
```

---

## 10. Benchmark Cold Start Strategy

### 10.1 Problem
No external market data APIs available for MVP. New dealers need benchmarks on day 1.

### 10.2 Solution: Internal Data Only

**Data Sources (in order of preference):**
1. **Other dealer feeds** - If 2+ dealers sell same CanonicalSku, we can benchmark
2. **IronScout harvester data** - Existing Product/Price data from affiliate feeds
3. **No benchmark** - Mark as `confidence: NONE` if no data available

**Confidence Levels:**
```
HIGH   = 3+ distinct retailers with prices
MEDIUM = 2 retailers with prices  
NONE   = 0-1 retailers (no meaningful benchmark)
```

### 10.3 Linking Dealer SKUs to IronScout Data

```sql
-- CanonicalSku can link to existing Product table
ALTER TABLE CanonicalSku ADD COLUMN productId TEXT REFERENCES Product(id);

-- When matching dealer SKU, if we find a Product match, link it
-- This gives us immediate access to existing price history
```

### 10.4 Future: External Data (v2)
- Ammoseek API (if available)
- GunBroker/GunDeals data
- Direct manufacturer MSRP feeds
- Web scraping of major retailers

---

## 11. Data Model: Dealer ↔ Existing Integration

### 11.1 Connection Points

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Dealer     │────▶│  DealerSku   │────▶│ CanonicalSku │
│              │     │              │     │              │
│ businessName │     │ rawName      │     │ caliber      │
│ website      │     │ rawPrice     │     │ grainWeight  │
│ status       │     │ mappedToId   │     │ brand        │
└──────────────┘     └──────────────┘     │ productId ───┼──┐
                                          └──────────────┘  │
                                                            │
┌──────────────────────────────────────────────────────────┐│
│                   Existing IronScout                      ││
├──────────────────────────────────────────────────────────┤│
│  ┌─────────┐     ┌─────────┐     ┌──────────┐            ││
│  │ Product │◀────│  Price  │────▶│ Retailer │            │◀┘
│  │         │     │         │     │          │            │
│  │ name    │     │ price   │     │ name     │            │
│  │ caliber │     │ inStock │     │ domain   │            │
│  └─────────┘     └─────────┘     └──────────┘            │
└──────────────────────────────────────────────────────────┘
```

### 11.2 Benchmark Calculation

```typescript
async function calculateBenchmark(canonicalSkuId: string): Promise<Benchmark> {
  // 1. Get all dealer prices for this SKU
  const dealerPrices = await prisma.pricingSnapshot.findMany({
    where: { canonicalSkuId, isOutlier: false },
    orderBy: { capturedAt: 'desc' },
    take: 100, // Recent snapshots only
  });
  
  // 2. Get IronScout harvester prices if CanonicalSku links to Product
  const canonicalSku = await prisma.canonicalSku.findUnique({
    where: { id: canonicalSkuId },
    include: { product: { include: { prices: true } } },
  });
  
  const harvesterPrices = canonicalSku?.product?.prices
    ?.filter(p => p.inStock)
    ?.map(p => p.price) ?? [];
  
  // 3. Combine and calculate
  const allPrices = [
    ...dealerPrices.map(p => p.price),
    ...harvesterPrices,
  ];
  
  // 4. Determine confidence
  const uniqueRetailers = new Set([
    ...dealerPrices.map(p => p.dealerId),
    ...harvesterPrices.length > 0 ? ['ironscout'] : [],
  ]).size;
  
  const confidence = 
    uniqueRetailers >= 3 ? 'HIGH' :
    uniqueRetailers >= 2 ? 'MEDIUM' : 'NONE';
  
  return {
    canonicalSkuId,
    minPrice: Math.min(...allPrices),
    medianPrice: median(allPrices),
    maxPrice: Math.max(...allPrices),
    sampleSize: allPrices.length,
    retailerCount: uniqueRetailers,
    source: harvesterPrices.length > 0 ? 'INTERNAL' : 'DEALER_ONLY',
    confidence,
  };
}
```

---

## 12. Updated Schema (with decisions applied)

### Dealer Model Updates

```prisma
model Dealer {
  id                String        @id @default(uuid())
  email             String        @unique
  passwordHash      String        // bcrypt hash
  businessName      String
  website           String?
  contactFirstName  String?       // Split from contactName
  contactLastName   String?       // Split from contactName
  contactPhone      String?
  
  // Approval workflow
  status          DealerStatus  @default(PENDING)  // PENDING → ACTIVE
  approvedAt      DateTime?
  approvedBy      String?       // Admin email who approved
  
  tier            DealerTier    @default(FOUNDING)
  
  // Email verification
  emailVerified   Boolean       @default(false)
  verifyToken     String?       @unique
  verifyExpires   DateTime?
  
  // Password reset
  resetToken      String?       @unique
  resetExpires    DateTime?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  // Relations
  feeds           DealerFeed[]
  skus            DealerSku[]
  insights        DealerInsight[]
  pixelEvents     PixelEvent[]
  clickEvents     ClickEvent[]
  contacts        DealerContact[]
  
  @@index([status])
  @@index([email])
}

model DealerContact {
  id                String              @id @default(cuid())
  dealerId          String
  firstName         String
  lastName          String
  email             String
  phone             String?
  role              DealerContactRole   @default(PRIMARY)
  marketingOptIn    Boolean             @default(false)   // Promotional emails
  communicationOptIn Boolean            @default(true)    // Operational emails
  isPrimary         Boolean             @default(false)   // Main contact for dealer
  isActive          Boolean             @default(true)
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  
  dealer            Dealer              @relation(fields: [dealerId], references: [id], onDelete: Cascade)
  
  @@unique([dealerId, email])
  @@index([dealerId])
  @@index([isPrimary])
  @@map("dealer_contacts")
}

enum DealerContactRole {
  PRIMARY
  BILLING
  TECHNICAL
  MARKETING
  OTHER
}
```

---

## 12.1 Contact Management

### Overview

Dealers can manage multiple contacts who receive communications from IronScout. Each dealer has a "main contact" (stored on Dealer model) plus additional contacts via the DealerContact model.

### Features

**Dealer Portal (`/settings/contacts`):**
- Add/edit/delete contacts (OWNER and ADMIN roles only)
- Set primary contact (receives all default communications)
- Configure email preferences per contact:
  - `communicationOptIn` - Operational emails (feed alerts, account updates)
  - `marketingOptIn` - Promotional emails
- Assign roles: PRIMARY, BILLING, TECHNICAL, MARKETING, OTHER

**Admin Portal (`/dealers/[id]`):**
- Full CRUD for dealer contacts
- Same capabilities as dealers
- All changes logged to AdminAuditLog

### Contact Roles (Future Use)

Roles are stubbed for future email routing:
- **PRIMARY** - Default recipient for all communications
- **BILLING** - Invoice and payment notifications
- **TECHNICAL** - Feed errors, API issues
- **MARKETING** - Promotional campaigns
- **OTHER** - Custom contact

### Email Opt-in System

| Field | Default | Purpose |
|-------|---------|----------|
| `communicationOptIn` | `true` | Feed alerts, account updates, weekly reports |
| `marketingOptIn` | `false` | Promotional emails, feature announcements |

### Registration Flow

When a dealer registers:
1. Creates Dealer with `contactFirstName` and `contactLastName`
2. Creates DealerUser (owner account)
3. Auto-creates initial DealerContact:
   - Sets as PRIMARY role
   - Sets `isPrimary = true`
   - Email matches owner user email
   - `marketingOptIn = false`, `communicationOptIn = true`

---

## 12.2 Billing Management

### Overview

Dealers manage their subscription and billing through the `/settings/billing` page. The system integrates with Stripe for payment processing.

### Features

**Billing Settings Page (`/settings/billing`):**
- View current subscription status (ACTIVE/EXPIRED/SUSPENDED/CANCELLED)
- View plan tier (STANDARD/PRO/FOUNDING)
- View next billing date and payment method
- Subscribe to a plan via Stripe Checkout
- Manage billing via Stripe Customer Portal (update payment, cancel, view invoices)

**Plan Options:**
| Plan | Price | Features |
|------|-------|----------|
| Standard | $99/month | Feed ingestion, basic insights, standard support |
| Pro | $299/month | Competitive intelligence, API access, priority support |
| Founding | Free (1 year) | All Pro features during founding period |

### Implementation Files

- `apps/dealer/app/(dashboard)/settings/billing/page.tsx` - Server component
- `apps/dealer/app/(dashboard)/settings/billing/billing-settings.tsx` - Client component
- `apps/dealer/app/(dashboard)/settings/billing/actions.ts` - Server actions

### Server Actions

**`createCheckoutSession(dealerId, planId)`**
- Creates Stripe Checkout session for subscription
- Calls `POST /api/payments/dealer/create-checkout` on API server
- Returns Stripe Checkout URL for redirect

**`createPortalSession(dealerId)`**
- Creates Stripe Customer Portal session
- Calls `POST /api/payments/dealer/create-portal-session` on API server
- Returns portal URL for billing management

### Permission Model

- Only OWNER and ADMIN roles can manage billing
- MEMBER and VIEWER roles see read-only subscription status

### Environment Variables

```env
# Dealer Portal
STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY=price_...
STRIPE_PRICE_ID_DEALER_PRO_MONTHLY=price_...
NEXT_PUBLIC_DEALER_URL=https://dealer.ironscout.ai
INTERNAL_API_URL=http://localhost:8000
```

### Webhook Integration

Stripe webhooks update dealer subscription status automatically:
- `checkout.session.completed` → Sets status to ACTIVE
- `invoice.paid` → Updates `subscriptionExpiresAt`
- `invoice.payment_failed` → Sets status to EXPIRED
- `customer.subscription.deleted` → Sets status to CANCELLED

See `docs/deployment/stripe.md` for full webhook documentation.

---

## 13. Open Questions (RESOLVED)

| Original Question | Resolution |
|-------------------|------------|
| Subdomain or path? | **Subdomain**: `dealer.ironscout.ai` |
| Founding dealer onboarding - self-serve or manual? | **Manual approval** by existing IronScout admins |
| External market data source? | **None for MVP** - APIs don't exist yet; use internal data only |
| Admin auth - reuse or separate? | **Reuse existing** - IronScout admins (ADMIN_EMAILS) get full access |
| Deployment strategy? | **Subdomain** with shared cookie domain for admin auth |

---

## Next Steps

1. ✅ Decisions finalized and confirmed
2. [ ] Add complete Prisma schema to `packages/db/schema.prisma`
3. [ ] Create and run migration
4. [ ] Scaffold `apps/dealer` Next.js app
5. [ ] Configure subdomain + shared cookie domain for admin auth
6. [ ] Implement dealer auth (register, login, verify, reset)
7. [ ] Implement admin session check (reuse from main site)
8. [ ] Build admin approval workflow
9. [ ] Begin Phase 1: Basic dashboard

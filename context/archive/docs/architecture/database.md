# Database Schema

IronScout uses PostgreSQL with Prisma ORM and pgvector extension for semantic search.

## Overview

The database is organized into several logical sections:
- **Consumer** - Users, products, prices, alerts
- **Dealer Portal** - Dealers, feeds, SKUs, insights
- **Harvester** - Sources, executions, logs
- **Admin** - Audit logs, admin actions

---

## Core Models

### User

Consumer accounts with authentication and subscription tier.

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  tier          UserTier  @default(FREE)  // FREE, PREMIUM

  // Stripe
  stripeCustomerId     String?
  stripeSubscriptionId String?

  // Relations
  alerts        Alert[]
  accounts      Account[]
  sessions      Session[]
}

enum UserTier {
  FREE
  PREMIUM
}
```

### Product

Canonical product catalog with AI-enhanced fields.

```prisma
model Product {
  id          String   @id @default(cuid())
  name        String
  category    String
  caliber     String?
  brand       String?
  imageUrl    String?
  grainWeight Int?
  roundCount  Int?
  caseMaterial String?  // brass, steel, aluminum
  purpose     String?  // defense, range, hunting, match
  upc         String?

  // Premium AI fields
  bulletType            BulletType?
  pressureRating        PressureRating? @default(STANDARD)
  muzzleVelocityFps     Int?
  isSubsonic            Boolean?
  shortBarrelOptimized  Boolean?
  suppressorSafe        Boolean?
  lowFlash              Boolean?
  lowRecoil             Boolean?
  controlledExpansion   Boolean?
  matchGrade            Boolean?

  // Data quality
  dataSource      DataSource?    @default(UNKNOWN)
  dataConfidence  Decimal?    @db.Decimal(3, 2)

  // Semantic search
  embedding       Unsupported("vector(1536)")?

  // Relations
  prices    Price[]
  alerts    Alert[]
  reports   ProductReport[]
}

enum BulletType {
  FMJ, JHP, SP, BJHP, HST, VMAX, OTM, // ... more
}

enum PressureRating {
  STANDARD, PLUS_P, PLUS_P_PLUS, NATO
}

enum DataSource {
  MANUFACTURER, PARSED, AI_INFERRED, USER_REPORTED
}
```

### Retailer

Store information with tier classification.

```prisma
model Retailer {
  id           String       @id @default(cuid())
  name         String
  domain       String       @unique
  logoUrl      String?
  tier         RetailerTier @default(STANDARD)
  isActive     Boolean      @default(true)

  // Affiliate tracking
  affiliateNetwork  String?
  affiliateId       String?

  prices  Price[]
}

enum RetailerTier {
  STANDARD
  PREMIUM
}
```

### Price

Current and historical pricing with shipping.

```prisma
model Price {
  id          String   @id @default(cuid())
  productId   String
  retailerId  String

  price       Decimal  @db.Decimal(10, 2)
  pricePerRound Decimal? @db.Decimal(10, 4)

  // Shipping
  shippingCost    Decimal? @db.Decimal(10, 2)
  freeShipping    Boolean  @default(false)
  shippingNote    String?

  // Availability
  inStock     Boolean  @default(true)
  stockLevel  String?  // "in_stock", "low_stock", "out_of_stock"

  // Source
  sourceUrl   String
  lastSeen    DateTime @default(now())

  product   Product  @relation(...)
  retailer  Retailer @relation(...)

  @@unique([productId, retailerId])
}
```

### Alert

User price alerts with tier-based features.

```prisma
model Alert {
  id          String      @id @default(cuid())
  userId      String
  productId   String

  targetPrice Decimal     @db.Decimal(10, 2)
  isActive    Boolean     @default(true)

  // Notification tracking
  lastNotified DateTime?
  notifyCount  Int        @default(0)

  createdAt   DateTime    @default(now())

  user    User    @relation(...)
  product Product @relation(...)
}
```

---

## Dealer Portal Models

### Dealer

Dealer account with subscription management.

```prisma
model Dealer {
  id            String       @id @default(cuid())
  businessName  String
  websiteUrl    String

  // Contact (legacy - use DealerContact)
  contactFirstName String
  contactLastName  String
  phone            String?

  // Account status
  status        DealerStatus @default(PENDING)
  tier          DealerTier   @default(STANDARD)
  storeType     StoreType    @default(ONLINE_ONLY)

  // Subscription
  subscriptionStatus    SubscriptionStatus @default(ACTIVE)
  subscriptionExpiresAt DateTime?
  subscriptionGraceDays Int                @default(7)

  // Payment
  paymentMethod         PaymentMethod?
  stripeCustomerId      String?
  stripeSubscriptionId  String?

  // Pixel tracking
  pixelEnabled  Boolean  @default(false)
  pixelId       String?  @unique

  // Relations
  users     DealerUser[]
  contacts  DealerContact[]
  feeds     DealerFeed[]
  skus      DealerSku[]
  insights  DealerInsight[]
}

enum DealerStatus {
  PENDING, ACTIVE, SUSPENDED
}

enum DealerTier {
  STANDARD, PRO, FOUNDING
}

enum SubscriptionStatus {
  ACTIVE, EXPIRED, SUSPENDED, CANCELLED
}

enum PaymentMethod {
  STRIPE, PURCHASE_ORDER
}
```

### DealerUser

Team members with role-based access.

```prisma
model DealerUser {
  id        String         @id @default(cuid())
  dealerId  String
  email     String         @unique
  role      DealerUserRole @default(MEMBER)

  emailVerified     Boolean   @default(false)
  verificationToken String?

  dealer  Dealer @relation(...)
}

enum DealerUserRole {
  OWNER, ADMIN, MEMBER, VIEWER
}
```

### DealerContact

Multi-contact management with email preferences.

```prisma
model DealerContact {
  id        String   @id @default(cuid())
  dealerId  String

  firstName String
  lastName  String
  email     String
  phone     String?

  // Roles (array of DealerContactRole)
  roles     DealerContactRole[]

  // Email preferences
  communicationOptIn Boolean @default(true)
  marketingOptIn     Boolean @default(false)

  // Account ownership (exactly ONE per dealer)
  isAccountOwner Boolean @default(false)
  isActive       Boolean @default(true)

  dealer  Dealer @relation(...)

  @@unique([dealerId, email])
}

// Note: Account owner uniqueness is enforced via application logic,
// not a Prisma unique constraint (which would block multiple false values)

enum DealerContactRole {
  PRIMARY, BILLING, TECHNICAL, MARKETING
}
```

### DealerFeed

Feed configuration and processing status.

```prisma
model DealerFeed {
  id        String   @id @default(cuid())
  dealerId  String
  name      String

  // Access configuration
  accessType   FeedAccessType  // URL, FTP, UPLOAD
  formatType   FeedFormatType  // CSV, XML, JSON
  url          String?

  // FTP credentials (encrypted)
  ftpHost      String?
  ftpUser      String?
  ftpPassword  String?
  ftpPath      String?

  // Processing
  enabled      Boolean    @default(true)
  status       FeedStatus @default(HEALTHY)

  // Scheduling
  refreshIntervalMinutes Int @default(360)  // 6 hours
  lastRunAt              DateTime?

  // Status tracking
  lastSuccessAt  DateTime?
  lastFailureAt  DateTime?
  lastError      String?

  dealer  Dealer     @relation(...)
  runs    FeedRun[]
  skus    DealerSku[]
}

enum FeedAccessType {
  URL, FTP, UPLOAD
}

enum FeedFormatType {
  CSV, XML, JSON
}

enum FeedStatus {
  PENDING, HEALTHY, WARNING, FAILED
}
```

### DealerSku

Individual SKU data from dealer feeds.

```prisma
model DealerSku {
  id        String   @id @default(cuid())
  dealerId  String
  feedId    String

  // SKU identifiers
  sku       String
  upc       String?

  // Product data
  title       String
  price       Decimal  @db.Decimal(10, 2)
  cost        Decimal? @db.Decimal(10, 2)
  quantity    Int?
  inStock     Boolean  @default(true)

  // Attributes for matching
  caliber     String?
  brand       String?
  grainWeight Int?
  roundCount  Int?

  // Matching
  canonicalSkuId   String?
  matchConfidence  MatchConfidence?

  // URL for click tracking
  productUrl  String?

  lastSeenAt  DateTime @default(now())

  dealer       Dealer        @relation(...)
  feed         DealerFeed    @relation(...)
  canonicalSku CanonicalSku? @relation(...)

  @@unique([dealerId, sku])
}

enum MatchConfidence {
  HIGH, MEDIUM, LOW, NONE
}
```

### MarketBenchmark

Aggregated market data per caliber.

```prisma
model MarketBenchmark {
  id        String   @id @default(cuid())
  caliber   String   @unique

  // Price metrics
  avgPrice        Decimal @db.Decimal(10, 2)
  minPrice        Decimal @db.Decimal(10, 2)
  maxPrice        Decimal @db.Decimal(10, 2)
  medianPrice     Decimal @db.Decimal(10, 2)

  // Per-round metrics
  avgPricePerRound    Decimal? @db.Decimal(10, 4)
  minPricePerRound    Decimal? @db.Decimal(10, 4)

  // Volume
  skuCount        Int
  dealerCount     Int

  calculatedAt    DateTime @default(now())
}
```

### DealerInsight

Actionable recommendations for dealers.

```prisma
model DealerInsight {
  id        String      @id @default(cuid())
  dealerId  String

  type      InsightType
  priority  InsightPriority

  title     String
  message   String

  // Context
  skuId     String?
  caliber   String?

  // Metrics
  currentValue  Decimal? @db.Decimal(10, 2)
  targetValue   Decimal? @db.Decimal(10, 2)
  potentialImpact String?

  // Status
  isRead      Boolean @default(false)
  isDismissed Boolean @default(false)

  createdAt   DateTime @default(now())

  dealer  Dealer @relation(...)
}

enum InsightType {
  OVERPRICED, UNDERPRICED, STOCK_OPPORTUNITY, ATTRIBUTE_GAP
}

enum InsightPriority {
  HIGH, MEDIUM, LOW
}
```

---

## Harvester Models

### Source

Crawl source configuration.

```prisma
model Source {
  id          String     @id @default(cuid())
  name        String
  url         String
  type        SourceType  // RSS, HTML, JSON, JS_RENDERED

  isActive    Boolean    @default(true)
  priority    Int        @default(0)

  // Schedule
  intervalMinutes Int    @default(60)
  lastRunAt       DateTime?

  // Config
  config      Json?      // Extraction rules, selectors, etc.

  executions  Execution[]
}
```

### Execution

Crawl execution tracking.

```prisma
model Execution {
  id        String          @id @default(cuid())
  sourceId  String

  status    ExecutionStatus @default(PENDING)

  startedAt   DateTime?
  completedAt DateTime?

  // Metrics
  productsFound   Int @default(0)
  productsUpdated Int @default(0)
  pricesUpdated   Int @default(0)
  errors          Int @default(0)

  source  Source         @relation(...)
  logs    ExecutionLog[]
}

enum ExecutionStatus {
  PENDING, RUNNING, COMPLETED, FAILED
}
```

---

## Admin Models

### AdminAuditLog

Track admin actions for compliance.

```prisma
model AdminAuditLog {
  id        String   @id @default(cuid())
  adminId   String
  action    String

  // Target
  resource    String?
  resourceId  String?

  // Changes
  oldValue    Json?
  newValue    Json?

  // Context
  ipAddress   String?
  userAgent   String?

  createdAt   DateTime @default(now())
}
```

---

## Key Indexes

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Product search
CREATE INDEX idx_products_caliber ON products(caliber);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_purpose ON products(purpose);
CREATE INDEX idx_products_bullet_type ON products(bullet_type);

-- Vector search (pgvector HNSW)
CREATE INDEX idx_products_embedding_hnsw ON products
USING hnsw (embedding vector_cosine_ops);

-- Price lookups
CREATE INDEX idx_prices_product ON prices(product_id);
CREATE INDEX idx_prices_retailer ON prices(retailer_id);
CREATE INDEX idx_prices_in_stock ON prices(in_stock);

-- Dealer lookups
CREATE INDEX idx_dealer_skus_dealer ON dealer_skus(dealer_id);
CREATE INDEX idx_dealer_skus_caliber ON dealer_skus(caliber);
CREATE INDEX idx_dealer_contacts_dealer ON dealer_contacts(dealer_id);

-- Alerts
CREATE INDEX idx_alerts_user ON alerts(user_id);
CREATE INDEX idx_alerts_product ON alerts(product_id);
CREATE INDEX idx_alerts_active ON alerts(is_active);
```

---

## Database Operations

### Generate Prisma Client

```bash
cd packages/db
pnpm db:generate
```

### Run Migrations

```bash
pnpm db:migrate
```

### Push Schema (dev only)

```bash
pnpm db:push
```

### Open Prisma Studio

```bash
pnpm db:studio
```

---

## Importing Prisma

Always import from the shared package:

```typescript
import { prisma } from '@ironscout/db';

// Use in API routes, server actions, workers
const products = await prisma.product.findMany({
  where: { caliber: '9mm' },
  include: { prices: true }
});
```

---

*Last updated: December 14, 2024*


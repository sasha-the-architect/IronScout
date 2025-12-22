# Deal Sniper - AI Agent Architecture

**Status**: Post-1.0 Feature  
**Priority**: High  
**Target**: Premium Tier Exclusive

## Executive Summary

Deal Sniper is an autonomous AI agent that actively hunts ammunition deals for users. Unlike traditional alerts that fire *after* a deal appears, Deal Sniper predicts, scores urgency, and notifies with actionable context—transforming users from reactive browsers to informed buyers who never miss a deal.

**Core Innovation**: The ammo market is reactive. Nobody is predictive. Deal Sniper changes that.

---

## Problem Statement

Current ammunition shopping experience:

- Deals appear and vanish in minutes
- Users babysit alerts that fire too late
- No way to know if you should buy now or wait
- No insight into what's *about to* happen
- AmmoSeek, Wiki Arms, etc. are **dumb directories**—they show what's available *right now*

---

## Core Value Proposition

| Current State (Alerts) | Deal Sniper |
|------------------------|-------------|
| "Price dropped below $X" | "Price dropped, 73% chance sells out in 2 hours, BUY NOW" |
| Fires after the fact | Predicts windows before they close |
| Binary: triggered or not | Scored: urgency, confidence, match quality |
| You check availability | It already verified in-stock |
| Generic notification | Personalized: "This matches your Glock 43 setup" |

**User Value**: "I saved $400 last year and never missed a restock"

---

## User Experience

### Creating a Hunt

```
┌─────────────────────────────────────────────────────────────┐
│                     CREATE A HUNT                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  What are you looking for?                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ "1000 rounds of 9mm 124gr brass for carry training"   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Agent understands:                                         │
│  ✓ Caliber: 9mm                                            │
│  ✓ Grain: 124gr                                            │
│  ✓ Case: Brass                                             │
│  ✓ Quantity: 1000 rounds                                   │
│  ✓ Purpose: Training (FMJ acceptable)                      │
│                                                             │
│  Maximum price per round: $0.22                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ○─────────────────●──────────────────○               │  │
│  │ $0.16           $0.22              $0.30             │  │
│  │        Current market avg: $0.24                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  How aggressive should I hunt?                              │
│  ◉ Sniper - Only notify for exceptional deals              │
│  ○ Hunter - Notify for good deals                          │
│  ○ Scout - Notify for any match                            │
│                                                             │
│                              [Start Hunting]                │
└─────────────────────────────────────────────────────────────┘
```

### Notification Example

```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 DEAL SNIPER                              2 minutes ago   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Federal American Eagle 9mm 124gr FMJ - 1000rd              │
│ $179.99 ($0.18/rd) at Brownells                            │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ 🔥 URGENCY: HIGH                                     │    │
│ │                                                      │    │
│ │ • 22% below your target price                       │    │
│ │ • 18% below 90-day average                          │    │
│ │ • Selling ~47 units/hour                            │    │
│ │ • Estimated sellout: 1-2 hours                      │    │
│ │ • Brownells restocked this SKU 3x this month       │    │
│ └─────────────────────────────────────────────────────┘    │
│                                                             │
│        [🛒 BUY NOW]     [⏰ Snooze]     [Skip]              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER LAYER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Web App              Mobile App (PWA)           Email/SMS             │
│      │                      │                        ▲                  │
│      └──────────────────────┴────────────────────────┼──────────────────│
│                             │                        │                  │
└─────────────────────────────┼────────────────────────┼──────────────────┘
                              │                        │
                              ▼                        │
┌─────────────────────────────────────────────────────────────────────────┐
│                            API LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   /api/hunts              /api/opportunities         /api/notifications │
│   - CRUD hunts            - Get matches              - Preferences      │
│   - Parse intent          - Score & rank             - Delivery         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENT LAYER (New)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   Pattern   │  │   Urgency   │  │    Match    │  │Notification │   │
│  │  Detector   │  │   Scorer    │  │   Engine    │  │  Decider    │   │
│  │             │  │             │  │             │  │             │   │
│  │ - Restock   │  │ - Velocity  │  │ - Hunt ↔    │  │ - Fatigue   │   │
│  │   timing    │  │ - History   │  │   Product   │  │   mgmt      │   │
│  │ - Price     │  │ - Demand    │  │ - Scoring   │  │ - Channel   │   │
│  │   cycles    │  │   signals   │  │ - Ranking   │  │   selection │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│         │                │                │                │           │
│         └────────────────┴────────────────┴────────────────┘           │
│                                   │                                     │
│                                   ▼                                     │
│                          ┌───────────────┐                             │
│                          │  Agent Loop   │                             │
│                          │  (BullMQ)     │                             │
│                          └───────────────┘                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │    Hunt     │  │ Opportunity │  │   Stock     │  │  Retailer   │   │
│  │             │  │             │  │  Snapshot   │  │  Pattern    │   │
│  │ User's      │  │ Matches     │  │             │  │             │   │
│  │ standing    │  │ found by    │  │ Point-in-   │  │ Learned     │   │
│  │ requests    │  │ agent       │  │ time stock  │  │ behaviors   │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                                         │
│                      ┌─────────────────────┐                           │
│                      │  Existing Models    │                           │
│                      │  - Product          │                           │
│                      │  - Price            │                           │
│                      │  - Retailer         │                           │
│                      │  - Alert (legacy)   │                           │
│                      └─────────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     HARVESTER LAYER (Enhanced)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Existing Pipeline          │        New Capabilities                   │
│  ─────────────────          │        ────────────────                   │
│  Scheduler                  │        Stock level capture                │
│  Fetcher                    │        Change velocity tracking           │
│  Extractor         ───────► │        Pattern detection triggers         │
│  Normalizer                 │        Priority queue for hot items       │
│  Writer                     │                                           │
│  Alerter                    │                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### New Models

```prisma
// ===========================================
// DEAL SNIPER MODELS
// ===========================================

model Hunt {
  id              String        @id @default(cuid())
  userId          String
  
  // Natural language input (preserved)
  rawQuery        String
  
  // Parsed intent (from AI)
  calibers        String[]      // ["9mm"]
  grainWeights    Int[]         // [124, 147]
  caseMaterials   String[]      // ["brass"]
  purposes        String[]      // ["training", "defense"]
  brands          String[]      // [] = any
  bulletTypes     String[]      // ["FMJ", "JHP"]
  
  // Constraints
  maxPricePerRound  Decimal     @db.Decimal(10, 4)
  minQuantity       Int?        // Minimum rounds per deal
  
  // Behavior
  aggressiveness    HuntAggressiveness @default(HUNTER)
  
  // Status
  isActive        Boolean       @default(true)
  isPaused        Boolean       @default(false)
  pausedUntil     DateTime?
  
  // Stats
  opportunitiesFound  Int       @default(0)
  opportunitiesTaken  Int       @default(0)
  lastMatchAt         DateTime?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  user            User          @relation(fields: [userId], references: [id])
  opportunities   Opportunity[]
  
  @@index([userId, isActive])
  @@index([isActive, calibers])
  @@map("hunts")
}

enum HuntAggressiveness {
  SNIPER    // Only exceptional deals (top 10%)
  HUNTER    // Good deals (top 25%)
  SCOUT     // Any match under target price
}

model Opportunity {
  id              String            @id @default(cuid())
  huntId          String
  productId       String
  priceId         String
  
  // Snapshot at discovery
  pricePerRound   Decimal           @db.Decimal(10, 4)
  totalPrice      Decimal           @db.Decimal(10, 2)
  quantity        Int
  retailerName    String
  productUrl      String
  
  // Scoring
  urgencyScore    Int               // 0-100
  matchScore      Int               // 0-100, how well it fits hunt
  valueScore      Int               // 0-100, price vs market
  overallScore    Int               // Composite
  
  // Urgency factors (for explanation)
  estimatedSelloutMinutes  Int?
  stockVelocity            Decimal?  @db.Decimal(10, 2)  // units/hour
  priceVsAverage           Decimal?  @db.Decimal(5, 2)   // -0.18 = 18% below
  
  // Status
  status          OpportunityStatus @default(PENDING)
  notifiedAt      DateTime?
  notificationChannel String?       // "push", "email", "sms"
  userAction      UserAction?
  userActionAt    DateTime?
  
  // Expiry
  expiresAt       DateTime?         // When we think it'll be gone
  verifiedGoneAt  DateTime?         // When we confirmed OOS
  
  createdAt       DateTime          @default(now())
  
  hunt            Hunt              @relation(fields: [huntId], references: [id])
  product         Product           @relation(fields: [productId], references: [id])
  
  @@index([huntId, status])
  @@index([status, createdAt])
  @@map("opportunities")
}

enum OpportunityStatus {
  PENDING       // Found, evaluating
  NOTIFIED      // User notified
  EXPIRED       // Sold out before action
  TAKEN         // User clicked buy
  SKIPPED       // User passed
  SNOOZED       // User delayed
}

enum UserAction {
  CLICKED_BUY
  SKIPPED
  SNOOZED
}

model StockSnapshot {
  id              String        @id @default(cuid())
  productId       String
  retailerId      String
  
  // Point-in-time data
  inStock         Boolean
  stockLevel      String?       // "in_stock", "low_stock", "out_of_stock"
  quantityAvailable Int?        // If retailer provides
  
  // Price at this moment
  price           Decimal       @db.Decimal(10, 2)
  
  capturedAt      DateTime      @default(now())
  
  @@index([productId, retailerId, capturedAt])
  @@index([capturedAt])
  @@map("stock_snapshots")
}

model RetailerPattern {
  id              String        @id @default(cuid())
  retailerId      String
  
  // Pattern type
  patternType     PatternType
  
  // Pattern data (flexible JSON)
  // Examples:
  // - Restock: { dayOfWeek: 2, hourUtc: 14, confidence: 0.78 }
  // - PriceCycle: { lowDay: 1, highDay: 5, avgSwing: 0.03 }
  patternData     Json
  
  // Quality
  confidence      Decimal       @db.Decimal(3, 2)  // 0.00-1.00
  sampleSize      Int           // How many observations
  
  // Scope (optional - pattern may be retailer-wide or product-specific)
  caliber         String?
  brandId         String?
  productId       String?
  
  lastCalculatedAt DateTime     @default(now())
  
  retailer        Retailer      @relation(fields: [retailerId], references: [id])
  
  @@index([retailerId, patternType])
  @@map("retailer_patterns")
}

enum PatternType {
  RESTOCK_TIMING      // When they typically restock
  PRICE_CYCLE         // Weekly/monthly price patterns
  SELLOUT_VELOCITY    // How fast things sell
  DEAL_FREQUENCY      // How often deals appear
}

model HuntNotificationPrefs {
  id              String        @id @default(cuid())
  userId          String        @unique
  
  // Channels
  pushEnabled     Boolean       @default(true)
  emailEnabled    Boolean       @default(true)
  smsEnabled      Boolean       @default(false)
  smsNumber       String?
  
  // Timing
  quietHoursStart Int?          // Hour (0-23) in user's timezone
  quietHoursEnd   Int?
  timezone        String        @default("America/New_York")
  
  // Fatigue management
  maxDailyNotifications Int     @default(10)
  minMinutesBetween     Int     @default(30)
  
  user            User          @relation(fields: [userId], references: [id])
  
  @@map("hunt_notification_prefs")
}
```

### User Model Extensions

```prisma
model User {
  // ... existing fields
  
  // Deal Sniper additions
  hunts               Hunt[]
  huntNotificationPrefs HuntNotificationPrefs?
}
```

---

## Agent Workers

### Worker Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEAL SNIPER WORKERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐                                           │
│  │  Stock Tracker  │  Runs: Every harvester write              │
│  │                 │                                           │
│  │  - Captures StockSnapshot on price/stock changes            │
│  │  - Calculates velocity (Δ stock / Δ time)                   │
│  │  - Triggers urgency recalc for affected hunts               │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ Pattern Learner │  Runs: Daily (off-peak)                   │
│  │                 │                                           │
│  │  - Analyzes StockSnapshots for patterns                     │
│  │  - Detects restock timing per retailer/product              │
│  │  - Identifies price cycles                                  │
│  │  - Updates RetailerPattern with confidence                  │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  Hunt Matcher   │  Runs: On price change events             │
│  │                 │                                           │
│  │  - Evaluates changed products against active hunts          │
│  │  - Scores match quality (caliber, grain, case, brand)       │
│  │  - Creates Opportunity if score > threshold                 │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ Urgency Scorer  │  Runs: On new Opportunity                 │
│  │                 │                                           │
│  │  - Calculates stock velocity                                │
│  │  - Estimates sellout time                                   │
│  │  - Factors in historical patterns                           │
│  │  - Computes urgency score (0-100)                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │   Notifier      │  Runs: On scored Opportunity              │
│  │                 │                                           │
│  │  - Checks user prefs (quiet hours, fatigue limits)          │
│  │  - Selects channel (push > email > SMS based on urgency)    │
│  │  - Formats message with context                             │
│  │  - Sends notification                                       │
│  │  - Updates Opportunity.notifiedAt                           │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Queue Configuration

```typescript
// apps/harvester/src/config/queues.ts

export const QUEUE_NAMES = {
  // ... existing queues
  
  // Deal Sniper queues
  STOCK_TRACKER: 'deal-sniper-stock-tracker',
  PATTERN_LEARNER: 'deal-sniper-pattern-learner',
  HUNT_MATCHER: 'deal-sniper-hunt-matcher',
  URGENCY_SCORER: 'deal-sniper-urgency-scorer',
  HUNT_NOTIFIER: 'deal-sniper-notifier',
} as const
```

---

## Scoring Algorithms

### Match Score (0-100)

How well does this product match the hunt?

```typescript
function calculateMatchScore(hunt: Hunt, product: Product): number {
  let score = 0
  let maxScore = 0
  
  // Caliber match (required - 40 points)
  maxScore += 40
  if (hunt.calibers.includes(product.caliber)) {
    score += 40
  } else {
    return 0  // Hard requirement
  }
  
  // Grain weight (20 points)
  if (hunt.grainWeights.length > 0) {
    maxScore += 20
    if (hunt.grainWeights.includes(product.grainWeight)) {
      score += 20
    } else if (isWithinRange(product.grainWeight, hunt.grainWeights, 5)) {
      score += 10  // Close enough
    }
  }
  
  // Case material (15 points)
  if (hunt.caseMaterials.length > 0) {
    maxScore += 15
    if (hunt.caseMaterials.includes(product.caseMaterial)) {
      score += 15
    }
  }
  
  // Brand preference (10 points)
  if (hunt.brands.length > 0) {
    maxScore += 10
    if (hunt.brands.includes(product.brand)) {
      score += 10
    }
  }
  
  // Bullet type (15 points)
  if (hunt.bulletTypes.length > 0) {
    maxScore += 15
    if (hunt.bulletTypes.includes(product.bulletType)) {
      score += 15
    }
  }
  
  return Math.round((score / maxScore) * 100)
}
```

### Urgency Score (0-100)

How quickly will this opportunity disappear?

```typescript
function calculateUrgencyScore(
  opportunity: Opportunity,
  snapshots: StockSnapshot[],
  pattern: RetailerPattern | null
): UrgencyResult {
  
  // Calculate stock velocity (units sold per hour)
  const velocity = calculateVelocity(snapshots)
  
  // Estimate time until sellout
  const currentStock = snapshots[0]?.quantityAvailable
  const estimatedMinutes = currentStock && velocity > 0
    ? (currentStock / velocity) * 60
    : null
  
  // Factor in historical patterns
  const historicalMultiplier = pattern?.patternData?.avgSelloutHours
    ? 1 + (1 / pattern.patternData.avgSelloutHours)
    : 1
  
  // Price vs average (deals go faster)
  const priceMultiplier = opportunity.priceVsAverage < -0.15 
    ? 1.5  // 15%+ below average = 50% faster sellout
    : 1
  
  // Compute urgency
  let urgency = 50  // Base
  
  if (estimatedMinutes !== null) {
    if (estimatedMinutes < 30) urgency = 100
    else if (estimatedMinutes < 60) urgency = 90
    else if (estimatedMinutes < 120) urgency = 75
    else if (estimatedMinutes < 240) urgency = 60
    else urgency = 40
  }
  
  // Apply multipliers
  urgency = Math.min(100, urgency * historicalMultiplier * priceMultiplier)
  
  return {
    score: Math.round(urgency),
    estimatedSelloutMinutes: estimatedMinutes,
    stockVelocity: velocity,
    factors: {
      velocity,
      priceDiscount: opportunity.priceVsAverage,
      historicalPattern: pattern?.confidence || 0,
    }
  }
}
```

### Value Score (0-100)

How good is this deal compared to market?

```typescript
function calculateValueScore(
  price: Decimal,
  product: Product,
  marketData: MarketData
): number {
  const pricePerRound = price / product.roundCount
  
  // Compare to 90-day average
  const vsAverage = (marketData.avg90Day - pricePerRound) / marketData.avg90Day
  
  // Compare to recent low
  const vsRecentLow = (marketData.low30Day - pricePerRound) / marketData.low30Day
  
  // Percentile ranking (where does this fall in price distribution)
  const percentile = calculatePercentile(pricePerRound, marketData.priceDistribution)
  
  // Weighted score
  const score = (
    (vsAverage * 40) +           // 40% weight on vs average
    (vsRecentLow * 30) +         // 30% weight on vs recent low
    ((100 - percentile) * 0.3)   // 30% weight on percentile
  )
  
  return Math.max(0, Math.min(100, Math.round(score)))
}
```

---

## Notification Strategy

### Channel Selection

```typescript
function selectNotificationChannel(
  opportunity: Opportunity,
  prefs: HuntNotificationPrefs
): NotificationChannel {
  
  const urgency = opportunity.urgencyScore
  
  // High urgency (>80): Use fastest available channel
  if (urgency > 80) {
    if (prefs.smsEnabled) return 'sms'
    if (prefs.pushEnabled) return 'push'
    return 'email'
  }
  
  // Medium urgency (50-80): Push preferred
  if (urgency > 50) {
    if (prefs.pushEnabled) return 'push'
    return 'email'
  }
  
  // Low urgency: Email is fine
  return 'email'
}
```

### Fatigue Prevention

```typescript
async function shouldNotify(
  userId: string,
  opportunity: Opportunity,
  prefs: HuntNotificationPrefs
): Promise<{ allow: boolean; reason?: string }> {
  
  // Check quiet hours
  if (isQuietHours(prefs)) {
    // Only break quiet hours for urgency > 90
    if (opportunity.urgencyScore < 90) {
      return { allow: false, reason: 'quiet_hours' }
    }
  }
  
  // Check daily limit
  const todayCount = await getNotificationCountToday(userId)
  if (todayCount >= prefs.maxDailyNotifications) {
    // Only exceed for urgency > 85
    if (opportunity.urgencyScore < 85) {
      return { allow: false, reason: 'daily_limit' }
    }
  }
  
  // Check minimum interval
  const lastNotification = await getLastNotificationTime(userId)
  const minutesSince = differenceInMinutes(new Date(), lastNotification)
  if (minutesSince < prefs.minMinutesBetween) {
    // Only skip interval for urgency > 80
    if (opportunity.urgencyScore < 80) {
      return { allow: false, reason: 'too_soon' }
    }
  }
  
  return { allow: true }
}
```

---

## Premium Tier Integration

| Feature | FREE | PREMIUM |
|---------|------|---------|
| Active Hunts | 1 | Unlimited |
| Hunt Complexity | Single caliber, basic filters | Multi-caliber, all filters |
| Notification Delay | 30 minutes | Real-time |
| Urgency Scoring | Basic (High/Medium/Low) | Full (0-100 + explanation) |
| Stock Velocity | No | Yes |
| Predictive Alerts | No | "Restock expected Tuesday" |
| Historical Patterns | No | Full access |
| SMS Notifications | No | Yes |

---

## API Endpoints

```
# Hunt Management
POST   /api/hunts                    Create hunt (parses natural language)
GET    /api/hunts                    List user's hunts
GET    /api/hunts/:id                Get hunt details
PATCH  /api/hunts/:id                Update hunt
DELETE /api/hunts/:id                Delete hunt
POST   /api/hunts/:id/pause          Pause hunt
POST   /api/hunts/:id/resume         Resume hunt

# Opportunities
GET    /api/hunts/:id/opportunities  List opportunities for hunt
GET    /api/opportunities            List all user's opportunities
POST   /api/opportunities/:id/action Record user action (buy/skip/snooze)

# Notifications
GET    /api/notifications/prefs      Get notification preferences
PATCH  /api/notifications/prefs      Update preferences
POST   /api/notifications/test       Send test notification

# Analytics (Premium)
GET    /api/hunts/:id/analytics      Hunt performance stats
GET    /api/patterns/:retailerId     Retailer patterns (Premium)
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Schema additions (Hunt, Opportunity, StockSnapshot)
- [ ] Basic Hunt CRUD API
- [ ] Intent parsing for hunt creation (reuse existing intent parser)
- [ ] Simple hunt matching (no urgency yet)

### Phase 2: Stock Intelligence (Week 3-4)
- [ ] StockSnapshot capture in writer worker
- [ ] Velocity calculation
- [ ] Basic urgency scoring
- [ ] RetailerPattern model (capture, don't analyze yet)

### Phase 3: Notifications (Week 5-6)
- [ ] Notification preferences UI
- [ ] Push notification integration (web push)
- [ ] Email notifications with one-click buy
- [ ] Fatigue prevention logic

### Phase 4: Pattern Learning (Week 7-8)
- [ ] Pattern detection algorithm
- [ ] Restock timing predictions
- [ ] Price cycle detection
- [ ] Confidence scoring for patterns

### Phase 5: Polish & Premium (Week 9-10)
- [ ] Premium tier gating
- [ ] Hunt management UI
- [ ] Opportunity history/analytics
- [ ] SMS integration (Twilio)

---

## Infrastructure Requirements

### Existing Infrastructure (Reused)
- ✅ Semantic search + intent parsing
- ✅ Retailer polling infrastructure (harvester)
- ✅ Price history data
- ✅ Alert system (pattern reference)
- ✅ Premium tier billing

### New Infrastructure Needed
- 📊 Stock velocity tracking (how fast things sell)
- 🔮 Simple prediction model (historical patterns)
- 🧠 Enhanced ammo knowledge base (firearm/load compatibility)
- 🎯 Urgency scoring algorithm
- 📱 Push notification service (web push / Firebase)
- 📧 Transactional email templates (Resend)
- 📲 SMS gateway (Twilio) - Premium only

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Hunt → Opportunity conversion | >30% of hunts get matches within 7 days | `opportunities.count / hunts.count` |
| Notification → Click rate | >25% | `CLICKED_BUY / NOTIFIED` |
| User retention (hunters) | >60% monthly active | Users with active hunts returning |
| Sellout prediction accuracy | ±30 minutes | `ABS(predicted - actual)` |
| Premium conversion | >15% of free hunters upgrade | After hitting hunt limit |

---

## Open Questions

1. **Affiliate integration**: Can we pass affiliate links in notifications? Revenue share?
2. **Mobile app**: PWA sufficient or native app needed for reliable push?
3. **SMS costs**: At what scale does SMS become cost-prohibitive?
4. **Retailer API access**: Any retailers offer real-time stock APIs?
5. **Legal**: Any issues with automated "buy now" deep links?
6. **Firearm compatibility**: How deep should the "sommelier" knowledge go?

---

## Related Documents

- [AI Search System](../architecture/ai-search.md)
- [Harvester Architecture](../apps/harvester.md)
- [Scaling Strategy](../architecture/scaling-strategy.md)
- [Database Schema](../architecture/database.md)

---

*Created: December 19, 2025*  
*Status: Architecture Complete - Awaiting Post-1.0 Implementation*

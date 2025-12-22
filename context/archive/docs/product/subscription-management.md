# Dealer Subscription Management

This document outlines how IronScout manages dealer subscriptions, including billing methods, access control, grace periods, and notification workflows.

## Overview

IronScout supports two payment methods for dealer subscriptions:

1. **Stripe** - Automated recurring billing with credit card
2. **Purchase Order (PO)** - Manual invoicing for enterprise customers

Both methods use the same subscription status tracking and access control system.

---

## Subscription Tiers

IronScout offers two paid tiers plus a founding member program:

### STANDARD - $99/month

For small to mid-size dealers who want clear visibility into how their prices compare to the market.

**Features:**
- Product listing inclusion on IronScout.ai
- Dealer feed ingestion and SKU matching
- Market price benchmarks by caliber
- Basic pricing insights
- Email alerts for market changes
- Monthly performance reports
- Email support

### PRO - $299/month (Most Popular)

For dealers who need faster, deeper market insight to react confidently to pricing changes.

**Features:**
- Everything in Standard
- More frequent price monitoring
- SKU-level price comparisons
- Expanded market benchmarks
- Actionable pricing insights and alerts
- Historical pricing context
- API access for inventory synchronization
- Phone and email support

### FOUNDING (Special Program)

Early adopter program - PRO features free for 1 year.

- Full PRO feature access
- 1 year free subscription
- After first year, converts to regular PRO pricing ($299/month)
- Standard expiration and grace period logic applies

> **Note**: FOUNDING is NOT a separate feature tier - it's PRO with a promotional 1-year free period. After the free year, founders must renew at PRO pricing or downgrade to STANDARD.

---

## Subscription Statuses

| Status | Description | Portal Access | Feed Processing |
|--------|-------------|---------------|-----------------|
| **ACTIVE** | Subscription is current and valid | Full access | Enabled |
| **EXPIRED** | Subscription has lapsed | Grace period or blocked | Depends on grace period |
| **SUSPENDED** | Manually suspended by admin (e.g., payment dispute, ToS violation) | Blocked | Disabled |
| **CANCELLED** | Dealer cancelled their subscription | Blocked | Disabled |

---

## Access Control

### Access Levels

1. **Full Access** - All portal features available, feeds process normally
2. **Grace Period** - Full access with warning banner, feeds still process
3. **Blocked** - Redirected to status page, no portal access, feeds skip processing

### Grace Period Policy

- **Duration**: 7 days after expiration
- **Access**: Full portal access with prominent warning banner
- **Feed Processing**: Continues normally during grace period
- **Purpose**: Allow time for payment processing or renewal

### Behavior by Status

| Scenario | Access Level | Banner | Redirect |
|----------|--------------|--------|----------|
| Active, not expiring soon | Full | None | None |
| Active, expires in ≤30 days | Full | Warning (amber) | None |
| Expired, within grace period | Full | Error (red) | None |
| Expired, past grace period | Blocked | N/A | `/subscription-expired` |
| Suspended | Blocked | N/A | `/subscription-suspended` |
| Cancelled | Blocked | N/A | `/subscription-cancelled` |

### Admin Impersonation

When an admin impersonates a dealer account:
- All subscription checks are bypassed
- Full portal access regardless of subscription status
- Feed processing still respects subscription status (admin can trigger manual runs)
- Orange impersonation banner displays admin identity

---

## Dealer Portal Access Control

### How Access Control Works

The dealer portal checks subscription status on every page load in the dashboard layout:

```
┌─────────────────────────────────────────────────────────────┐
│                  Dealer Visits Portal                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │  Load Session &  │
                   │  Fresh Dealer    │
                   │     Data         │
                   └──────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │ Is Admin         │───Yes──▶ Full Access
                   │ Impersonating?   │         (bypass all checks)
                   └──────────────────┘
                              │ No
                              ▼
                   ┌──────────────────┐
                   │ Check Subscription│
                   │     Status        │
                   └──────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
  ┌───────────┐        ┌───────────┐        ┌───────────┐
  │  ACTIVE   │        │  EXPIRED  │        │ SUSPENDED │
  │           │        │           │        │ CANCELLED │
  └───────────┘        └───────────┘        └───────────┘
        │                     │                     │
        ▼                     ▼                     ▼
  ┌───────────┐        ┌───────────┐        ┌───────────┐
  │ Expiring  │        │ Within    │        │  Blocked  │
  │ Soon?     │        │ Grace?    │        │           │
  └───────────┘        └───────────┘        └───────────┘
        │                     │                     │
   ┌────┴────┐           ┌────┴────┐               │
   │         │           │         │               │
   ▼         ▼           ▼         ▼               ▼
┌──────┐ ┌──────┐   ┌──────┐ ┌──────┐      ┌──────────┐
│Full  │ │Amber │   │Red   │ │Block │      │ Redirect │
│Access│ │Banner│   │Banner│ │Access│      │ to Page  │
└──────┘ └──────┘   └──────┘ └──────┘      └──────────┘
```

### Session Data Requirements

The subscription check requires fresh dealer data from the database:

```typescript
// getSessionWithDealer() fetches:
{
  session: {
    type: 'dealer',
    dealerUserId: string,
    dealerId: string,
    isImpersonating?: boolean,
    impersonatedBy?: string,
  },
  dealer: {
    id: string,
    businessName: string,
    tier: 'STANDARD' | 'PRO' | 'FOUNDING',
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED',
    subscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED',
    subscriptionExpiresAt: Date | null,
    subscriptionGraceDays: number,
  }
}
```

### Subscription Check Response

The `checkSubscriptionStatus()` function returns:

```typescript
{
  accessLevel: 'full' | 'grace_period' | 'blocked',
  bannerMessage: string | null,      // Message to show in banner
  bannerType: 'warning' | 'error',   // Banner color
  redirectTo: string | null,         // Redirect URL if blocked
  daysUntilExpiry: number | null,    // Days remaining (negative if expired)
  isInGracePeriod: boolean,
  gracePeriodEndsAt: Date | null,
}
```

### Portal Feature Restrictions

| Feature | Full Access | Grace Period | Blocked |
|---------|-------------|--------------|---------|
| View Dashboard | Yes | Yes | No |
| View Feed Status | Yes | Yes | No |
| Trigger Feed Refresh | Yes | Yes | No |
| Edit Feed Configuration | Yes | Yes | No |
| View SKUs | Yes | Yes | No |
| View Insights | Yes | Yes | No |
| Manage Contacts | Yes | Yes | No |
| Manage Pixel | Yes | Yes | No |
| View Analytics | Yes | Yes | No |

> **Key Point**: Grace period provides FULL functionality, just with a warning banner. This ensures dealers can continue operations while resolving payment.

---

## Notification Schedule

### Pre-Expiration Reminders

Sent to **Account Owner** and **Billing contacts** at these intervals before expiration:

| Days Before | Email Subject | Urgency |
|-------------|---------------|---------|
| 60 days | Your IronScout subscription renews soon | Informational |
| 30 days | Your IronScout subscription expires in 30 days | Low |
| 10 days | Action required: Subscription expires in 10 days | Medium |
| 5 days | Urgent: Subscription expires in 5 days | High |

> **Note**: Only sent if subscription does NOT auto-renew (Stripe handles its own reminders for auto-renew subscriptions)

### Post-Expiration Notifications

| Timing | Notification | Recipients |
|--------|--------------|------------|
| On expiration | Subscription expired - renew now | Account Owner, Billing |
| Day 3 of grace | Grace period ending soon | Account Owner, Billing |
| End of grace period | Access suspended | Account Owner, Billing, Primary |

### Notification Content

All expiration-related emails include:
- Current subscription status
- Expiration/grace period end date
- Clear CTA to renew
- Link to contact support
- Phone number for sales team

---

## Payment Methods

### Stripe (Automated)

**Setup**:
1. Dealer selects plan in portal
2. Redirected to Stripe Checkout
3. On success, subscription activated automatically
4. Webhook updates subscription status in database

**Renewal**:
- Automatic charge on renewal date
- Stripe sends payment reminders
- On payment failure, status changes to EXPIRED
- Grace period begins

**Tracking Fields**:
- `stripeCustomerId` - Stripe customer ID
- `stripeSubscriptionId` - Stripe subscription ID
- `paymentMethod` - Set to `STRIPE`

### Purchase Order (Manual)

**Setup**:
1. Sales team negotiates terms
2. Admin creates dealer account
3. Admin sets subscription via admin portal:
   - Status: ACTIVE
   - Expiration date: Based on PO terms
   - Grace days: Typically 7 (can be customized for enterprise)

**Renewal**:
- Sales team sends invoice before expiration
- On payment receipt, admin extends subscription
- Use "Extend 1 Year" quick action or set custom date

**Tracking Fields**:
- `paymentMethod` - Set to `PURCHASE_ORDER`
- `subscriptionExpiresAt` - Manual expiration date
- `subscriptionGraceDays` - Can be customized per dealer

---

## Admin Portal Features

### Dealer Detail Page Overview

The admin portal dealer detail page (`/dealers/[id]`) provides comprehensive dealer management:

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Dealers              [Edit] [Active Badge]       │
│  Acme Firearms LLC                                          │
│  Dealer ID: clx...                                          │
├─────────────────────────────────────────────────────────────┤
│  Business Information          │  Statistics                │
│  • Main Contact               │  • SKUs: 1,234             │
│  • Portal Login Email         │  • Feeds: 2                │
│  • Phone                      │  • Clicks: 5,678           │
│  • Website                    │  • Conversions: 89         │
│  • Registered                 │                            │
├─────────────────────────────────────────────────────────────┤
│  Admin Actions                                              │
│  [Resend Verification] [Impersonate Dealer]                 │
├─────────────────────────────────────────────────────────────┤
│  Subscription                              [Edit]           │
│  Status: Active ✓    Plan: PRO    Expires: Dec 14, 2025    │
│  Grace Period: 7 days           [Extend 1 Year]             │
├─────────────────────────────────────────────────────────────┤
│  Contacts                                  [Add Contact]    │
│  👑 John Smith (Account Owner) - john@acme.com              │
│     Jane Doe (Billing) - jane@acme.com                      │
├─────────────────────────────────────────────────────────────┤
│  Account Details                                            │
│  Tier: PRO    Store Type: RETAIL_AND_ONLINE    Pixel: On   │
├─────────────────────────────────────────────────────────────┤
│  Feeds                                     [Trigger Run]    │
│  Primary Feed - HEALTHY - Last success: 2 hours ago         │
│  Backup Feed - INACTIVE - Disabled                          │
└─────────────────────────────────────────────────────────────┘
```

### Subscription Section

Located on dealer detail page, admins can:

1. **View Current Status**
   - Subscription status badge (Active/Expired/Suspended/Cancelled)
   - Plan tier (STANDARD/PRO/FOUNDING)
   - Expiration date with days remaining or days overdue
   - Grace period duration

2. **Edit Subscription**
   - Change status (dropdown)
   - Set expiration date (date picker)
   - Adjust grace period (0-90 days)

3. **Quick Actions**
   - "Extend 1 Year" - Sets status to ACTIVE and adds 1 year from today
   - Useful for quick renewal after PO payment received

### Managing Dealer Access

**To Suspend a Dealer:**
1. Navigate to dealer detail page
2. Click "Edit" in Subscription section
3. Change status to "Suspended"
4. Save changes
5. Dealer immediately loses portal access and feed processing stops

**To Reactivate a Dealer:**
1. Navigate to dealer detail page
2. Click "Edit" in Subscription section
3. Change status to "Active"
4. Set appropriate expiration date
5. Save changes
6. Dealer regains immediate access

**To Handle Payment Disputes:**
1. Set status to "Suspended" (preserves data, blocks access)
2. Contact dealer to resolve dispute
3. Once resolved, reactivate with new expiration date

### Feed Management for Blocked Dealers

Even when a dealer is blocked, admins can:

1. **View Feed Status** - See last run results, error logs
2. **Trigger Manual Runs** - Process feed despite subscription block
3. **Edit Feed Configuration** - Fix issues while dealer is blocked
4. **Impersonate Dealer** - Access portal as dealer to diagnose issues

### Audit Logging

All subscription and access changes are logged:

| Action Type | Logged Data |
|-------------|-------------|
| `UPDATE_SUBSCRIPTION` | Status, expiration, grace days (old → new) |
| `IMPERSONATE_DEALER` | Admin email, dealer ID, timestamp |
| `TRIGGER_MANUAL_FEED_RUN` | Feed ID, admin override flag |
| `SUSPEND_DEALER` | Reason, admin email |
| `REACTIVATE_DEALER` | New expiration date |

Audit logs include:
- Admin who made the change
- Timestamp
- Old values
- New values
- IP address (future)

---

## Feed Processing Behavior

The harvester checks subscription status before processing dealer feeds. This ensures we don't waste resources processing feeds for dealers who cannot access their data.

### Feed Processing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Feed Job Received                         │
│              (Scheduled or Manual Trigger)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │  Load Dealer     │
                   │  from Database   │
                   └──────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │ Check Subscription│
                   │     Status        │
                   └──────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │  ACTIVE  │       │ EXPIRED  │       │SUSPENDED/│
    │          │       │(in grace)│       │CANCELLED │
    └──────────┘       └──────────┘       └──────────┘
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │ Process  │       │ Process  │       │   Skip   │
    │  Feed    │       │  Feed    │       │ (SKIPPED)│
    └──────────┘       └──────────┘       └──────────┘
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │ Update   │       │ Update   │       │ Log Skip │
    │ SKUs &   │       │ SKUs &   │       │ Reason   │
    │ Prices   │       │ Prices   │       │          │
    └──────────┘       └──────────┘       └──────────┘
```

### Feed Run Statuses

| Status | Description | When Used |
|--------|-------------|-----------|
| **PENDING** | Queued for processing | Job created, waiting for worker |
| **RUNNING** | Currently being processed | Worker picked up job |
| **SUCCESS** | Completed successfully | All rows processed without fatal errors |
| **FAILED** | Processing error | Network failure, parse error, etc. |
| **SKIPPED** | Skipped due to subscription | Dealer blocked (past grace or suspended/cancelled) |

### Feed Status (DealerFeed.status)

The feed itself has a status that reflects its overall health:

| Status | Description | Triggers |
|--------|-------------|----------|
| **PENDING** | Feed created, not yet run | Initial state |
| **HEALTHY** | Feed is working normally | Last run succeeded |
| **WARNING** | Feed has issues but partially working | Some rows quarantined/rejected |
| **FAILED** | Feed is not working | Last run failed completely |

> **Note**: When subscription is blocked, the feed's `enabled` field is set to `false` rather than changing status.

### Subscription Impact on Feed Status

| Subscription Status | Feed Status | Feed Runs | SKU Visibility |
|---------------------|-------------|-----------|----------------|
| ACTIVE | Reflects actual health | Process normally | Visible on IronScout |
| EXPIRED (in grace) | Reflects actual health | Process normally | Visible on IronScout |
| EXPIRED (past grace) | Feed disabled | SKIPPED | Hidden from IronScout |
| SUSPENDED | Feed disabled | SKIPPED | Hidden from IronScout |
| CANCELLED | Feed disabled | SKIPPED | Hidden from IronScout |

### Dealer SKU Visibility

When a dealer's subscription is blocked:

1. **Feed processing stops** - No new SKU data is ingested
2. **Existing SKUs become stale** - Prices not updated
3. **SKUs hidden from search** - Not shown on IronScout.ai consumer site
4. **Data preserved** - All SKUs and configurations retained for when dealer renews

### Manual Feed Triggers

Admins can trigger manual feed runs from the admin portal, even for blocked dealers:

```typescript
// Admin action: triggerManualFeedRun(dealerId, feedId)
// - Creates PENDING feed run record
// - Sets feed.lastRunAt = null to trigger scheduler
// - Logged with admin override flag
```

**Use cases for manual triggers:**
- Testing feed configuration for a new dealer
- Business decision to maintain data for strategic dealer
- Debugging feed issues during support

### Feed Processing Check (Harvester)

The harvester uses `checkDealerSubscription()` from `apps/harvester/src/dealer/subscription.ts`:

```typescript
interface SubscriptionInfo {
  isActive: boolean;           // Can process feeds?
  status: SubscriptionStatus;  // Current status
  expiresAt: Date | null;      // Expiration date
  isInGracePeriod: boolean;    // Within grace period?
  daysOverdue: number | null;  // Days past expiration
  shouldNotify: boolean;       // Send expiry notification?
  reason: string;              // Human-readable explanation
}
```

### Feed Scheduler Behavior

The scheduler runs periodically and:

1. Finds all enabled feeds with `lastRunAt` older than refresh interval
2. For each feed, checks dealer subscription status
3. Creates job only if subscription allows processing
4. Logs skip reason if subscription blocks processing

---

## Database Schema

### Dealer Model (subscription fields)

```prisma
model Dealer {
  // ... other fields

  // Subscription tracking
  subscriptionStatus     SubscriptionStatus @default(ACTIVE)
  subscriptionExpiresAt  DateTime?
  subscriptionGraceDays  Int                @default(7)

  // Payment tracking
  paymentMethod          PaymentMethod?     // STRIPE or PURCHASE_ORDER
  stripeCustomerId       String?
  stripeSubscriptionId   String?
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  SUSPENDED
  CANCELLED
}

enum PaymentMethod {
  STRIPE
  PURCHASE_ORDER
}
```

---

## Status Pages

When a dealer is blocked from portal access, they see one of these pages:

### `/subscription-expired`

- Shows expiration details
- "Renew Now" CTA linking to settings/billing
- "Contact Sales" option
- Support email link

### `/subscription-suspended`

- Explains account is suspended
- Lists common reasons (payment issues, ToS)
- Contact support CTA
- No self-service renewal option

### `/subscription-cancelled`

- Confirms cancellation
- Lists features they're missing
- "Resubscribe" CTA
- Data retention notice (configs preserved)

---

## Implementation Files

| File | Purpose |
|------|---------|
| `apps/dealer/lib/subscription.ts` | Core subscription check utility |
| `apps/dealer/app/(dashboard)/layout.tsx` | Dashboard access control |
| `apps/dealer/components/subscription-banner.tsx` | Warning/error banner |
| `apps/dealer/app/subscription-expired/page.tsx` | Expired status page |
| `apps/dealer/app/subscription-suspended/page.tsx` | Suspended status page |
| `apps/dealer/app/subscription-cancelled/page.tsx` | Cancelled status page |
| `apps/admin/app/dealers/[id]/subscription-section.tsx` | Admin subscription UI |
| `apps/admin/app/dealers/[id]/actions.ts` | `updateSubscription` action |
| `apps/harvester/src/dealer/subscription.ts` | Feed processing checks |

---

## Future Enhancements

1. **Stripe Integration** - Webhook handlers for automatic status updates
2. **Email Notifications** - Automated pre-expiration reminders
3. **Payment Method Tracking** - Display in admin UI for reporting
4. **Subscription Analytics** - Churn rates, renewal rates, MRR tracking
5. **Self-Service Renewal** - Dealer portal billing page with Stripe integration
6. **Dunning Management** - Automated retry logic for failed payments

---

## FAQ

**Q: What happens to dealer data when subscription expires?**
A: All data (feeds, SKUs, configurations) is preserved. When the dealer renews, everything is restored.

**Q: Can admins override subscription blocks?**
A: Yes, admins can:
1. Use impersonation to access the portal as the dealer
2. Trigger manual feed runs from admin portal
3. Extend/modify subscription at any time

**Q: How do I handle a dealer disputing a charge?**
A: Set status to SUSPENDED until resolved. This blocks access but preserves data.

**Q: Can grace period be customized per dealer?**
A: Yes, admins can set 0-90 days grace period per dealer. Enterprise customers may negotiate longer grace periods.

---

## Outstanding Decisions

These items need decisions before full implementation:

### 1. Payment Method Tracking

**Question**: Should we add a `paymentMethod` field to track Stripe vs PO?

**Options**:
- A) Add `paymentMethod` enum field (STRIPE, PURCHASE_ORDER)
- B) Infer from presence of `stripeCustomerId`

**Recommendation**: Option A - explicit field is clearer for reporting

**Decision**: **Option A - Explicit `paymentMethod` enum field**

**Additional Constraint**: Validation must enforce mutual exclusivity:
- If `paymentMethod = STRIPE`: `stripeCustomerId` required, `stripeSubscriptionId` required
- If `paymentMethod = PURCHASE_ORDER`: `stripeCustomerId` must be null, `stripeSubscriptionId` must be null
- Cannot have Stripe IDs with PO payment method or vice versa

---

### 2. Stripe Webhook Events

**Question**: What Stripe events should trigger subscription status changes?

**Proposed mapping**:
| Stripe Event | IronScout Action |
|--------------|------------------|
| `invoice.paid` | Set status to ACTIVE, update expiresAt |
| `invoice.payment_failed` | Set status to EXPIRED, start grace period |
| `customer.subscription.deleted` | Set status to CANCELLED |
| `customer.subscription.paused` | Set status to SUSPENDED |

**Decision**: **Approved as proposed**

---

### 3. Tier Pricing

**Question**: What are the prices for each tier?

| Tier | Monthly | Description |
|------|---------|-------------|
| STANDARD | $99/month | Basic market visibility, benchmarks, email support |
| PRO | $299/month | Full features, SKU-level comparisons, API access, phone support |
| FOUNDING | $0 (1 year) | PRO features free for early adopters, then converts to PRO pricing |

**Decision**: **Approved - STANDARD $99/mo, PRO $299/mo, FOUNDING = 1 year free PRO**

**Note**: FOUNDING is not a separate feature tier - it's PRO with a promotional period. Database `tier` enum should be: `STANDARD`, `PRO`, `FOUNDING`

---

### 4. Auto-Renewal Default

**Question**: Should Stripe subscriptions auto-renew by default?

**Options**:
- A) Yes, auto-renew (Stripe default)
- B) No, require explicit renewal

**Impact**: If auto-renew, skip pre-expiration emails (Stripe sends its own)

**Decision**: **Yes, auto-renew by default**

Dealers can disable auto-renew or manually request it not auto-renew. When auto-renew is enabled, Stripe handles renewal reminders. Our pre-expiration emails only sent when:
- `paymentMethod = PURCHASE_ORDER` (always manual)
- `paymentMethod = STRIPE` AND dealer has disabled auto-renew

**Implementation Note**: Need `autoRenew` boolean field on Dealer model (default: true for Stripe)

---

### 5. SKU Visibility Timing

**Question**: When a dealer is blocked, when do their SKUs disappear from IronScout search?

**Options**:
- A) Immediately when blocked
- B) After 24-48 hours (gives time for payment issues)
- C) When SKU data becomes stale (no update for X days)

**Decision**: **Option A - Immediately when blocked**

**Rationale**:
1. **Consistency** - If we block portal access, SKU visibility should match
2. **Grace period IS the buffer** - The 7-day grace period already provides time for payment issues
3. **Consumer trust** - Showing products from dealers who may not honor prices erodes trust
4. **Simplicity** - One subscription check controls both portal access AND SKU visibility
5. **Fairness** - Paying dealers shouldn't compete with non-paying dealers

**Visibility by status**:
- `ACTIVE` → visible
- `EXPIRED` within grace → visible (grace provides buffer)
- `EXPIRED` past grace → hidden
- `SUSPENDED` → hidden immediately
- `CANCELLED` → hidden immediately

---

### 6. Data Retention for Cancelled Dealers

**Question**: How long do we keep data for cancelled/expired dealers?

**Options**:
- A) 90 days, then archive
- B) 1 year, then archive
- C) Indefinite (until storage costs concern)

**Impact**: Affects reactivation ease and storage costs

**Recommendation**: **Option C - Indefinite retention** (initially)

**Rationale**:
1. **Low volume initially** - With few dealers, storage costs are negligible
2. **Reactivation value** - Easy win-back if all configs preserved
3. **No urgent need to delete** - Can implement archival later when needed
4. **Simplicity** - No archival logic to build/maintain now
5. **Legal/audit** - May need historical records for disputes

**Future consideration**: When we exceed ~1000 cancelled dealers or storage becomes a concern, implement:
- Archive to cold storage after 1 year of inactivity
- Send "final notice" email before archiving
- Offer data export before deletion

**Decision**: **Option C - Indefinite retention** (initially)

No archival logic needed for MVP. Revisit when dealer volume or storage costs warrant it.

---

### 7. Reactivation Behavior

**Question**: When a blocked dealer renews, what happens automatically?

**Checklist**:
- [x] SKUs become visible in search again
- [x] Feed processing resumes on next schedule
- [x] Portal access restored immediately
- [x] Notification sent to confirm reactivation

**Decision**: **All items confirmed - automatic restoration**

**Implementation details**:

1. **SKUs visible immediately** - Search query checks `subscriptionStatus` in real-time. When status changes to ACTIVE, SKUs appear in next search.

2. **Feed processing resumes** - Next scheduled run will process (no manual intervention needed). Consider triggering immediate refresh on reactivation.

3. **Portal access immediate** - Dashboard layout checks subscription on each request. Status change = instant access.

4. **Reactivation notification** - Send email to Account Owner + Billing contacts confirming:
   - Subscription reactivated
   - New expiration date
   - Quick link to portal
   - "Thank you for continuing with IronScout"

**Edge case**: If dealer was blocked for >X days, consider:
- Triggering immediate feed refresh (SKU data may be stale)
- Showing "Data refreshing" banner until feed completes
- This can be Phase 2 enhancement

---

### 8. Email Notification Service

**Question**: How should we implement pre-expiration emails?

**Options**:
- A) Scheduled job in harvester (check daily, send via Resend)
- B) Separate notification microservice with BullMQ
- C) External service (Customer.io, SendGrid Marketing)

**Considerations**:
- Volume: Low (maybe 10-50 dealers initially)
- Complexity: Medium
- Future needs: Transactional + marketing emails

**Recommendation**: **Option A - Scheduled job in harvester** (for MVP)

**Rationale**:
1. **Low volume** - With <100 dealers, we don't need microservice overhead
2. **Resend already integrated** - Using it for verification emails
3. **Simple implementation** - Daily cron job checking expiration dates
4. **Fast to build** - Can ship in a day vs weeks for microservice
5. **Easy to migrate** - Can extract to microservice later if needed

**Implementation approach**:
```typescript
// apps/harvester/src/scheduler/subscription-notifications.ts
// Daily job at 9am EST:
// 1. Query dealers where subscriptionExpiresAt is at 60/30/10/5/0 days
// 2. Check if notification already sent (dedupe)
// 3. Get Account Owner + Billing contacts
// 4. Send via Resend with appropriate template
// 5. Log notification sent in DealerNotification table
```

**Future migration path** (Phase 2+):
When we have >500 dealers or need marketing automation:
- Extract to `@ironscout/notifications` package
- Add BullMQ for queuing and retries
- Consider Customer.io for drip campaigns
- Add SMS for urgent notifications

**Decision**: _[PENDING - needs confirmation on MVP approach]_

---

## Decision Log

Track key decisions made about subscription management:

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024-12-14 | FOUNDING tier is 1 year free, not lifetime | Sustainable business model; early adopters get value but must eventually pay |
| 2024-12-14 | Grace period is 7 days | Balance between giving time for payment and limiting unpaid access |
| 2024-12-14 | Grace period allows full access | Dealers can continue operations while resolving payment issues |
| 2024-12-14 | Admin impersonation bypasses subscription checks | Support needs to access blocked accounts for troubleshooting |
| 2024-12-14 | Pre-expiration emails at 60/30/10/5 days | Give adequate notice; increasing urgency as deadline approaches |
| 2024-12-14 | Send notifications to Account Owner + Billing contacts | Ensure right people see renewal reminders |
| 2024-12-14 | Support both Stripe and PO payment methods | Accommodate enterprise customers who require invoicing |
| 2024-12-14 | Use explicit `paymentMethod` enum (STRIPE, PURCHASE_ORDER) | Clearer for reporting; enforce mutual exclusivity with Stripe IDs |
| 2024-12-14 | Stripe webhook mapping approved | invoice.paid→ACTIVE, payment_failed→EXPIRED, deleted→CANCELLED, paused→SUSPENDED |
| 2024-12-14 | Tier pricing: STANDARD $99/mo, PRO $299/mo | Two tiers based on market insight depth; FOUNDING = 1yr free PRO for early adopters |
| 2024-12-14 | Auto-renew enabled by default for Stripe | Reduces involuntary churn; dealers can disable if needed |
| 2024-12-14 | SKU visibility: immediately when blocked | Consistency with access control; grace period is the buffer; consumer trust |
| 2024-12-14 | Reactivation: automatic restoration of all access/features | Simple, immediate UX; no manual steps required; send confirmation email |
| 2024-12-14 | Data retention: indefinite initially | Low volume, easy reactivation, no storage concerns yet; revisit later |

---

*Last updated: December 14, 2024*

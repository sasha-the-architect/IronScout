# IronScout TODO / Feature Backlog

## High Priority

### Dealer Subscription Enforcement
**Status:** Partially Complete (Feed Ingestion Done)
**Target:** TBD

Implement subscription-based access control for dealers:

1. **Portal Access Control** *(Complete)*
   - ✅ Enforce login restrictions based on dealer subscription status
   - ✅ If subscription is inactive/expired, restrict access to dealer portal
   - ✅ Show appropriate messaging for expired subscriptions (renewal prompt, contact support, etc.)
   - ✅ Grace period support with warning banners
   - ✅ Dedicated pages for expired/suspended/cancelled states

2. **Feed Ingestion Automation** *(Complete)*
   - ✅ Skip automatic feed ingestion for dealers with inactive/expired subscriptions
   - ✅ Modify `DealerFeedIngest` worker to check subscription status before processing
   - ✅ Feeds remain configured but not processed until subscription is active
   - ✅ Rate-limited notifications (once per day) for expired subscriptions
   - ✅ Email + Slack notifications to dealer and IronScout staff

3. **Admin Override Capability** *(Complete)*
   - ✅ Admin UI to manually trigger feed update for any dealer
   - ✅ Bypass subscription check when admin initiates manual feed run
   - ✅ Audit log the manual trigger with admin identity
   - ✅ Visual indicator when subscription is expired in admin portal

4. **Stripe Integration for Payment Sync** *(Complete)*
   - ✅ Added Stripe fields to Dealer model (`paymentMethod`, `stripeCustomerId`, `stripeSubscriptionId`, `autoRenew`)
   - ✅ Created `DealerPaymentMethod` enum (STRIPE, PURCHASE_ORDER)
   - ✅ Dealer checkout endpoint creates/retrieves Stripe customer
   - ✅ Dealer customer portal endpoint for billing management
   - ✅ Webhook handlers for all dealer subscription lifecycle events
   - ✅ Status mapping: Stripe status → local SubscriptionStatus
   - ✅ Migration: `20251215_add_dealer_stripe_fields.sql`

**Remaining Work:**
- ~~Dealer portal billing UI (checkout flow, plan selection)~~ ✅ Complete
- ~~Admin visibility for payment method and Stripe IDs~~ ✅ Complete
- Stripe reconciliation report (email report comparing Stripe vs local subscription status, detect drift from missed webhooks)

---

### End User Subscription Enforcement
**Status:** Not Started  
**Target:** TBD

Implement subscription-based access control for end users (consumers):

1. **Feature Gating by Tier**
   - Enforce FREE vs PREMIUM feature limits at API level
   - FREE: 3 alerts max, 20 search results, basic AI, daily digest
   - PREMIUM: Unlimited alerts, 100 results, advanced AI, real-time notifications

2. **Expired Premium Handling**
   - Gracefully downgrade expired PREMIUM users to FREE tier
   - Preserve alerts beyond limit but disable excess (re-enable on renewal)
   - Show renewal prompts when accessing premium-only features

3. **Subscription Status Checks**
   - Validate subscription status on login
   - Check Stripe subscription status for active/canceled/past_due
   - Handle payment failures gracefully (grace period before downgrade)

4. **UI/UX for Expired Users**
   - Clear messaging about expired subscription
   - Easy path to renewal
   - Show what features are now restricted

**Implementation Notes:**
- Integrate with existing Stripe subscription handling
- Consider webhook handling for subscription status changes
- Cache subscription status to avoid repeated Stripe API calls
- Add Stripe reconciliation/reporting for consumer subscriptions (detect drift if webhooks missed)

---

## Medium Priority

### Harvester Pipeline Completion
**Status:** In Progress
**Target:** MVP 1.0

The 10-worker pipeline is architected. **MVP focuses on structured feeds only** - web crawling deferred to post-1.0.

**MVP Scope (Structured Feeds Only):**
1. **Dealer Feed Pipeline**
   - Test DealerFeedIngest worker with real dealer feeds (CSV, XML, JSON)
   - Validate DealerSkuMatch matching algorithm
   - Test DealerBenchmark price calculations
   - Verify DealerInsight generation quality

2. **Affiliate Feed Pipeline**
   - Test Impact, AvantLink, ShareASale parsers
   - Configure affiliate feed sources
   - Validate product normalization

3. **Error Handling & Recovery**
   - Retry logic (already implemented - 3 attempts, exponential backoff)
   - Feed status tracking (HEALTHY/WARNING/FAILED)
   - Subscription-aware scheduling

**Post-1.0 (Web Crawling):**
- HTML scraping with site-specific adapters
- JS_RENDERED with Puppeteer
- RSS feed parsing
- Dead letter queue implementation

---

### AI Search Enhancement
**Status:** Not Started
**Target:** TBD

Improve AI-powered search capabilities:

1. **Embedding Coverage**
   - Run embedding backfill for all existing products
   - Monitor embedding generation success rate
   - Implement incremental embedding updates for new products

2. **Ballistic Field Population**
   - Populate bullet type (JHP, FMJ, SP, etc.)
   - Set pressure ratings (STANDARD, PLUS_P, NATO)
   - Detect and flag subsonic rounds
   - Mark suppressor-safe, low-flash, low-recoil products

3. **Premium Ranking Tuning**
   - Refine performance-aware ranking algorithm
   - A/B test Best Value score weights
   - Improve purpose detection accuracy

4. **"What Should I Buy?" Feature**
   - Implement personalized recommendation engine
   - Consider user history, preferences, and stated purpose
   - Premium-only feature with AI explanations

---

### Dealer Portal Features
**Status:** Partially Started
**Target:** TBD

Complete dealer self-service dashboard:

1. **Feed Management UI**
   - Feed configuration wizard
   - Feed health status dashboard
   - Manual feed trigger from dealer portal
   - Feed error diagnostics

2. **Market Insights Dashboard**
   - Price positioning visualization
   - Competitor price comparisons
   - Trend analysis charts

3. **Benchmark Visualization**
   - Price vs market benchmark charts
   - Caliber-by-caliber breakdown
   - Historical benchmark trends

4. **SKU Matching Review**
   - Interface to review/approve SKU matches
   - Manual matching for unmatched SKUs
   - Match confidence indicators

---

### Documentation Readiness
**Status:** Not Started
**Target:** TBD

Audit and finalize documentation for 1.0:
1. Architecture and data model updates aligned to current schema
2. API routes and feature gating reflected in docs (tiers, limits, alerts)
3. Deployment runbooks (health checks, env validation, migrations/indexes)
4. Operations playbooks (harvester queues, alerting, reconciliation tasks)
5. Product docs (dealer/consumer offerings, pricing, subscription flows) up to date

---

### Consumer Web App Improvements
**Status:** Not Started
**Target:** TBD

Enhance end-user experience:

1. **Price History Charts**
   - Interactive price history visualization
   - 30-day for FREE, 365-day for PREMIUM
   - Price trend indicators

2. **Alert Management**
   - Improved alert creation UX
   - Alert history and trigger log
   - Bulk alert management

3. **Search Result UX**
   - Refined result cards with key info
   - Quick filters sidebar
   - Save search functionality

4. **Mobile Responsiveness**
   - Audit and fix mobile layout issues
   - Touch-friendly interactions
   - Mobile-optimized search experience

---

### Admin Portal Enhancements
**Status:** Not Started
**Target:** TBD

Improve administrative capabilities:

1. **Dealer Management Workflows**
   - Dealer approval/rejection flow
   - Bulk dealer actions
   - Dealer communication tools

2. **Feed Health Monitoring**
   - Dashboard showing all feed statuses
   - Alert thresholds for failing feeds
   - Historical feed success rates

3. **Crawl Source Management**
   - UI for adding/editing crawl sources
   - Source health monitoring
   - Crawl schedule management

4. **System Health Metrics**
   - API response time monitoring
   - Database query performance
   - Worker queue depths

---

### Infrastructure & DevOps
**Status:** Not Started
**Target:** TBD

Production hardening and operational improvements:

1. **Deployment Hardening**
   - Health check endpoints
   - Graceful shutdown handling
   - Environment configuration validation

2. **Monitoring & Alerting**
   - Application performance monitoring (APM)
   - Error tracking integration
   - Uptime monitoring

3. **Email Microservice**
   - Centralized email handling service
   - Multi-provider support (Resend, SendGrid, SES)
   - BullMQ queuing with retry logic
   - Delivery tracking and analytics

4. **Rate Limiting & Caching**
   - API rate limiting per tier
   - Redis caching optimization
   - CDN configuration for static assets

5. **Security & Compliance**
   - PII handling/log scrubbing
   - Secrets management and rotation
   - Privacy/Terms pages live and linked
   - Basic vulnerability/risk review (dependencies, headers, CSP)

---

## Low Priority / Nice-to-Have

### Footer Pages (Removed Placeholder Links)
**Status:** Not Started

Create actual pages for footer links that were removed as placeholders:

1. **Legal Pages**
   - `/legal/privacy` - Privacy Policy
   - `/legal/terms` - Terms of Service

2. **Support Pages**
   - `/help` or `/support` - Help Center / FAQ
   - `/contact` - Contact Us form

3. **Business Pages**
   - `/api` - API Access documentation (if offering public API)
   - `/enterprise` - Enterprise tier information

4. **Social Links**
   - Create Twitter/X account and link
   - Create GitHub org/repo and link (if open source)
   - Create LinkedIn company page and link

---

## Completed

### Dealer Feed Subscription Enforcement (December 13, 2025)
- Added subscription fields to Dealer model (subscriptionStatus, subscriptionExpiresAt, subscriptionGraceDays, lastSubscriptionNotifyAt)
- Created subscription check utility with grace period support
- Modified DealerFeedIngest worker to check subscription before processing
- Added SKIPPED status to FeedRunStatus enum
- Created subscription expiry notification (email + Slack) with once-per-day rate limiting
- Added admin override capability for manual feed triggers
- Created FeedsSection component in admin portal with "Run (Override)" button
- FOUNDING tier dealers have lifetime access (no expiration check)

### Dealer Portal Access Control (December 15, 2025)
- Created `apps/dealer/lib/subscription.ts` with full subscription status checking
- Implemented grace period support with configurable days
- Added subscription banner component for warning/error states
- Created dedicated pages: `/subscription-expired`, `/subscription-suspended`, `/subscription-cancelled`
- Dashboard layout checks subscription and redirects blocked users
- Admin impersonation bypasses subscription checks

### Signout Redirect to Main Site (December 15, 2025)
- Updated dealer portal logout (`/api/auth/logout`) to redirect to `https://dealer.ironscout.ai`
- Added GET handler for link-based logout with automatic redirect
- Created admin portal logout route (`/api/auth/logout`) redirecting to `https://admin.ironscout.ai`
- Updated admin portal "Sign Out" link to use logout route

### Dealer Stripe Integration (December 15, 2025)
- Added Stripe payment fields to Dealer model: `paymentMethod`, `stripeCustomerId`, `stripeSubscriptionId`, `autoRenew`
- Created `DealerPaymentMethod` enum: STRIPE (automated billing), PURCHASE_ORDER (manual invoicing)
- Created migration: `packages/db/migrations/20251215_add_dealer_stripe_fields.sql`
- Implemented dealer checkout endpoint: `POST /api/payments/dealer/create-checkout`
- Implemented dealer portal endpoint: `POST /api/payments/dealer/create-portal-session`
- Implemented dealer plans endpoint: `GET /api/payments/dealer/plans`
- Added comprehensive webhook handlers in `apps/api/src/routes/payments.ts`:
  - `checkout.session.completed` - Activates subscription, stores Stripe IDs
  - `invoice.paid` - Updates expiration date on renewal
  - `invoice.payment_failed` - Sets status to EXPIRED
  - `customer.subscription.updated` - Syncs Stripe status changes
  - `customer.subscription.deleted` - Sets status to CANCELLED
  - `customer.subscription.paused` - Sets status to SUSPENDED
  - `customer.subscription.resumed` - Reactivates subscription
- Webhook routing based on metadata (`type: 'dealer'` vs `type: 'consumer'`)

### Dealer Portal Billing UI (December 15, 2025)
- Created `/settings/billing` page in dealer portal for subscription management
- Server component (`page.tsx`) fetches dealer billing data with role-based access
- Client component (`billing-settings.tsx`) displays:
  - Current subscription status with color-coded badges
  - Plan cards (Standard $99/mo, Pro $299/mo) with feature lists
  - Subscription expiration date and auto-renew status
  - Stripe checkout integration for new subscriptions
  - Stripe Customer Portal for managing existing billing
- Server actions (`actions.ts`) for:
  - `createCheckoutSession()` - Creates Stripe Checkout for plan upgrade
  - `createPortalSession()` - Opens Stripe billing portal
- Permission model: Only OWNER/ADMIN roles can manage billing
- Added Billing section to Settings hub with dynamic status display
- Updated docs: `docs/deployment/stripe.md`, `docs/apps/dealer.md`

### Admin Payment Visibility (December 15, 2025)
- Created `payment-section.tsx` component for dealer detail page
- Shows payment method (Stripe/Purchase Order), auto-renew status
- Displays Stripe Customer ID and Subscription ID with direct links to Stripe Dashboard
- Info banners for Purchase Order billing and dealers without payment method
- Added Payment column to dealers list page (`/dealers`)
- Updated admin documentation (`docs/apps/admin.md`)

---

*Last updated: December 16, 2025*

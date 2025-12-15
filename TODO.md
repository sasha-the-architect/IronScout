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

---

## Medium Priority

*(No items currently)*

---

## Low Priority / Nice-to-Have

*(empty)*

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

*Last updated: December 15, 2025*

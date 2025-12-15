# Stripe Payment Setup Guide

## ✅ Current Status

Stripe is configured with test (sandbox) products. Products are created in Stripe Dashboard.

The system supports two types of subscriptions:

- **Consumer subscriptions** - Premium tier for end users
  - Annual: $49.99/year ($4.17/month equivalent, 17% savings) - **recommended**
  - Monthly: $4.99/month
- **Dealer subscriptions** - Standard ($99/month) and Pro ($299/month) tiers

## 🔑 Price IDs

### Sandbox (Test Mode)

```env
# Consumer Plans
STRIPE_PRICE_ID_STANDARD_MONTHLY=price_1SeiY59eNznqMHoSlmP4KqUF      # Free tier placeholder
STRIPE_PRICE_ID_PREMIUM_MONTHLY=price_1SeiaL9eNznqMHoS0GNxnleB       # $4.99/month
STRIPE_PRICE_ID_PREMIUM_ANNUALLY=price_1SeiaL9eNznqMHoSYkwjqK5h      # $49.99/year

# Dealer Plans
STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY=price_1SeibR9eNznqMHoSC4G9fPMK  # $99/month
STRIPE_PRICE_ID_DEALER_PRO_MONTHLY=price_1Seic99eNznqMHoSmDTuAcF5       # $299/month
```

### Production (Live Mode)

Create matching products in Stripe live mode and update with live price IDs:

```env
# Consumer Plans
STRIPE_PRICE_ID_STANDARD_MONTHLY=price_live_...
STRIPE_PRICE_ID_PREMIUM_MONTHLY=price_live_...
STRIPE_PRICE_ID_PREMIUM_ANNUALLY=price_live_...

# Dealer Plans
STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY=price_live_...
STRIPE_PRICE_ID_DEALER_PRO_MONTHLY=price_live_...
```

## 🔄 Staging vs Production Strategy

Stripe requires separate products for test and live modes. Here's how to manage:

| Environment | Stripe Mode | API Keys | Price IDs |
|-------------|-------------|----------|-----------|
| Local dev | Test | `sk_test_...` | Sandbox price IDs |
| Staging/Preview | Test | `sk_test_...` | Sandbox price IDs |
| Production | Live | `sk_live_...` | Live price IDs |

**Key points:**
1. **Never mix test and live keys** - Test keys only work with test products
2. **Same product structure** - Create identical products in live mode with same names
3. **Environment-based config** - Use Render environment groups or separate env files
4. **Webhooks** - Create separate webhook endpoints for test vs live

**Render setup:**
- Create env group `stripe-sandbox` for staging with test keys
- Create env group `stripe-production` for production with live keys
- Each service links to appropriate group based on environment

## 🔧 Setup Steps

### 1. Get Your Stripe Publishable Key

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
2. Copy your **Publishable key** (starts with `pk_test_...`)
3. Update `apps/web/.env.local`:
   ```env
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_YOUR_KEY_HERE"
   ```

### 2. Create Pricing Products in Stripe

You need to create products and prices in Stripe:

#### Consumer Premium Plan (Annual - Recommended)

1. Go to [Stripe Products](https://dashboard.stripe.com/test/products)
2. Click **+ Add product**
3. Fill in:
   - **Name**: IronScout.ai Premium (Annual)
   - **Description**: Premium subscription with personalized AI recommendations, Best Value scoring, price history, unlimited instant alerts, and performance filters
   - **Pricing**: Recurring, $49.99/year
4. Click **Save product**
5. Copy the **Price ID** (starts with `price_...`)
6. Update `apps/api/.env`:
   ```env
   STRIPE_PRICE_ID_PREMIUM_ANNUALLY="price_YOUR_PRICE_ID_HERE"
   ```

#### Consumer Premium Plan (Monthly)

1. Go to [Stripe Products](https://dashboard.stripe.com/test/products)
2. Click **+ Add product** (or add a price to existing product)
3. Fill in:
   - **Name**: IronScout.ai Premium (Monthly)
   - **Description**: Premium subscription - monthly billing
   - **Pricing**: Recurring, $4.99/month
4. Click **Save product**
5. Copy the **Price ID**
6. Update `apps/api/.env`:
   ```env
   STRIPE_PRICE_ID_PREMIUM_MONTHLY="price_YOUR_PRICE_ID_HERE"
   ```

#### Dealer Standard Plan ($99/month)

1. Go to [Stripe Products](https://dashboard.stripe.com/test/products)
2. Click **+ Add product**
3. Fill in:
   - **Name**: IronScout.ai Dealer Standard
   - **Description**: List your products on IronScout.ai with automated feed ingestion and market insights
   - **Pricing**: Recurring, $99/month
4. Click **Save product**
5. Copy the **Price ID** (starts with `price_...`)
6. Update `apps/api/.env`:
   ```env
   STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY="price_YOUR_PRICE_ID_HERE"
   ```

#### Dealer Pro Plan ($299/month)

1. Go to [Stripe Products](https://dashboard.stripe.com/test/products)
2. Click **+ Add product**
3. Fill in:
   - **Name**: IronScout.ai Dealer Pro
   - **Description**: Full-featured dealer platform with competitive pricing intelligence and API access
   - **Pricing**: Recurring, $299/month
4. Click **Save product**
5. Copy the **Price ID** (starts with `price_...`)
6. Update `apps/api/.env`:
   ```env
   STRIPE_PRICE_ID_DEALER_PRO_MONTHLY="price_YOUR_PRICE_ID_HERE"
   ```

### 3. Set Up Webhook for Local Development

For local testing, use Stripe CLI:

#### Install Stripe CLI

```bash
# Windows (Scoop)
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe

# Or download from: https://github.com/stripe/stripe-cli/releases
```

#### Forward Webhooks to Local Server

```bash
# Login to Stripe
stripe login

# Forward webhooks (run this while testing)
stripe listen --forward-to localhost:8000/api/payments/webhook
```

The CLI will output a webhook signing secret like `whsec_...`. Copy it and update `apps/api/.env`:

```env
STRIPE_WEBHOOK_SECRET="whsec_YOUR_SECRET_HERE"
```

### 4. Test the Payment Flow

1. **Start all services**:
   ```bash
   # Terminal 1 - Stripe webhook forwarding
   stripe listen --forward-to localhost:8000/api/payments/webhook

   # Terminal 2 - API server
   cd apps/api && pnpm dev

   # Terminal 3 - Web app
   cd apps/web && pnpm dev
   ```

2. **Test the flow**:
   - Visit http://localhost:3000/pricing
   - Click "Upgrade to Premium"
   - Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any 3-digit CVC
   - Any billing ZIP code

3. **Verify**:
   - Check webhook logs in Stripe CLI terminal
   - Check API logs for subscription creation
   - Visit http://localhost:3000/dashboard/settings
   - You should see "Premium" badge and billing section

### 5. Production Setup (When Ready)

1. **Get Production Keys**:
   - Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
   - Toggle from "Test mode" to "Live mode"
   - Copy **Secret key** and **Publishable key**

2. **Create Production Webhook**:
   - Go to [Webhooks](https://dashboard.stripe.com/webhooks)
   - Click **+ Add endpoint**
   - Endpoint URL: `https://api.ironscout.ai/api/payments/webhook`
   - Events to send:
     - `checkout.session.completed`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `customer.subscription.paused`
     - `customer.subscription.resumed`
   - Copy the webhook signing secret

3. **Update Production Environment Variables**:
   ```env
   # Production .env (API)
   STRIPE_SECRET_KEY="sk_live_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."
   STRIPE_PRICE_ID_PREMIUM="price_..."
   STRIPE_PRICE_ID_DEALER_STANDARD="price_..."
   STRIPE_PRICE_ID_DEALER_PRO="price_..."

   # Production .env.local (web)
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
   ```

## 🧪 Test Cards

Use these cards in test mode:

| Card Number | Description |
|-------------|-------------|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 0002 | Card declined |
| 4000 0000 0000 9995 | Insufficient funds |

## 📋 Webhook Events Handled

The system handles these Stripe webhook events:

### Consumer Events

- `checkout.session.completed` - Creates subscription, upgrades user to Premium
- `invoice.paid` - Confirms payment, updates subscription renewal date
- `invoice.payment_failed` - Handles failed payments
- `customer.subscription.updated` - Updates subscription status and renewal date
- `customer.subscription.deleted` - Cancels subscription, downgrades user to Free

### Dealer Events

- `checkout.session.completed` - Creates dealer subscription, sets status to ACTIVE
- `invoice.paid` - Confirms payment, updates `subscriptionExpiresAt`
- `invoice.payment_failed` - Sets status to EXPIRED, triggers grace period
- `customer.subscription.updated` - Syncs Stripe status to local status (ACTIVE/EXPIRED/SUSPENDED/CANCELLED)
- `customer.subscription.deleted` - Sets status to CANCELLED, clears subscription ID
- `customer.subscription.paused` - Sets status to SUSPENDED
- `customer.subscription.resumed` - Sets status to ACTIVE

The webhook handler routes events based on metadata (`type: 'dealer'` vs `type: 'consumer'`) attached during checkout session creation.

## 🔍 Testing Checklist

### Consumer Flow

- [ ] Publishable key added to web .env.local
- [ ] Premium product created in Stripe Dashboard
- [ ] Price ID added to API .env
- [ ] Stripe CLI installed and logged in
- [ ] Webhook forwarding running locally
- [ ] Webhook secret added to API .env
- [ ] Successfully upgraded to Premium using test card
- [ ] User tier shows "Premium" in settings
- [ ] Billing management opens Stripe Customer Portal
- [ ] Can view subscription details in settings
- [ ] Can cancel subscription via Customer Portal
- [ ] User downgraded to Free after cancellation

### Dealer Flow

- [ ] Dealer Standard product created in Stripe Dashboard
- [ ] Dealer Pro product created in Stripe Dashboard
- [ ] Dealer price IDs added to API .env
- [ ] Dealer checkout creates Stripe customer with dealerId metadata
- [ ] Checkout completed webhook sets dealer status to ACTIVE
- [ ] Invoice paid webhook updates subscriptionExpiresAt
- [ ] Payment failed webhook sets dealer status to EXPIRED
- [ ] Subscription cancelled webhook sets dealer status to CANCELLED
- [ ] Dealer portal billing page shows correct subscription status
- [ ] Dealer can subscribe via billing settings page
- [ ] Dealer can access Stripe Customer Portal for billing management

## 🖥️ Dealer Portal Billing UI

The dealer portal includes a billing settings page at `/settings/billing`:

**Features:**
- Current subscription status display (ACTIVE/EXPIRED/SUSPENDED/CANCELLED)
- Plan tier display (STANDARD/PRO/FOUNDING)
- Next billing date and payment method
- Plan selection cards for Standard ($99/mo) and Pro ($299/mo)
- "Manage Billing" button opens Stripe Customer Portal
- Founding member benefits notice
- Billing FAQ section

**Files:**
- `apps/dealer/app/(dashboard)/settings/billing/page.tsx` - Server component
- `apps/dealer/app/(dashboard)/settings/billing/billing-settings.tsx` - Client component
- `apps/dealer/app/(dashboard)/settings/billing/actions.ts` - Server actions

**Environment Variables (Dealer Portal):**
```env
# Required for billing actions
STRIPE_PRICE_ID_DEALER_STANDARD_MONTHLY=price_...
STRIPE_PRICE_ID_DEALER_PRO_MONTHLY=price_...
NEXT_PUBLIC_DEALER_URL=https://dealer.ironscout.ai
INTERNAL_API_URL=http://localhost:8000  # or production API URL
```

**Permission Model:**
- Only OWNER and ADMIN roles can manage billing
- MEMBER and VIEWER roles see read-only billing status

## 🆘 Troubleshooting

### "No such price" error
- Make sure you created the product in Stripe Dashboard
- Verify the Price ID in `STRIPE_PRICE_ID_PREMIUM` matches

### Webhook not firing
- Check Stripe CLI is running: `stripe listen --forward-to localhost:8000/api/payments/webhook`
- Check API server is running on port 8000
- Check webhook secret matches in .env

### User not upgrading to Premium
- Check API logs for webhook processing
- Check database for subscription record
- Verify webhook handler is working in Stripe CLI output

### Customer Portal doesn't open
- User must have an active subscription first
- Check browser console for errors
- Verify Stripe secret key is set correctly

## 📞 Support

For Stripe-specific issues:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com/)

For IronScout.ai issues:
- Check API logs: `apps/api/` terminal
- Check database: `pnpm db:studio` (from packages/db)
- Check webhook logs: Stripe CLI terminal

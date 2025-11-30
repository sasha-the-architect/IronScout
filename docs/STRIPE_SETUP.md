# Stripe Payment Setup Guide

## ✅ Current Status

Your Stripe test API key has been configured in `apps/api/.env`.

## 🔧 Next Steps to Complete Setup

### 1. Get Your Stripe Publishable Key

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
2. Copy your **Publishable key** (starts with `pk_test_...`)
3. Update `apps/web/.env.local`:
   ```env
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_YOUR_KEY_HERE"
   ```

### 2. Create Pricing Products in Stripe

You need to create products and prices in Stripe:

#### Premium Plan ($9.99/month)

1. Go to [Stripe Products](https://dashboard.stripe.com/test/products)
2. Click **+ Add product**
3. Fill in:
   - **Name**: ZeroedIn Premium
   - **Description**: Premium subscription with unlimited alerts and price tracking
   - **Pricing**: Recurring, $9.99/month
4. Click **Save product**
5. Copy the **Price ID** (starts with `price_...`)
6. Update `apps/api/.env`:
   ```env
   STRIPE_PRICE_ID_PREMIUM="price_YOUR_PRICE_ID_HERE"
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
   - Endpoint URL: `https://your-domain.com/api/payments/webhook`
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy the webhook signing secret

3. **Update Production Environment Variables**:
   ```env
   # Production .env
   STRIPE_SECRET_KEY="sk_live_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."
   STRIPE_PRICE_ID_PREMIUM="price_..."

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

- `checkout.session.completed` - Creates subscription, upgrades user to Premium
- `customer.subscription.updated` - Updates subscription status and renewal date
- `customer.subscription.deleted` - Cancels subscription, downgrades user to Free

## 🔍 Testing Checklist

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

For ZeroedIn issues:
- Check API logs: `apps/api/` terminal
- Check database: `pnpm db:studio` (from packages/db)
- Check webhook logs: Stripe CLI terminal

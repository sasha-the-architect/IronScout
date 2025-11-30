# Stripe Quick Setup Guide

Follow these steps in order:

---

## Step 1: Install Stripe CLI

**Download for Windows:**
https://github.com/stripe/stripe-cli/releases/latest

1. Download `stripe_X.X.X_windows_x86_64.zip`
2. Extract to a folder (e.g., `C:\stripe`)
3. Add that folder to your PATH:
   - Search "Environment Variables" in Windows
   - Edit "Path" variable
   - Add the stripe folder path
   - Restart terminal

**Test installation:**
```bash
stripe --version
```

---

## Step 2: Get Your Stripe Publishable Key

1. Open: https://dashboard.stripe.com/test/apikeys
2. Copy the **Publishable key** (starts with `pk_test_...`)
3. Open `apps/web/.env.local`
4. Replace this line:
   ```
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_YOUR_KEY_HERE"
   ```
   With your actual key

---

## Step 3: Create Premium Product

1. Open: https://dashboard.stripe.com/test/products
2. Click **"+ Add product"**
3. Fill in:
   - **Name**: `ZeroedIn Premium`
   - **Description**: `Premium subscription with unlimited alerts and price tracking`
   - Under **Pricing**:
     - Select **Recurring**
     - Amount: `9.99`
     - Billing period: `Monthly`
4. Click **"Save product"**
5. Copy the **Price ID** (look for `price_xxxxx` on the product page)
6. Open `apps/api/.env`
7. Add this line at the bottom:
   ```
   STRIPE_PRICE_ID_PREMIUM="price_xxxxx"
   ```
   (replace with your actual Price ID)

---

## Step 4: Set Up Webhook Forwarding

Open a **NEW terminal window** and keep it running:

```bash
# Login to Stripe (opens browser)
stripe login

# Start webhook forwarding (keep this running!)
stripe listen --forward-to localhost:8000/api/payments/webhook
```

You'll see output like:
```
> Ready! Your webhook signing secret is whsec_xxxxx
```

Copy that `whsec_xxxxx` value and update `apps/api/.env`:
```
STRIPE_WEBHOOK_SECRET="whsec_xxxxx"
```

**IMPORTANT: Keep this terminal window open while testing!**

---

## Step 5: Test the Payment Flow

Now you have 3 terminal windows running:

**Terminal 1 - Stripe Webhooks:**
```bash
stripe listen --forward-to localhost:8000/api/payments/webhook
```

**Terminal 2 - API Server:**
```bash
cd apps/api
pnpm dev
```

**Terminal 3 - Web App:**
```bash
cd apps/web
pnpm dev
```

### Test the flow:

1. Open browser: http://localhost:3000/pricing
2. Click **"Upgrade to Premium"**
3. Sign in if needed
4. On Stripe checkout page, use test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/25`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)
5. Click **"Subscribe"**

### Verify it worked:

- You should see the success page with confetti 🎉
- Go to http://localhost:3000/dashboard/settings
- You should see **"Premium"** badge with crown icon
- You should see a **"Billing & Subscription"** section

---

## Troubleshooting

### "No such price" error
- Make sure the Price ID in `apps/api/.env` matches what's in Stripe Dashboard
- Restart the API server after changing .env

### Webhook not received
- Make sure `stripe listen` terminal is still running
- Check it says "Ready! Your webhook signing secret is..."
- Make sure API server is running on port 8000

### Payment succeeds but user not upgraded
- Check the webhook terminal for errors
- Check API terminal logs
- Make sure STRIPE_WEBHOOK_SECRET is set correctly in apps/api/.env

---

## Environment Variables Checklist

After completing setup, you should have:

**`apps/api/.env`:**
```env
STRIPE_SECRET_KEY="sk_test_51D1E2o..." ✓ (already set)
STRIPE_WEBHOOK_SECRET="whsec_xxxxx"     ← Add this
STRIPE_PRICE_ID_PREMIUM="price_xxxxx"   ← Add this
```

**`apps/web/.env.local`:**
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxxxx" ← Add this
```

---

## Next Steps After Testing

Once everything works locally, you can:

1. Test canceling subscription via Customer Portal
2. Test with different test cards (see Stripe docs)
3. Deploy to production (get live keys from Stripe)
4. Set up production webhook endpoint

Need help? Check `docs/STRIPE_SETUP.md` for detailed info!

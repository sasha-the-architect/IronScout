# Email Notifications Setup Guide

This guide explains how the email notification system works and how to test it.

## Overview

IronScout.ai uses [Resend](https://resend.com) to send email notifications when price alerts are triggered. The system is fully integrated with the harvester pipeline.

## Architecture

```
Harvester Pipeline → Writer Stage → Alerter Stage → Resend API → User Email
```

When the harvester detects price changes:
1. **Writer** stage updates product prices in the database
2. **Writer** enqueues alert evaluation jobs for affected products
3. **Alerter** worker evaluates all active alerts for the product
4. For triggered alerts, **Alerter** sends beautiful HTML emails via Resend
5. Users receive instant notifications

## Email Templates

### Price Drop Alert
- **Trigger**: Product price drops below user's target price
- **Features**:
  - Product image
  - Current price vs target price
  - Savings amount
  - Direct "Buy Now" button to retailer
  - Link to product details
  - Gradient purple header

### Back in Stock Alert
- **Trigger**: Out-of-stock product becomes available
- **Features**:
  - Product image
  - Current price
  - Availability notice
  - Direct "Shop Now" button
  - Link to product details
  - Gradient pink header

## Configuration

### Environment Variables

**API (apps/api/.env):**
```env
RESEND_API_KEY="re_6hZmLKHD_B9EGENv5LGXa6YxxKF8atQEG"
FROM_EMAIL="alerts@ironscout.ai"
```

**Harvester (apps/harvester/.env):**
```env
RESEND_API_KEY="re_6hZmLKHD_B9EGENv5LGXa6YxxKF8atQEG"
FROM_EMAIL="alerts@ironscout.ai"
FRONTEND_URL="http://localhost:3000"
```

### Important Notes

1. **Domain Verification**: For production, you need to verify your domain in Resend
2. **Testing**: During development, Resend allows sending to the email address used to sign up
3. **From Email**: Must match a verified domain in production

## Testing the Email System

### Prerequisites

1. Have an account with Resend (already set up)
2. Database with products and prices
3. User account (sign in with Google)
4. Active alert configured

### Step-by-Step Test

#### 1. Create a Test Alert

```bash
# Start the web app
cd apps/web
pnpm dev
```

1. Sign in at http://localhost:3000
2. Search for a product
3. Click "Create Alert" on any product
4. Set alert type to "PRICE_DROP"
5. Set target price **above** current price (e.g., if current is $100, set target to $150)
6. Create the alert

#### 2. Seed Test Data (if needed)

```bash
# From project root
cd packages/db
pnpm db:seed        # Seed products and retailers
pnpm db:seed-source # Seed a test crawl source
```

#### 3. Run the Harvester

```bash
# Terminal 1: Start workers
cd apps/harvester
pnpm worker

# Terminal 2: Trigger a crawl
cd apps/harvester
pnpm dev run
```

#### 4. Manually Test Email Sending

You can also create a quick test script:

**apps/harvester/test-email.ts:**
```typescript
import { Resend } from 'resend'
import dotenv from 'dotenv'

dotenv.config()

const resend = new Resend(process.env.RESEND_API_KEY)

async function sendTestEmail() {
  try {
    const result = await resend.emails.send({
      from: 'IronScout.ai Alerts <alerts@ironscout.ai>',
      to: ['your-test-email@example.com'], // Replace with your email
      subject: 'Test Email from IronScout.ai',
      html: '<h1>Hello!</h1><p>This is a test email from IronScout.ai.</p>'
    })
    console.log('Email sent:', result)
  } catch (error) {
    console.error('Failed to send email:', error)
  }
}

sendTestEmail()
```

Run it:
```bash
cd apps/harvester
npx tsx test-email.ts
```

### Expected Results

1. Check harvester logs for:
   ```
   [Alerter] NOTIFICATION:
   [Alerter] Price drop email sent to user@example.com
   ```

2. Check your inbox for the email
3. Email should be beautifully formatted with:
   - Product name and image
   - Current vs target price
   - Savings amount
   - Buy Now button
   - Links to product and settings

### Monitoring Logs

**Execution Logs** (visible in admin console):
- `ALERT_EVALUATE` - Starting alert evaluation
- `ALERT_NOTIFY` - Alert triggered, email sent
- `ALERT_EVALUATE_OK` - Evaluation complete

**Check in Admin Console:**
http://localhost:3000/admin → Executions → Logs

## Troubleshooting

### Email Not Sending

1. **Check Resend API Key**:
   ```bash
   echo $RESEND_API_KEY
   ```

2. **Check Harvester Logs**:
   - Look for "Failed to send email" errors
   - Check if alert was triggered at all

3. **Verify Alert Configuration**:
   - Is alert active?
   - Is target price set correctly?
   - Does price actually meet trigger conditions?

4. **Test Direct Email**:
   ```bash
   cd apps/harvester
   npx tsx test-email.ts
   ```

### Email Goes to Spam

- Add SPF/DKIM records in Resend dashboard
- Verify domain ownership
- Test with different email providers

### Domain Verification (Production)

1. Go to [Resend Dashboard](https://resend.com/domains)
2. Add your domain (e.g., zeroedin.com)
3. Add DNS records:
   - TXT record for verification
   - TXT record for SPF
   - CNAME records for DKIM
4. Wait for verification
5. Update `FROM_EMAIL` to use verified domain

## Email Deliverability Best Practices

1. **Use verified domain** - Required for production
2. **Monitor bounce rates** - Check Resend analytics
3. **Implement unsubscribe** - Add to settings page
4. **Rate limiting** - Don't spam users with too many alerts
5. **User preferences** - Respect email notification settings

## API Endpoints

The email service is embedded in the harvester. There's no separate API endpoint for sending emails - it's triggered automatically by the alerter worker.

## Future Enhancements

- [ ] Add weekly digest emails
- [ ] Add email open/click tracking
- [ ] Add rich product previews
- [ ] Support multiple alert types in one email
- [ ] Add price history charts in emails
- [ ] Implement email templates with React Email

## Support

For issues with:
- **Resend**: Check [Resend Docs](https://resend.com/docs)
- **Email Templates**: Located in `apps/harvester/src/alerter/index.ts`
- **Alert Logic**: Check harvester alerter worker

## Production Checklist

Before going live:
- [ ] Verify domain in Resend
- [ ] Update FROM_EMAIL to use verified domain
- [ ] Test email deliverability
- [ ] Set up monitoring for email failures
- [ ] Implement unsubscribe functionality
- [ ] Add email preference center
- [ ] Set up email analytics tracking
- [ ] Test with multiple email providers
- [ ] Configure SPF, DKIM, DMARC records
- [ ] Set reasonable rate limits

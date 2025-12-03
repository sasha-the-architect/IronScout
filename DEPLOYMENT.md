# IronScout.ai Deployment Guide

This guide covers deploying IronScout.ai to Render.com using Infrastructure as Code.

## Architecture Overview

IronScout.ai is deployed as a microservices architecture on Render.com:

```
┌─────────────────────────────────────────────────────────────┐
│                      Render.com Cloud                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Web Frontend│    │  API Backend │    │   Harvester  │  │
│  │  (Next.js)   │◄───┤  (Express)   │    │   (Worker)   │  │
│  │  Port: 3000  │    │  Port: 8000  │    │              │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │           │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           PostgreSQL Database (ironscout)            │  │
│  │                   Port: 5432                          │  │
│  └──────────────────────────────────────────────────────┘  │
│         ▲                                     ▲              │
│         │                                     │              │
│         │           ┌──────────────┐          │              │
│         └───────────┤    Redis     │──────────┘              │
│                     │  (BullMQ)    │                         │
│                     │  Port: 6379  │                         │
│                     └──────────────┘                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Services

### 1. **PostgreSQL Database** (`ironscout-db`)
- Managed PostgreSQL instance
- Stores products, prices, users, alerts, and execution logs
- Plan: Free (can upgrade to Starter/Standard)

### 2. **Redis** (`ironscout-redis`)
- Managed Redis instance
- Used for BullMQ job queues in the harvester pipeline
- Plan: Free (can upgrade to Starter)

### 3. **API Service** (`ironscout-api`)
- Express.js REST API backend
- Handles all business logic, authentication, and data access
- Health check: `/health`
- Plan: Free (can upgrade to Starter/Standard)

### 4. **Web Frontend** (`ironscout-web`)
- Next.js 15 application with App Router
- Server-side rendering and static generation
- Health check: `/`
- Plan: Free (can upgrade to Starter/Standard)

### 5. **Harvester Worker** (`ironscout-harvester`)
- Background worker running BullMQ job processors
- 6-stage pipeline: Scheduler → Fetcher → Extractor → Normalizer → Writer → Alerter
- No health check (worker service)
- Plan: Free (can upgrade to Starter)

## Prerequisites

1. **Render.com Account**
   - Sign up at https://render.com
   - Connect your GitHub repository

2. **External API Keys** (obtain before deployment)
   - Stripe API keys (https://stripe.com)
   - SendGrid API key (https://sendgrid.com)
   - Anthropic API key (https://anthropic.com) - for AI extraction
   - Google OAuth credentials (https://console.cloud.google.com)

3. **Repository Setup**
   - Push all code to GitHub
   - Ensure `render.yaml` is in the repository root

## Deployment Steps

### Step 1: Initial Setup

1. **Fork or clone the repository** to your GitHub account

2. **Log in to Render.com**
   - Go to https://dashboard.render.com
   - Connect your GitHub account if not already connected

### Step 2: Deploy from Blueprint

1. **Create New Blueprint**
   - Click "New +" → "Blueprint"
   - Select your GitHub repository
   - Render will automatically detect `render.yaml`

2. **Review Services**
   - Render will show all services defined in `render.yaml`
   - Review the configuration

3. **Set Environment Variables**

   Before deploying, you need to set these secrets in the Render dashboard:

   **For API Service (`ironscout-api`):**
   ```
   STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
   STRIPE_WEBHOOK_SECRET=whsec_...
   SENDGRID_API_KEY=SG....
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   ```

   **For Web Service (`ironscout-web`):**
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
   ```

   **For Harvester Worker (`ironscout-harvester`):**
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   SENDGRID_API_KEY=SG....
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   ```

4. **Deploy**
   - Click "Apply"
   - Render will provision all services in parallel

### Step 3: Database Setup

After deployment, you need to run database migrations:

1. **Connect to the API service shell**
   ```bash
   # In Render dashboard, go to ironscout-api service
   # Click "Shell" tab
   ```

2. **Run migrations**
   ```bash
   cd packages/db
   pnpm prisma migrate deploy
   ```

3. **Seed initial data (optional)**
   ```bash
   pnpm db:seed
   ```

### Step 4: Stripe Webhook Configuration

1. **Get your API URL**
   - From Render dashboard, copy the ironscout-api URL
   - Format: `https://ironscout-api.onrender.com`

2. **Configure Stripe webhook**
   - Go to https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - URL: `https://ironscout-api.onrender.com/api/payments/webhook`
   - Select events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy the webhook signing secret
   - Update `STRIPE_WEBHOOK_SECRET` in Render dashboard

### Step 5: OAuth Configuration

1. **Configure Google OAuth redirect URIs**
   - Go to https://console.cloud.google.com
   - Navigate to your OAuth 2.0 Client
   - Add authorized redirect URIs:
     - `https://your-app.onrender.com/api/auth/callback/google`
     - `https://ironscout-web.onrender.com/api/auth/callback/google`

### Step 6: Verify Deployment

1. **Check Service Status**
   - All services should show "Live" status in Render dashboard

2. **Test API Health**
   ```bash
   curl https://ironscout-api.onrender.com/health
   ```
   Should return:
   ```json
   {"status":"ok","timestamp":"2025-12-03T..."}
   ```

3. **Test Web Frontend**
   - Visit `https://ironscout-web.onrender.com`
   - Should load the homepage

4. **Test Harvester**
   - Check logs in Render dashboard for `ironscout-harvester`
   - Should see: "All 6 workers started successfully"

## Auto-Deploy Configuration

Render automatically deploys when you push to your connected Git branch:

1. **Configure Auto-Deploy**
   - In each service settings, go to "Settings" → "Build & Deploy"
   - Set "Auto-Deploy" to "Yes"
   - Choose branch (e.g., `main` or `production`)

2. **Push to Deploy**
   ```bash
   git push origin main
   ```
   - Render will automatically detect changes
   - Services will rebuild and redeploy

## Environment-Specific Deployments

### Development Environment

Use the free tier with test API keys:
```yaml
plan: free
```

### Production Environment

Upgrade plans and use production API keys:
```yaml
plan: starter  # or standard
```

You can create separate blueprints for different environments:
- `render.dev.yaml` - Development
- `render.staging.yaml` - Staging
- `render.yaml` - Production

## Monitoring

### Logs

Access logs for each service:
1. Go to service in Render dashboard
2. Click "Logs" tab
3. View real-time logs

### Metrics

Render provides built-in metrics:
- CPU usage
- Memory usage
- Response times
- Error rates

### Alerts

Set up alerts in Render dashboard:
1. Go to service
2. Click "Settings" → "Alerts"
3. Configure email/Slack notifications for:
   - Service crashes
   - High error rates
   - Resource limits

## Database Management

### Backups

Render automatically backs up PostgreSQL databases:
- Free plan: Daily backups, 7-day retention
- Paid plans: More frequent backups, longer retention

### Manual Backup

```bash
# From API service shell
pg_dump $DATABASE_URL > backup.sql
```

### Restore

```bash
# From API service shell
psql $DATABASE_URL < backup.sql
```

### Migrations

Always use Prisma migrations:

```bash
# Create new migration
cd packages/db
pnpm prisma migrate dev --name describe_change

# Apply to production
pnpm prisma migrate deploy
```

## Scaling

### Vertical Scaling (Upgrade Instance Size)

1. Go to service in Render dashboard
2. Click "Settings"
3. Change "Instance Type"
4. Available plans:
   - Free: 512 MB RAM, 0.1 CPU
   - Starter: 512 MB RAM, 0.5 CPU
   - Standard: 2 GB RAM, 1 CPU
   - Pro: 4 GB RAM, 2 CPU

### Horizontal Scaling (Multiple Instances)

For paid plans, you can run multiple instances:

```yaml
services:
  - type: web
    name: ironscout-api
    numInstances: 2  # Run 2 instances
```

**Note:** Only API and Web services can scale horizontally. Workers are typically single-instance.

## Cost Estimation

### Free Tier (Development)
- PostgreSQL: Free (1 GB storage, 1 GB transfer)
- Redis: Free (25 MB storage)
- API: Free (750 hours/month)
- Web: Free (750 hours/month)
- Harvester: Free (750 hours/month)
- **Total: $0/month**

### Starter Tier (Small Production)
- PostgreSQL: $7/month
- Redis: $10/month
- API: $7/month (0.5 CPU, 512 MB)
- Web: $7/month (0.5 CPU, 512 MB)
- Harvester: $7/month (0.5 CPU, 512 MB)
- **Total: ~$38/month**

### Standard Tier (Medium Production)
- PostgreSQL: $20/month
- Redis: $10/month
- API: $25/month (1 CPU, 2 GB)
- Web: $25/month (1 CPU, 2 GB)
- Harvester: $25/month (1 CPU, 2 GB)
- **Total: ~$105/month**

## Troubleshooting

### Build Failures

**Problem:** Build fails with "pnpm: command not found"

**Solution:** Render uses Node 20 which includes pnpm. Ensure `runtime: node` is set in render.yaml.

---

**Problem:** Build fails with "Cannot find module '@ironscout/db'"

**Solution:** Ensure build command includes `pnpm --filter @ironscout/db db:generate`

---

### Runtime Errors

**Problem:** API returns 500 errors

**Solution:**
1. Check logs: API service → Logs tab
2. Verify DATABASE_URL is set
3. Run migrations: `pnpm prisma migrate deploy`

---

**Problem:** Harvester not processing jobs

**Solution:**
1. Check Redis connection: Verify REDIS_HOST and REDIS_PORT
2. Check logs for errors
3. Verify Redis instance is running

---

**Problem:** NextAuth authentication fails

**Solution:**
1. Verify NEXTAUTH_URL matches your web service URL
2. Check NEXTAUTH_SECRET is set
3. Verify OAuth redirect URIs are correct

---

### Performance Issues

**Problem:** Web app slow to load

**Solution:**
1. Enable caching in Next.js
2. Upgrade to Starter plan (more CPU)
3. Use CDN for static assets

---

**Problem:** Database queries slow

**Solution:**
1. Add database indexes
2. Optimize queries in API code
3. Upgrade database plan
4. Enable connection pooling

## Support

- **Render Documentation:** https://render.com/docs
- **Render Community:** https://community.render.com
- **Project Issues:** https://github.com/your-org/ironscout/issues

## Security Best Practices

1. **Environment Variables**
   - Never commit secrets to Git
   - Use Render's secret management
   - Rotate API keys regularly

2. **Database**
   - Enable SSL connections (default on Render)
   - Use IP allowlist for sensitive data
   - Regular backups

3. **API Security**
   - Enable rate limiting
   - Use CORS properly
   - Keep dependencies updated

4. **Monitoring**
   - Set up error tracking (e.g., Sentry)
   - Monitor logs for suspicious activity
   - Configure alerts for anomalies

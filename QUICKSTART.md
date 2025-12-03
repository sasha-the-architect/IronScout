# IronScout.ai - Quick Start Guide

Get the complete system running in 5 minutes!

## Prerequisites Check

- ✅ Node.js 20+ installed
- ✅ PostgreSQL running (10.10.9.28:5432)
- ❓ Redis installed and running

## Step 1: Install Redis (if not installed)

### WSL/Ubuntu:
```bash
sudo apt update
sudo apt install redis-server
sudo service redis-server start

# Verify
redis-cli ping
# Should return: PONG
```

### Windows (using Docker):
```bash
docker run -d -p 6379:6379 --name redis redis:latest

# Verify
docker exec redis redis-cli ping
```

## Step 2: One-Command Setup

From the project root, run:

```bash
# Install all dependencies
pnpm install

# Generate Prisma client
cd packages/db
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed products (optional but recommended)
pnpm db:seed

# Seed test crawl source
pnpm db:seed-source
```

## Step 3: Start All Services

Open **3 separate terminals**:

### Terminal 1 - Harvester Workers
```bash
cd apps/harvester
pnpm worker
```
✅ You should see: "Starting IronScout.ai Harvester Workers..."

### Terminal 2 - API Server
```bash
cd apps/api
pnpm dev
```
✅ You should see: "🚀 API server running on port 8000"

### Terminal 3 - Web Frontend
```bash
cd apps/web
pnpm dev
```
✅ You should see: "Ready on http://localhost:3000"

## Step 4: Test the System

### 1. Access Admin Console
Open browser: http://localhost:3000/admin

Sign in with Google (or your configured auth)

### 2. Check the Dashboard
You should see:
- **Active Sources**: 1
- **Total Executions**: 0
- **Success Rate**: 0%
- **Items Harvested**: 0

### 3. View Your Test Source
Click **Sources** in the navigation

You should see:
- Name: "Fake Store API (Test)"
- URL: https://fakestoreapi.com/products
- Type: JSON
- Status: Enabled ✅

### 4. Trigger Your First Crawl
Click the **"Run Now"** button on the test source

Watch the magic happen! 🎉

### 5. Monitor Execution
Click **Executions** in navigation

You'll see your crawl with status progressing:
- PENDING → RUNNING → SUCCESS

Click **"View Logs"** to see detailed pipeline logs

### 6. View Results
Go to **Logs** page and you should see events:
- ✅ CRAWL_START
- ✅ FETCH_OK
- ✅ EXTRACT_OK
- ✅ NORMALIZE_OK
- ✅ WRITE_OK
- ✅ EXEC_DONE

Check your items harvested count on Dashboard - it should increase!

## Troubleshooting

### Redis Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
**Fix**: Start Redis
```bash
sudo service redis-server start  # WSL/Linux
# or
docker start redis  # Docker
```

### Prisma Client Error
```
Error: @prisma/client did not initialize yet
```
**Fix**: Generate Prisma client
```bash
cd packages/db
pnpm db:generate
```

### Workers Not Processing Jobs
**Check**:
1. Redis is running: `redis-cli ping`
2. Workers terminal shows "Active Workers" message
3. Check worker terminal for errors

### No Items Extracted
**Check execution logs** for:
- FETCH_FAIL - URL not accessible
- EXTRACT_FAIL - Could not parse content
- Check the source URL is valid

## What Just Happened?

When you clicked "Run Now":

1. **Scheduler** created a crawl job in Redis queue
2. **Fetcher** downloaded JSON from Fake Store API
3. **Extractor** parsed the JSON product data
4. **Normalizer** standardized prices, categories, brands
5. **Writer** upserted products, retailers, and prices to PostgreSQL
6. **Alerter** checked for price changes (no alerts yet)

All logged to database for monitoring!

## Next Steps

### Add More Sources
In Admin → Sources, click "Add Source":

**Good Test Sources**:
- Fake Store: https://fakestoreapi.com/products (JSON)
- DummyJSON: https://dummyjson.com/products (JSON)
- Any RSS feed (easiest to parse)

### View Products
Go to main site: http://localhost:3000
Search for products - you'll see harvested items!

### Set Up Scheduled Crawls
```bash
cd apps/harvester
pnpm dev schedule
```
This will crawl all enabled sources every hour automatically.

### Monitor Performance
- Check Dashboard stats
- Review execution times
- Filter logs by ERROR level to find issues
- Use Prisma Studio to inspect data:
  ```bash
  cd packages/db
  pnpm db:studio
  ```

## Architecture At-A-Glance

```
User → Admin UI → API → Triggers Job → Redis Queue
                  ↓
        Harvester Workers Process Job
                  ↓
        Scheduler → Fetcher → Extractor → Normalizer → Writer → Alerter
                                                          ↓
                                                    PostgreSQL
```

## Success Indicators

✅ Dashboard shows live stats
✅ Sources page lists test source
✅ Manual crawl creates execution
✅ Execution reaches SUCCESS status
✅ Logs show all pipeline events
✅ Items count increases
✅ Products appear in main search

---

**🎉 Congratulations! Your intelligent price harvesting platform is live!**

For detailed information, see [SETUP.md](./SETUP.md)

---

## Deploy to Production

Ready to deploy to the cloud? We've got you covered!

### Render.com Deployment (Recommended)

We provide complete Infrastructure as Code configuration for Render.com:

1. **Read the deployment guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
2. **Use the checklist**: [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
3. **Review environment variables**: [.env.render.example](./.env.render.example)

### Quick Deploy Steps

```bash
# 1. Push code to GitHub
git push origin main

# 2. Go to Render.com dashboard
# https://dashboard.render.com

# 3. Create new Blueprint
# - Select your repository
# - Render auto-detects render.yaml

# 4. Set required secrets in dashboard
# See .env.render.example for required keys

# 5. Deploy!
# All services deploy automatically
```

### What Gets Deployed

- ✅ PostgreSQL database (managed)
- ✅ Redis instance (managed)
- ✅ API backend (Express.js)
- ✅ Web frontend (Next.js)
- ✅ Harvester worker (BullMQ)

### Free Tier Available

Start with **$0/month** on Render's free tier, perfect for development and testing!

For more details, see [DEPLOYMENT.md](./DEPLOYMENT.md)

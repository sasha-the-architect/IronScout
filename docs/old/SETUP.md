# IronScout.ai - Full System Setup Guide

This guide will help you set up and test the complete IronScout.ai system with harvester, admin console, and real crawling.

## Prerequisites

- Node.js 20+
- PostgreSQL (running at 10.10.9.28:5432)
- Redis (needs to be installed)
- pnpm

## Step 1: Install Redis

### On WSL/Ubuntu/Debian:
```bash
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

### Verify Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

### On Windows (native):
Download from: https://github.com/microsoftarchive/redis/releases
Or use Docker:
```bash
docker run -d -p 6379:6379 redis:latest
```

## Step 2: Install Dependencies

From project root:
```bash
pnpm install
```

This will install dependencies for all workspace packages.

## Step 3: Set Up Database

### Generate Prisma Client
```bash
cd packages/db
pnpm db:generate
```

### Run Migrations
```bash
pnpm db:migrate
```

This creates all tables including the new Source, Execution, and ExecutionLog models.

### Seed Initial Data
```bash
# Seed products and retailers
pnpm db:seed

# Seed test crawl source
pnpm db:seed-source
```

## Step 4: Start Services

You'll need **3 terminal windows**:

### Terminal 1: Start Harvester Workers
```bash
cd apps/harvester
pnpm worker
```

This starts all 6 pipeline workers (scheduler, fetcher, extractor, normalizer, writer, alerter).
Keep this running.

### Terminal 2: Start API Server
```bash
cd apps/api
pnpm dev
```

API will run on http://localhost:8000
Keep this running.

### Terminal 3: Start Web Frontend
```bash
cd apps/web
pnpm dev
```

Frontend will run on http://localhost:3000

## Step 5: Test the System

### Access Admin Console
1. Navigate to: http://localhost:3000/admin
2. Sign in with Google OAuth
3. You should see the admin dashboard

### Verify Test Source
1. Go to Sources page
2. You should see "NASA APOD RSS Feed" (test source)
3. Status should be "Enabled"

### Trigger Manual Crawl
1. Click "Run Now" on the test source
2. Go to Executions page
3. You should see a new execution with status "PENDING" → "RUNNING" → "SUCCESS"

### View Logs
1. Click "View Logs" on the execution
2. You should see detailed logs:
   - CRAWL_START
   - FETCH_START
   - FETCH_OK
   - EXTRACT_START
   - EXTRACT_OK
   - NORMALIZE_START
   - WRITE_START
   - EXEC_DONE

### Check Results
1. Go to main site: http://localhost:3000
2. Search for products
3. You should see newly harvested items mixed with seed data

## Troubleshooting

### Redis Connection Errors
```bash
# Check if Redis is running
redis-cli ping

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

### Database Connection Errors
```bash
# Verify DATABASE_URL in packages/db/.env
# Should be: postgresql://admin:M@dison389!@10.10.9.28:5432/ironscout
```

### Harvester Workers Not Processing
1. Check Redis is running
2. Verify workers are started: `cd apps/harvester && pnpm worker`
3. Check worker logs in terminal
4. Verify execution status in admin console

### No Items Extracted
1. Check execution logs in admin console
2. Look for EXTRACT_FAIL or FETCH_FAIL events
3. The test RSS feed might be down - try another source
4. Check extractor patterns match the source HTML structure

## Adding Custom Sources

### Via Admin UI
1. Go to http://localhost:3000/admin/sources
2. Click "Add Source"
3. Fill in:
   - **Name**: Friendly name
   - **URL**: RSS feed or HTML page URL
   - **Type**: RSS, HTML, JSON, or JS_RENDERED
   - **Interval**: Seconds between crawls (3600 = hourly)
4. Click "Create Source"

### Via Prisma Studio
```bash
cd packages/db
pnpm db:studio
```

Navigate to Sources table and add manually.

## Good Test Sources

### RSS Feeds (easiest to parse):
- NASA APOD: https://apod.nasa.gov/apod.rss
- Product Hunt: https://www.producthunt.com/feed
- Reddit (any subreddit): https://www.reddit.com/r/deals/.rss

### JSON APIs:
- Fake Store API: https://fakestoreapi.com/products
- DummyJSON: https://dummyjson.com/products

### Note on HTML Sources
HTML scraping requires custom extractors for each site. The generic extractor looks for common patterns but may not work on all sites.

## Scheduled Crawls

To set up automatic hourly crawls:

```bash
cd apps/harvester
pnpm dev schedule
```

This uses BullMQ's repeatable jobs feature.

## Monitoring

### Real-time Stats
- Admin Dashboard: http://localhost:3000/admin
- Shows: Active sources, total executions, success rate, items harvested

### Queue Status
```bash
cd apps/harvester
pnpm dev status
```

### Database Inspection
```bash
cd packages/db
pnpm db:studio
```

Browse all tables including executions and logs.

## Next Steps

Once the system is working:

1. **Add More Sources**: Use the admin UI to add retail sites
2. **Customize Extractors**: Edit `apps/harvester/src/extractor/index.ts` for site-specific parsing
3. **Enable Alerts**: Set up email/webhook notifications in `apps/harvester/src/alerter/index.ts`
4. **Schedule Recurring**: Set up hourly/daily crawls
5. **Monitor Performance**: Check execution times and success rates

## Architecture Recap

```
┌─────────────┐
│   Admin UI  │ Port 3000
└──────┬──────┘
       │
┌──────▼──────┐
│  API Server │ Port 8000
└──────┬──────┘
       │
┌──────▼──────┐     ┌──────────┐
│  PostgreSQL │◄────┤  Prisma  │
└─────────────┘     └──────────┘
       ▲
       │
┌──────┴──────┐     ┌──────────┐
│  Harvester  │◄────┤  BullMQ  │◄───┐
│   Workers   │     └──────────┘    │
└─────────────┘            ▲        │
                           │        │
                      ┌────┴────┐   │
                      │  Redis  │───┘
                      └─────────┘
```

## Success Criteria

✅ Redis responds to `redis-cli ping`
✅ All migrations run successfully
✅ Harvester workers start without errors
✅ API server responds on port 8000
✅ Admin console loads and shows stats
✅ Test source appears in Sources list
✅ Manual crawl creates execution record
✅ Execution progresses through all stages
✅ Logs show all pipeline events
✅ New items appear in database
✅ Products are searchable in frontend

---

**Ready to start? Begin with Step 1!**

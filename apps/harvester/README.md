# ZeroedIn Harvester Service

Automated product price crawler and harvester service for ZeroedIn.

## Overview

The harvester service continuously discovers, extracts, and normalizes product pricing data from configured online sources. It uses a multi-stage pipeline architecture with BullMQ for job processing.

## Pipeline Stages

1. **Scheduler** - Creates crawl jobs for enabled sources
2. **Fetcher** - Retrieves content from URLs (RSS, HTML, JSON, JS-rendered)
3. **Extractor** - Parses content using site-specific adapters
4. **Normalizer** - Standardizes data into common format
5. **Writer** - Upserts products, retailers, and prices to database
6. **Alerter** - Evaluates and triggers price alerts

## Prerequisites

- Redis server running (for BullMQ)
- PostgreSQL database (configured via DATABASE_URL)
- Node.js 20+

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Configure Redis and database in `.env`

4. Run database migrations (from root):
```bash
cd ../../packages/db
pnpm db:migrate
```

## Usage

### Start Worker Processes
This starts all pipeline workers to process jobs:
```bash
pnpm worker
```

Keep this running in a separate terminal.

### Trigger Manual Crawl
Run an immediate crawl of all enabled sources:
```bash
pnpm dev run
```

### Schedule Recurring Crawls
Set up hourly automatic crawls:
```bash
pnpm dev schedule
```

### Check Queue Status
View current queue statistics:
```bash
pnpm dev status
```

## Managing Sources

Sources are managed in the database via the `Source` model. Use the admin console or Prisma Studio to add/edit sources:

```bash
# From packages/db directory
pnpm db:studio
```

Example source:
- **Name**: "Example Electronics Store"
- **URL**: "https://example.com/products/rss"
- **Type**: RSS, HTML, JSON, or JS_RENDERED
- **Enabled**: true
- **Interval**: 3600 (seconds between crawls)

## Architecture

```
┌─────────────┐
│  Scheduler  │ Creates crawl jobs
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Fetcher   │ Downloads content
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Extractor  │ Parses HTML/RSS/JSON
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Normalizer  │ Standardizes data
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Writer    │ Updates database
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Alerter   │ Triggers notifications
└─────────────┘
```

## Monitoring

Check execution logs in the database:

```sql
-- Recent executions
SELECT * FROM executions ORDER BY started_at DESC LIMIT 10;

-- Execution logs for a specific run
SELECT * FROM execution_logs
WHERE execution_id = 'xxx'
ORDER BY timestamp;

-- Failed executions
SELECT * FROM executions
WHERE status = 'FAILED'
ORDER BY started_at DESC;
```

## Extending

### Adding a New Source Adapter

1. Create adapter in `src/extractor/adapters/`
2. Register adapter in `src/extractor/index.ts`
3. Add source to database with appropriate type

### Adding Notification Channels

Edit `src/alerter/index.ts` and implement notification delivery in the `sendNotification()` function.

Options:
- Email (SendGrid, AWS SES)
- Webhooks
- Push notifications
- SMS

## Troubleshooting

**Workers not processing jobs:**
- Check Redis is running: `redis-cli ping`
- Verify DATABASE_URL is correct
- Check worker logs for errors

**No items extracted:**
- Review execution logs in database
- Test extractor on sample HTML
- Verify source URL is accessible

**Price alerts not triggering:**
- Check alert records are active: `SELECT * FROM alerts WHERE is_active = true`
- Verify price changes in database
- Review alerter worker logs

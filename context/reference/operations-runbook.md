# Operations Runbook

This document covers operational procedures for monitoring, debugging, and maintaining the IronScout harvester and background job infrastructure.

## Terminology (Canonical)

- **Merchant**: B2B portal account (subscription, billing, auth boundary). Merchant has users. Merchant submits merchant-scoped datasets (e.g., `pricing_snapshots`).
- **Retailer**: Consumer-facing storefront shown in search results. Consumer `prices` are keyed by `retailerId`. Retailers do not authenticate.
- **Source/Feed**: Technical origin of a consumer price record (affiliate, scraper, direct feed). Source is not Merchant.
- **Admin rights**: Merchant users are explicitly granted permissions per Retailer.
- **Legacy**: Any “dealer” wording or `DEALER_*` keys are legacy and must be migrated to “merchant” terminology.

---

## Bull Board - Queue Monitoring Dashboard

Bull Board provides a web UI for monitoring all BullMQ queues in the harvester. It shows job status, timing, errors, and allows manual job management.

> Legacy note: queue names prefixed `dealer-*` are legacy naming for Merchant ingestion and portal workflows. Consumer outputs remain Retailer-keyed (`retailerId`).

### Queues Monitored

| Queue | Purpose |
|-------|---------|
| `crawl` | Source scheduling and coordination |
| `fetch` | HTTP/RSS/Feed fetching |
| `extract` | Content extraction and parsing |
| `normalize` | Data normalization and validation |
| `write` | Database writes and price updates |
| `alert` | Price/availability alert triggers |
| `retailer-feed-ingest` | Retailer product feed ingestion |
| `affiliate-feed` | Affiliate feed processing (FTP/SFTP) |
| `affiliate-feed-scheduler` | Affiliate feed scheduling ticks |
| `product-resolve` | Product identity resolution (Spec v1.2) |

> **Removed for v1**: `merchant-sku-match`, `merchant-benchmark`, `merchant-insight` queues were removed. See `apps/harvester/src/config/queues.ts` for details.

### Starting Bull Board

**Development:**
```bash
cd apps/harvester
BULLBOARD_USERNAME=admin BULLBOARD_PASSWORD=<password> pnpm bullboard:dev
```

**Production:**
```bash
cd apps/harvester
pnpm build
BULLBOARD_USERNAME=<user> BULLBOARD_PASSWORD=<password> pnpm bullboard
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BULLBOARD_PORT` | `3939` | HTTP server port |
| `BULLBOARD_USERNAME` | (required) | Basic auth username |
| `BULLBOARD_PASSWORD` | (required) | Basic auth password |
| `BULLBOARD_BASE_PATH` | `/admin/queues` | URL path for dashboard |

### Accessing the Dashboard

1. Start Bull Board with credentials set
2. Navigate to `http://localhost:3939/admin/queues`
3. Enter username and password when prompted
4. Dashboard shows all queues with real-time updates

### Security Requirements

**Bull Board MUST NOT be exposed to the public internet.**

Required security measures:

1. **Authentication**: Always set strong `BULLBOARD_USERNAME` and `BULLBOARD_PASSWORD`
2. **Network isolation**: Run behind firewall, VPN, or SSH tunnel
3. **Port restriction**: Do not open port 3939 to external traffic
4. **Production access**: Use SSH tunnel or bastion host

**SSH Tunnel Example (Production):**
```bash
# From your local machine:
ssh -L 3939:localhost:3939 user@harvester-host

# Then access locally:
open http://localhost:3939/admin/queues
```

### Common Operations

#### Viewing Failed Jobs

1. Navigate to the queue in Bull Board
2. Click "Failed" tab
3. Expand job to see error details and stack trace
4. Option to retry or remove failed jobs

#### Retrying Failed Jobs

1. Select failed job(s)
2. Click "Retry" button
3. Job moves back to waiting/active state

#### Clearing Stuck Jobs

1. Navigate to queue
2. Check "Active" tab for jobs that have been running too long
3. Jobs stuck > 5 minutes may indicate worker crash
4. Can remove and re-queue if needed

#### Pausing/Resuming Queues

1. Click queue name
2. Use pause/resume button (top right)
3. Paused queues accept new jobs but don't process them
4. Useful during maintenance or incident response

---

## Harvester Worker Health

### Checking Worker Status

Workers log startup and heartbeat messages. Check logs for:

```
[INFO] Starting IronScout.ai Harvester Workers
[INFO] Affiliate feed worker started
[INFO] Workers are running
```

### Common Issues

#### Redis Connection Failure

**Symptom:** Workers fail to start, log shows Redis connection errors

**Resolution:**
1. Verify Redis is running: `redis-cli ping`
2. Check `REDIS_URL` environment variable
3. Verify network connectivity to Redis host

#### Database Connection Failure

**Symptom:** Scheduler doesn't start, database queries fail

**Resolution:**
1. Verify PostgreSQL is running
2. Check `DATABASE_URL` environment variable
3. Test connection: `psql $DATABASE_URL -c "SELECT 1"`

---

## FAQ: Monitoring, Silence, and Alerts

- **Why didn’t I get an alert?**  
  Alerts fire only for explicitly saved items when a meaningful price drop or back-in-stock event occurs. Caps apply: max 1 per item per 24h, max 1 per user per 6h, max 3 per user per day. If caps are reached or signals are minor, the alert is suppressed. Free users also receive delayed delivery.

- **Why does my dashboard look empty?**  
  Silence is expected. The dashboard shows at most one hero when confidence is high; otherwise it shows a calm “nothing urgent” state and your saved items. No filler or trends are shown when nothing qualifies.

- **Why did I get this alert?**  
  Every alert maps to a saved item and one of two triggers: meaningful price drop vs recent baseline, or back-in-stock. Alert payloads include product, retailer, and current price so support can trace the source without AI reasoning.

#### Multiple Scheduler Instances

**Symptom:** Duplicate job creation, data corruption

**Prevention:**
- Only one instance should have `HARVESTER_SCHEDULER_ENABLED=true`
- Other instances process jobs only, don't schedule

**Resolution if detected:**
1. Stop all harvester instances
2. Clear any duplicate jobs from queues
3. Restart with only ONE scheduler enabled

---

## Affiliate Feed Operations

### Testing Feed Connection

Use the Admin UI at `/affiliate-feeds/[id]` to test FTP/SFTP connections before enabling scheduled runs.

### Circuit Breaker Triggers

If a feed run shows `expiryBlocked = true`:

1. Check `expiryBlockedReason` in the run record
2. `SPIKE_THRESHOLD_EXCEEDED` = >20% of products would expire (possible feed issue)
3. `DATA_QUALITY_URL_HASH_SPIKE` = >50% products using URL hash identity (data quality issue)

**Resolution:**
1. Review feed content for issues
2. If feed is valid, manually approve via Admin UI
3. Consider adjusting feed configuration

### Auto-Disabled Feeds

Feeds automatically disable after 3 consecutive failures.

**Resolution:**
1. Check run history for error patterns
2. Fix underlying issue (credentials, feed format, network)
3. Re-enable feed via Admin UI

---

## Monitoring Checklist

Daily checks:
- [ ] Bull Board: No queues with large backlogs
- [ ] Bull Board: Failed job count within normal range
- [ ] Logs: No recurring errors

Weekly checks:
- [ ] Review failed jobs and error patterns
- [ ] Check affiliate feed success rates
- [ ] Verify scheduler is running on exactly one instance

---

## Emergency Procedures

### Stopping All Processing

```bash
# Graceful shutdown (waits for current jobs)
kill -SIGTERM <harvester-pid>

# If needed, pause all queues in Bull Board first
```

### Draining Queues

Use Bull Board to:
1. Pause the queue
2. Wait for active jobs to complete
3. Optionally remove waiting jobs
4. Resume when ready

### Recovery After Outage

1. Verify Redis and PostgreSQL are healthy
2. Start harvester workers (scheduler disabled initially)
3. Check Bull Board for backed-up jobs
4. Enable scheduler on ONE instance
5. Monitor for normal processing

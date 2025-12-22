# Feed Troubleshooting Guide

This guide helps diagnose and resolve common issues with dealer feed processing.

## Quick Diagnosis

### Check Feed Status

1. **Admin Portal**: Go to Dealers > [Dealer] > Feeds section
2. Look at feed status badge:
   - **PENDING** (gray) - Not yet run
   - **HEALTHY** (green) - Working normally
   - **WARNING** (yellow) - Partial issues
   - **FAILED** (red) - Processing failed

### Check Recent Runs

View the last 5 feed runs to identify patterns:
- Success/failure history
- Error messages
- Processing time

---

## Common Issues

### 1. Feed Download Failures

**Symptoms**:
- Status: FAILED
- Error: "Failed to download feed" or "Connection timeout"

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| URL changed | Update feed URL in admin portal |
| Site blocking our IP | Contact dealer to whitelist |
| SSL certificate issue | Check if HTTPS is required |
| Network timeout | Increase timeout or retry later |

**Diagnostic Steps**:
```bash
# Test URL accessibility
curl -I "https://dealer-site.com/feed.csv"

# Check for redirects
curl -L -v "https://dealer-site.com/feed.csv" 2>&1 | grep "< HTTP"
```

### 2. Parse Errors

**Symptoms**:
- Status: FAILED
- Error: "Failed to parse feed" or "Invalid format"

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Format changed (CSV to XML) | Update feed format type |
| Encoding issues | Specify encoding in feed config |
| Malformed data | Contact dealer to fix export |
| BOM characters | Strip BOM before parsing |

**Diagnostic Steps**:
```bash
# Check file encoding
file feed.csv

# View first few lines
head -20 feed.csv

# Check for BOM
hexdump -C feed.csv | head -1
```

### 3. Missing Required Fields

**Symptoms**:
- Status: WARNING
- Many SKUs quarantined
- Error: "Missing required field: price"

**Required Fields**:
- `sku` - Unique identifier
- `title` - Product name
- `price` - Current price

**Recommended Fields**:
- `upc` - For accurate matching
- `caliber` - For categorization
- `brand` - For matching
- `quantity` - Stock level

**Solution**:
Update column mapping in feed configuration or contact dealer to add missing fields.

### 4. FTP Connection Issues

**Symptoms**:
- Error: "FTP connection failed" or "Authentication failed"

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Wrong credentials | Verify username/password |
| IP not whitelisted | Request whitelist from dealer |
| Passive mode required | Enable passive FTP |
| Wrong port | Verify port (21 or custom) |

**Diagnostic Steps**:
```bash
# Test FTP connection
ftp -n ftp.dealer.com << EOF
user username password
ls
bye
EOF
```

### 5. SKU Matching Failures

**Symptoms**:
- Many SKUs with NONE or LOW confidence
- Products not appearing in benchmarks

**Causes**:
- Missing UPC codes
- Non-standard product titles
- Missing caliber/brand attributes

**Solutions**:
1. Request UPC codes from dealer
2. Improve attribute extraction rules
3. Manual canonical mapping for key products

### 6. Subscription Blocking

**Symptoms**:
- Feed runs show SKIPPED status
- Feed `enabled` is set to `false`

**Causes**:
- Dealer subscription expired (past grace period)
- Dealer suspended or cancelled

**Solution**:
1. Check subscription status in admin portal
2. Contact dealer about renewal
3. Admin can manually trigger run with override

---

## Feed Status Flow

```
              Feed Created
                   │
                   ▼
             ┌──────────┐
             │ PENDING  │
             └──────────┘
                   │
              First run
                   │
                   ▼
             ┌──────────┐
             │ HEALTHY  │◀─────────────┐
             └──────────┘              │
                   │                   │
           Partial issues              │
                   │                   │
                   ▼                   │
             ┌──────────┐        Success
             │ WARNING  │──────────────┤
             └──────────┘              │
                   │                   │
           Complete failure            │
                   │                   │
                   ▼                   │
             ┌──────────┐              │
             │  FAILED  │──────────────┘
             └──────────┘
```

> **Note**: When subscription is blocked, the feed's `enabled` field is set to `false` rather than changing status.

---

## Admin Actions

### Trigger Manual Feed Run

1. Go to Dealers > [Dealer] > Feeds
2. Click "Trigger Run" on the feed
3. Monitor job in queue status

**When to use**:
- After fixing feed configuration
- After dealer fixes their export
- Testing new feeds

### Enable/Disable Feed

1. Go to Dealers > [Dealer] > Feeds
2. Toggle the "Enabled" switch
3. Disabled feeds won't be scheduled

### View Feed Logs

1. Go to Dealers > [Dealer] > Feeds > [Feed]
2. Expand "Run History"
3. Click on specific run to see:
   - Start/end time
   - SKUs processed
   - Errors encountered
   - Quarantined rows

### Override Subscription Block

For testing or business reasons, admins can trigger runs for blocked dealers:

1. Go to Dealers > [Dealer] > Feeds
2. Click "Trigger Run" (admin override applied automatically)
3. Run processes despite subscription status

---

## Feed Configuration

### Column Mapping

For CSV feeds, map columns to required fields:

```json
{
  "columnMapping": {
    "sku": "item_number",
    "title": "product_name",
    "price": "retail_price",
    "upc": "upc_code",
    "quantity": "stock_qty"
  }
}
```

### URL Parameters

For URL feeds that need authentication:

```json
{
  "urlParams": {
    "api_key": "dealer_api_key",
    "format": "csv"
  }
}
```

### Custom Parsing Rules

For non-standard formats:

```json
{
  "parseRules": {
    "priceField": "price_with_currency",
    "priceRegex": "\\$([\\d.]+)",
    "skipRows": 2
  }
}
```

---

## Monitoring

### Queue Health

Check harvester queue status:

```bash
cd apps/harvester
pnpm dev status
```

Look for:
- Queue depth (waiting jobs)
- Failed jobs
- Processing rate

### Feed Processing Metrics

Monitor:
- Average processing time per feed
- Success rate (last 7 days)
- SKU count trends
- Error frequency

### Alerts

Set up alerts for:
- Feed failures (3+ consecutive)
- Long processing times (>10 minutes)
- High quarantine rates (>20%)

---

## Dealer Communication

### Request Feed Changes

Template for asking dealers to fix feeds:

```
Subject: IronScout Feed Update Required

Hi [Name],

We've noticed some issues with your product feed that are preventing
accurate display on IronScout.ai:

Issue: [Describe specific issue]

Recommended fix: [Specific action needed]

Please update your feed export and let us know when complete.
We'll re-process immediately.

Best regards,
IronScout Support
```

### Feed Specification Document

Share with dealers setting up new feeds:

**Required Fields**:
- SKU (unique identifier)
- Title (product name)
- Price (numeric, no currency symbol)
- In Stock (true/false or 1/0)

**Recommended Fields**:
- UPC (for accurate matching)
- Caliber
- Brand
- Quantity
- Product URL

**Format**: CSV preferred (UTF-8 encoding)

---

## Escalation Path

1. **Self-service**: Dealer portal feed status
2. **Level 1**: Check feed config, trigger manual run
3. **Level 2**: Review logs, adjust parsing rules
4. **Level 3**: Database investigation, harvester debugging
5. **Engineering**: Code changes for edge cases

---

*Last updated: December 14, 2024*

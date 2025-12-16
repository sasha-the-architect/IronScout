# Cloudflare API Challenge Fix

## Problem

Mobile apps and API clients were receiving Cloudflare challenge pages ("Just a moment...") instead of JSON responses, causing 115-second timeouts.

**Symptoms:**
- API requests return HTML instead of JSON
- Response times of 115+ seconds
- Error contains Cloudflare challenge page HTML
- Affects mobile apps particularly

## Root Cause

Cloudflare's bot protection is challenging API requests from mobile apps that can't solve JavaScript challenges.

## Solution

### Option 1: Page Rules (Recommended for Quick Fix)

1. Go to **Cloudflare Dashboard** → Your domain → **Rules** → **Page Rules**
2. Click **Create Page Rule**
3. Configure:
   - **URL Pattern**: `api.ironscout.ai/api/*`
   - **Settings**:
     - Security Level: `Low` (or `Essentially Off`)
     - Browser Integrity Check: `Off`
     - Cache Level: `Bypass`
4. Click **Save and Deploy**

### Option 2: WAF Custom Rule (Better for Production)

1. Go to **Security** → **WAF** → **Custom Rules**
2. Click **Create Rule**
3. Configure:
   - **Rule name**: "Skip API Challenges"
   - **Field**: `Hostname`
   - **Operator**: `equals`
   - **Value**: `api.ironscout.ai`
   - **And**: URI Path starts with `/api/`
   - **Then**: `Skip` → Select: `All remaining custom rules`
4. Click **Deploy**

### Option 3: Transform Rules (Most Precise)

1. Go to **Rules** → **Transform Rules** → **Modify Response Header**
2. Create rule for API endpoints
3. Add proper CORS and security headers
4. Disable challenges for matching requests

### Option 4: API Shield (Enterprise/Pro)

If you have Cloudflare Pro or Business:
1. Enable **API Shield**
2. Configure endpoint-specific security
3. Use mTLS or API tokens for authentication
4. Better long-term solution

## Code Changes Made

Added to `/api/search/suggestions` endpoint:
- Explicit CORS headers
- Cache-Control headers
- Content-Type specification
- Early validation

These help but **do not fix the root Cloudflare issue** - you must configure Cloudflare settings.

## Testing

After applying Cloudflare changes:

1. Test from Android app:
   ```
   https://api.ironscout.ai/api/search/suggestions?q=test
   ```

2. Should return JSON in <200ms:
   ```json
   {
     "suggestions": ["test ammo", "test rounds", ...]
   }
   ```

3. Should NOT return HTML with "Just a moment..."

## Verification

Check response headers should include:
```
Content-Type: application/json
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=60
```

Should NOT see:
```
cf-mitigated: challenge
```

## Long-term Recommendations

1. Use API tokens/keys for mobile apps
2. Whitelist known IP ranges (if applicable)
3. Configure rate limiting at API level, not Cloudflare challenges
4. Consider Cloudflare Workers for API-specific logic
5. Monitor Cloudflare Analytics for challenge rates

## Related Issues

- Mobile app timeout errors
- Android HTTP client failures
- "Just a moment" HTML responses
- 115+ second response times

---
**Last Updated**: 2025-12-16

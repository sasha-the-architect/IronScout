# Environment Variables

This document lists environment variables required to run IronScout. It is written for coding agents and operators.

Rules:
- Do not commit secrets.
- Do not reuse credentials across environments.
- If a value is missing or ambiguous, default to restricted behavior (fail closed).

---

## Global Conventions

- `NODE_ENV`: `development | production`
- Prefer explicit app-specific env vars over shared ambiguous ones.
- Separate databases and Redis per environment.

---

## Postgres

Required for:
- API
- Harvester
- All Next.js apps that read directly (if applicable)

Variables:
- `DATABASE_URL`
  - Postgres connection string used by Prisma

Optional but common:
- `DIRECT_URL`
  - Direct (non-pooled) connection string for migrations

---

## Redis (BullMQ)

Required for:
- Harvester
- Any service enqueuing jobs

Variables:
- `REDIS_URL`
  - Redis connection string

If you use separate roles:
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

---

## apps/api

Required:
- `PORT` (default 8000)
- `DATABASE_URL`
- `REDIS_URL` (if API enqueues jobs or reads queue state)
- `JWT_SECRET` - **Required for auth**. Must match `JWT_SECRET` used by web/dealer/admin apps.

Auth:
- API signs and verifies JWTs using `JWT_SECRET`
- All apps sharing auth must use the same `JWT_SECRET` value
- API also accepts `NEXTAUTH_SECRET` as fallback (for backwards compatibility)

Optional:
- `ADMIN_EMAILS` - Comma-separated list of admin email addresses
- `INTERNAL_API_KEY` - For internal service-to-service calls

AI/Search:
- `OPENAI_API_KEY` (or equivalent provider key)
- Optional:
  - `EMBEDDING_MODEL`
  - `CHAT_MODEL`

Stripe (consumer subscriptions):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Required behavior:
- API must not resolve tier from client-provided headers. It must use verified auth (ADR-002).

---

## apps/web (Consumer)

Required:
- `NEXT_PUBLIC_API_URL` (points to apps/api)
- `NEXTAUTH_URL` (canonical URL for NextAuth callbacks)
- `JWT_SECRET` - Must match API's `JWT_SECRET` for shared auth

Stripe (client):
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (if checkout is embedded)
- Server-side webhooks should live in API or a server route with `STRIPE_WEBHOOK_SECRET`.

---

## apps/dealer

Required:
- `NEXT_PUBLIC_API_URL` or dealer-specific API URL (if separate)
- `JWT_SECRET` - Must match API's `JWT_SECRET` for shared auth

Optional:
- Dealer onboarding keys if dealer feeds are pulled from private endpoints

---

## apps/admin

Required:
- `JWT_SECRET` - Must match API's `JWT_SECRET` for shared auth
- `NEXT_PUBLIC_ADMIN_API_URL` (if admin calls API directly)
- `ADMIN_EMAILS` - Comma-separated list of admin email addresses

Important:
- Admin impersonation must not bypass tier/eligibility enforcement.

---

## apps/harvester

Required:
- `DATABASE_URL`
- `REDIS_URL`

Networking:
- `HTTP_TIMEOUT_MS` (optional)
- `USER_AGENT` (optional)

Scheduling:
- `HARVESTER_SCHEDULER_ENABLED=true|false`
  - Use this to enforce singleton scheduler deployments (ADR-001).
  - Only one instance should set this true in production.

Safety:
- `MAX_WRITE_BATCH_SIZE` (optional)
- `MAX_SOURCE_CONCURRENCY` (optional)

Affiliate Feeds:
- `AFFILIATE_FEED_SCHEDULER_ENABLED=true|false` - Enable affiliate feed scheduling
- `AFFILIATE_FEED_ALLOW_PLAIN_FTP=true|false` - Allow insecure FTP (default: false)
- `CREDENTIAL_ENCRYPTION_KEY_B64` - Base64-encoded 32-byte key for credential encryption
- `PRICE_HEARTBEAT_HOURS` - Hours before writing heartbeat price even if unchanged (default: 24)
- `AFFILIATE_RUN_RETENTION_DAYS` - Days to retain completed runs before cleanup (default: 30)

Bull Board (Queue Monitor):
- `BULLBOARD_PORT` - Server port (default: 3939)
- `BULLBOARD_USERNAME` - **Required** for auth. Basic auth username.
- `BULLBOARD_PASSWORD` - **Required** for auth. Basic auth password.
- `BULLBOARD_BASE_PATH` - URL path (default: /admin/queues)

**Security:** Bull Board must never be exposed to public internet. Use SSH tunnel or VPN.

---

## Minimum Local Dev Set (Suggested)

- `DATABASE_URL`
- `REDIS_URL`
- `OPENAI_API_KEY` (if AI search is enabled locally)
- `JWT_SECRET` - Same value across all apps (api, web, dealer, admin)
- `NEXT_PUBLIC_API_URL` (for web/dealer/admin)

---

## Validation Checklist

Before running in any environment:
- Database points to the correct environment.
- Redis points to the correct environment.
- Harvester scheduler is enabled in only one place.
- Stripe keys match environment.
- No secrets are exposed to client via `NEXT_PUBLIC_*` unless intended.

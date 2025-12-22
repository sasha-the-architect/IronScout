# Environment Setup

This guide covers setting up development, staging, and production environments for IronScout.

## Environment Overview

| Environment | Purpose | Database | URL Pattern |
|-------------|---------|----------|-------------|
| Development | Local development | Local PostgreSQL | localhost:3000 |
| Staging | Pre-production testing | Render staging DB | staging.ironscout.ai |
| Production | Live users | Render production DB | ironscout.ai |

---

## Development Environment

### Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL 15+ with pgvector
- Redis 7+
- Git

### Initial Setup

```bash
# Clone repository
git clone https://github.com/your-org/ironscout.git
cd ironscout

# Install dependencies
pnpm install

# Set up environment files
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# Set up database
cd packages/db
pnpm db:generate
pnpm db:push
pnpm db:seed
```

### Local PostgreSQL

```bash
# Install pgvector extension
# On macOS with Homebrew:
brew install pgvector

# On Ubuntu:
sudo apt install postgresql-15-pgvector

# Enable in database:
CREATE EXTENSION vector;
```

### Local Redis

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis
```

### Environment Variables (.env)

```env
# Root .env
DATABASE_URL="postgresql://postgres:password@localhost:5432/ironscout"
```

### API Environment (apps/api/.env)

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/ironscout"
PORT=8000
NODE_ENV=development

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# Stripe (test mode)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# OpenAI
OPENAI_API_KEY="sk-..."

# CORS
FRONTEND_URL="http://localhost:3000"
```

### Web Environment (apps/web/.env.local)

```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="development-secret-change-in-production"

# Google OAuth (dev credentials)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# API
NEXT_PUBLIC_API_URL="http://localhost:8000"

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

### Admin Environment (apps/admin/.env.local)

```env
NEXTAUTH_SECRET="development-secret-change-in-production"
ADMIN_EMAILS="your-email@example.com"
NEXT_PUBLIC_WEB_URL="http://localhost:3000"
NEXT_PUBLIC_ADMIN_URL="http://localhost:3002"
DATABASE_URL="postgresql://postgres:password@localhost:5432/ironscout"
```

### Dealer Environment (apps/dealer/.env.local)

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/ironscout"
NEXTAUTH_SECRET="development-secret-change-in-production"
RESEND_API_KEY="re_..."
NEXT_PUBLIC_API_URL="http://localhost:8000"
```

### Starting Development

```bash
# Terminal 1: Start all services
pnpm dev

# Or start individually:
# Terminal 1: Web
cd apps/web && pnpm dev

# Terminal 2: API
cd apps/api && pnpm dev

# Terminal 3: Admin
cd apps/admin && pnpm dev

# Terminal 4: Dealer
cd apps/dealer && pnpm dev

# Terminal 5: Harvester
cd apps/harvester && pnpm worker
```

---

## Staging Environment

### Purpose

- Test features before production
- Validate deployments
- Integration testing

### Setup on Render

1. Create staging services (suffix with `-staging`)
2. Use separate staging database
3. Configure staging environment variables

### Staging URLs

| Service | URL |
|---------|-----|
| Web | staging.ironscout.ai |
| API | api-staging.ironscout.ai |
| Admin | admin-staging.ironscout.ai |
| Dealer | dealer-staging.ironscout.ai |

### Staging Environment Variables

Same as production but with:
- Staging database URL
- Staging Stripe keys (test mode)
- Staging URLs

---

## Production Environment

### Security Checklist

- [ ] All secrets in Render environment variables (not in code)
- [ ] NEXTAUTH_SECRET is strong and unique
- [ ] Stripe live keys configured
- [ ] Database backups enabled
- [ ] SSL certificates active
- [ ] Rate limiting enabled
- [ ] Error monitoring configured

### Production Environment Variables

#### Web

```env
NEXTAUTH_URL="https://ironscout.ai"
NEXTAUTH_SECRET="<strong-random-secret>"
GOOGLE_CLIENT_ID="<production-client-id>"
GOOGLE_CLIENT_SECRET="<production-client-secret>"
NEXT_PUBLIC_API_URL="https://api.ironscout.ai"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
```

#### API

```env
DATABASE_URL="<render-database-url>"
PORT=8000
NODE_ENV=production
REDIS_URL="<render-redis-url>"
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
OPENAI_API_KEY="sk-..."
FRONTEND_URL="https://ironscout.ai"
```

### Deployment Branch

- Production deploys from `main` branch
- Staging deploys from `staging` branch (if used)

---

## Environment Variable Management

### Secrets

Never commit secrets to Git. Use:
- Render environment variables (production)
- `.env.local` files (development, gitignored)

### Shared Variables

For shared configuration, use `.env.example` as template:

```bash
# .env.example (committed)
DATABASE_URL="postgresql://..."
STRIPE_SECRET_KEY="sk_test_..."

# .env.local (gitignored)
DATABASE_URL="postgresql://actual-connection-string"
STRIPE_SECRET_KEY="sk_test_actual_key"
```

### Validation

Add startup validation for required variables:

```typescript
// lib/env.ts
const required = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'STRIPE_SECRET_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
```

---

## Database Migrations

### Development

```bash
# Generate migration
pnpm db:migrate -- --name migration_name

# Apply migration
pnpm db:migrate

# Reset database (DESTROYS DATA)
pnpm db:push --force-reset
```

### Production

```bash
# Migrations run automatically on Render deploy
# Or manually:
pnpm db:migrate deploy
```

### Migration Safety

- Always backup before migrations
- Test migrations on staging first
- Use transactions for data migrations
- Have rollback plan

---

## Switching Environments

### Database URL Override

```bash
# Run command against different database
DATABASE_URL="postgresql://..." pnpm db:studio
```

### Multiple .env Files

```bash
# Load specific env file
dotenv -e .env.staging -- pnpm dev
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check pgvector
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector'"
```

### Redis Connection Issues

```bash
# Test connection
redis-cli -u $REDIS_URL ping
```

### Environment Variable Not Loading

1. Check file name (`.env.local` for Next.js)
2. Restart dev server after changes
3. Verify `NEXT_PUBLIC_` prefix for client-side vars

---

*Last updated: December 14, 2024*

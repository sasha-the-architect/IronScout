# Render Deployment

IronScout services are deployed on Render.com with the following architecture.

## Services Overview

| Service | Type | URL |
|---------|------|-----|
| Web | Web Service | ironscout.ai |
| API | Web Service | api.ironscout.ai |
| Admin | Web Service | admin.ironscout.ai |
| Dealer | Web Service | dealer.ironscout.ai |
| Harvester | Background Worker | (no URL) |
| PostgreSQL | Database | Internal |
| Redis | Key-Value Store | Internal |

---

## Service Configuration

### render.yaml

The `render.yaml` file at the project root defines all services:

```yaml
services:
  # Web Frontend
  - type: web
    name: ironscout-web
    env: node
    buildCommand: pnpm install && pnpm build --filter @ironscout/web
    startCommand: pnpm --filter @ironscout/web start
    envVars:
      - key: NEXTAUTH_URL
        value: https://ironscout.ai
      - key: NEXT_PUBLIC_API_URL
        value: https://api.ironscout.ai
      # ... more env vars

  # API Backend
  - type: web
    name: ironscout-api
    env: node
    buildCommand: pnpm install && pnpm build --filter @ironscout/api
    startCommand: pnpm --filter @ironscout/api start
    envVars:
      - key: PORT
        value: 8000
      - key: DATABASE_URL
        fromDatabase:
          name: ironscout-db
          property: connectionString
      # ... more env vars

  # Harvester Worker
  - type: worker
    name: ironscout-harvester
    env: node
    buildCommand: pnpm install && pnpm build --filter @ironscout/harvester
    startCommand: pnpm --filter @ironscout/harvester worker
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: ironscout-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: ironscout-redis
          type: redis
          property: connectionString

databases:
  - name: ironscout-db
    plan: standard

services:
  - type: redis
    name: ironscout-redis
    plan: standard
```

---

## Environment Variables

### Web Service

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_URL` | Full URL (https://ironscout.ai) |
| `NEXTAUTH_SECRET` | Session encryption key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `NEXT_PUBLIC_API_URL` | API URL (https://api.ironscout.ai) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe public key |

### API Service

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (8000) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `OPENAI_API_KEY` | OpenAI API key for embeddings |
| `REDIS_URL` | Redis connection string |
| `FRONTEND_URL` | Web URL for CORS |

### Admin Service

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_SECRET` | Same as web app |
| `ADMIN_EMAILS` | Comma-separated admin emails |
| `NEXT_PUBLIC_WEB_URL` | Web URL |
| `NEXT_PUBLIC_ADMIN_URL` | Admin URL |
| `DATABASE_URL` | PostgreSQL connection string |

### Dealer Service

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | JWT signing key |
| `RESEND_API_KEY` | Email service key |
| `NEXT_PUBLIC_API_URL` | API URL |

### Harvester Service

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `RESEND_API_KEY` | For alert emails |

---

## Database

### PostgreSQL Configuration

- **Plan**: Standard (or higher for production)
- **Extensions**: pgvector (enabled via migration)
- **Backups**: Automatic daily backups

### Connection Pooling

For high-traffic scenarios, consider using PgBouncer:

```env
DATABASE_URL="postgresql://user:pass@host:5432/db?pgbouncer=true"
```

---

## Redis

### Configuration

- **Plan**: Standard
- **Persistence**: AOF enabled for durability
- **Max memory policy**: volatile-lru

### Usage

- BullMQ job queues (harvester)
- Session cache (optional)
- Rate limiting (optional)

---

## Custom Domains

### DNS Configuration

| Domain | Type | Value |
|--------|------|-------|
| ironscout.ai | CNAME | ironscout-web.onrender.com |
| api.ironscout.ai | CNAME | ironscout-api.onrender.com |
| admin.ironscout.ai | CNAME | ironscout-admin.onrender.com |
| dealer.ironscout.ai | CNAME | ironscout-dealer.onrender.com |

### SSL

- Automatic SSL via Let's Encrypt
- Force HTTPS enabled

---

## Build Configuration

### Build Command

Each service uses filtered build:

```bash
# Web
pnpm install && pnpm build --filter @ironscout/web

# API
pnpm install && pnpm build --filter @ironscout/api

# Harvester
pnpm install && pnpm build --filter @ironscout/harvester
```

### Build Dependencies

Ensure `packages/db` builds first (shared Prisma client):

```bash
pnpm install && pnpm --filter @ironscout/db db:generate && pnpm build --filter @ironscout/web
```

---

## Health Checks

### Web Services

Render automatically checks `/` for web services.

### API Health Endpoint

```typescript
// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

---

## Scaling

### Auto-Scaling

Enable auto-scaling for web services:
- Min instances: 1
- Max instances: 3 (or higher)
- Scale on: CPU > 70% or Memory > 80%

### Harvester Scaling

For high feed volume, run multiple harvester instances:
- Each instance processes different queues
- Redis ensures job coordination

---

## Deployment Process

### Automatic Deployments

1. Push to `main` branch
2. Render detects changes
3. Builds affected services
4. Deploys with zero-downtime

### Manual Deployment

1. Go to Render dashboard
2. Select service
3. Click "Manual Deploy"
4. Choose branch

### Rollback

1. Go to service > Events
2. Find previous successful deploy
3. Click "Rollback"

---

## Monitoring

### Logs

- View in Render dashboard
- Filter by service
- Search by keyword

### Metrics

- CPU usage
- Memory usage
- Response times
- Request count

### Alerts

Set up alerts for:
- Service down
- High error rate
- High response time
- Database connection issues

---

## Troubleshooting

### Build Failures

1. Check build logs in Render dashboard
2. Common issues:
   - Missing environment variables
   - TypeScript errors
   - Dependency conflicts

### Service Crashes

1. Check runtime logs
2. Common issues:
   - Database connection errors
   - Missing environment variables
   - Out of memory

### Database Issues

1. Check database logs
2. Common issues:
   - Connection pool exhaustion
   - Slow queries
   - Disk space

---

## Cost Optimization

### Starter vs Standard Plans

| Feature | Starter | Standard |
|---------|---------|----------|
| CPU | Shared | Dedicated |
| Memory | 512MB | 2GB+ |
| Auto-sleep | Yes | No |
| Custom domains | Yes | Yes |

### Recommendations

- **Development**: Starter plans
- **Production**: Standard for API/Web, Starter for Admin/Dealer
- **Database**: Standard or higher (no auto-sleep)

---

*Last updated: December 14, 2024*

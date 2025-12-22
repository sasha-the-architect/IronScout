# API Application

The API (`apps/api/`) is an Express.js REST API that serves as the backend for all IronScout applications.

## Overview

- **Framework**: Express.js with TypeScript
- **Port**: 8000 (default)
- **Database**: PostgreSQL via Prisma
- **Cache**: Redis for queue management and caching
- **Validation**: Zod schemas

---

## Architecture

```
apps/api/
├── src/
│   ├── index.ts              # Entry point
│   ├── routes/               # API route handlers
│   ├── services/             # Business logic
│   │   └── ai-search/        # AI search services
│   ├── middleware/           # Express middleware
│   ├── config/               # Configuration
│   └── lib/                  # Utilities
├── package.json
└── tsconfig.json
```

---

## Starting the API

```bash
# Development (with hot reload)
cd apps/api
pnpm dev

# Production
pnpm build
pnpm start
```

---

## Routes

### Products (`/api/products`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products with filters |
| GET | `/api/products/:id` | Get product by ID |
| GET | `/api/products/:id/prices` | Get prices for product |

### Search (`/api/search`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search/semantic` | AI-powered semantic search |
| POST | `/api/search/parse` | Parse search intent (debug) |
| GET | `/api/search/suggestions` | Autocomplete suggestions |
| POST | `/api/search/nl-to-filters` | Natural language to filters |
| GET | `/api/search/premium-filters` | Premium filter definitions |

**Admin Search Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search/admin/embedding-stats` | Embedding coverage |
| GET | `/api/search/admin/ballistic-stats` | Premium field coverage |
| POST | `/api/search/admin/backfill-embeddings` | Trigger backfill |

### Alerts (`/api/alerts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts` | List user's alerts |
| POST | `/api/alerts` | Create alert |
| DELETE | `/api/alerts/:id` | Delete alert |
| PATCH | `/api/alerts/:id` | Update alert |

### Payments (`/api/payments`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/create-checkout` | Create Stripe checkout |
| POST | `/api/payments/webhook` | Stripe webhook handler |
| POST | `/api/payments/portal` | Customer portal link |

### Reports (`/api/reports`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reports` | Create product report |
| GET | `/api/reports` | List reports (admin) |
| GET | `/api/reports/:id` | Get single report |
| PATCH | `/api/reports/:id` | Update report status |
| GET | `/api/reports/stats/summary` | Report statistics |

### Harvester (`/api/harvester`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/harvester/trigger` | Trigger crawl |
| GET | `/api/harvester/status` | Queue status |

### Sources (`/api/sources`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sources` | List crawl sources |
| POST | `/api/sources` | Create source |
| PATCH | `/api/sources/:id` | Update source |
| DELETE | `/api/sources/:id` | Delete source |

### Executions (`/api/executions`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/executions` | List executions |
| GET | `/api/executions/:id` | Get execution |
| GET | `/api/executions/:id/logs` | Get execution logs |

---

## Authentication

### Consumer Authentication

The API receives user identity via the `X-User-Id` header from the web frontend.

```typescript
// In route handler
const userId = req.headers['x-user-id'] as string;
const user = await prisma.user.findUnique({ where: { id: userId } });
```

### Tier Checking

```typescript
import { getUserTier, hasFeature } from '../lib/tier';

// Get user's tier
const tier = await getUserTier(userId);  // 'FREE' | 'PREMIUM'

// Check specific feature
if (hasFeature(tier, 'premiumFilters')) {
  // Apply premium filters
}
```

### Dealer Authentication

Dealer portal uses JWT tokens verified by middleware.

---

## Middleware

### CORS

```typescript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ironscout.ai',
    'https://dealer.ironscout.ai',
    'https://admin.ironscout.ai'
  ],
  credentials: true
}));
```

### Error Handling

```typescript
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## Validation

All request bodies are validated with Zod schemas:

```typescript
import { z } from 'zod';

const CreateAlertSchema = z.object({
  productId: z.string(),
  targetPrice: z.number().positive(),
});

router.post('/alerts', async (req, res) => {
  const parsed = CreateAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.errors });
  }
  // ... create alert
});
```

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://..."

# Server
PORT=8000
NODE_ENV=development

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# OpenAI (for embeddings)
OPENAI_API_KEY="sk-..."

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:3000"
```

---

## Services

### AI Search Services

Located in `src/services/ai-search/`:

- `embedding-service.ts` - Vector embedding generation
- `intent-parser.ts` - Natural language parsing
- `search-service.ts` - Search orchestration
- `premium-ranking.ts` - Performance-aware ranking
- `best-value-score.ts` - Value calculation
- `ammo-knowledge.ts` - Domain knowledge

See [AI Search Documentation](../architecture/ai-search.md) for details.

---

## Adding New Routes

1. Create route file in `src/routes/`
2. Define Zod schemas for request validation
3. Implement route handlers
4. Register in `src/index.ts`

```typescript
// src/routes/example.ts
import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const ExampleSchema = z.object({
  name: z.string().min(1),
});

router.post('/', async (req, res) => {
  const parsed = ExampleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.errors });
  }

  // Business logic here
  res.json({ success: true });
});

export default router;

// src/index.ts
import exampleRoutes from './routes/example';
app.use('/api/example', exampleRoutes);
```

---

## Error Responses

Standard error response format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

Common status codes:
- `400` - Bad request / validation error
- `401` - Unauthorized
- `403` - Forbidden (insufficient tier)
- `404` - Not found
- `500` - Internal server error

---

*Last updated: December 14, 2024*

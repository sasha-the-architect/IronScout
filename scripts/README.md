# Scripts

Utility scripts for development, building, and seeding the IronScout platform.

**All scripts are cross-platform Node.js (`.mjs`)** - they work on Windows, macOS, and Linux.

## Quick Start

```bash
# Start all services in dev mode
node scripts/dev/start-all.mjs

# Stop all services
node scripts/dev/stop-all.mjs

# Build all apps
node scripts/build/build-all.mjs

# Verify system is set up correctly
node scripts/dev/test-system.mjs
```

## Folder Structure

```
scripts/
├── lib/             # Shared utilities
├── build/           # Build and verification scripts
├── dev/             # Development environment scripts
├── seeding/         # Database seeding scripts
└── README.md
```

## Build Scripts (`build/`)

| Script | Description |
|--------|-------------|
| `build-all.mjs` | Build all apps in dependency order |
| `verify-all.mjs` | Build, start services, verify health checks, then stop |
| `generate-pwa-icons.js` | Generate PWA icons for web app |

### Build Examples

```bash
# Full build with tests
node scripts/build/build-all.mjs

# Skip tests
node scripts/build/build-all.mjs --skip-tests

# Build specific apps only
node scripts/build/build-all.mjs --only web,api

# Verify all services start correctly
node scripts/build/verify-all.mjs
```

## Development Scripts (`dev/`)

| Script | Description |
|--------|-------------|
| `start-all.mjs` | Start all services (API, web, admin, merchant, harvester) |
| `stop-all.mjs` | Stop all running services |
| `logs.mjs` | View logs from running services |
| `test-system.mjs` | Verify dev environment (Redis, DB, deps) |
| `setup-stripe.mjs` | Configure Stripe for local development |
| `setup-https.mjs` | Set up local HTTPS certificates with mkcert |
| `fix-conflicts.mjs` | Resolve merge conflicts (keeps HEAD version) |

### Development Examples

```bash
# Start all services
node scripts/dev/start-all.mjs

# Start specific services only
node scripts/dev/start-all.mjs --only web,api

# View logs for a service
node scripts/dev/logs.mjs web
node scripts/dev/logs.mjs --all

# Stop all services
node scripts/dev/stop-all.mjs
node scripts/dev/stop-all.mjs --force  # Force kill
```

## Seeding Scripts (`seeding/`)

| Script | Description |
|--------|-------------|
| `seed-production.mjs` | Seed database with test data |

### Production Seeding

Before running seed scripts, set your `DATABASE_URL`:

```bash
# Set environment variable
export DATABASE_URL="postgresql://user:pass@host/database"

# Run seeding
node scripts/seeding/seed-production.mjs
```

### What Gets Seeded

1. **Retailers** - Test retailer accounts
2. **Products** - 657 comprehensive ammunition products
3. **Price History** - 90 days of historical price data

## Other Scripts

| Script | Description |
|--------|-------------|
| `validate-db-schema.mjs` | Validate Prisma schema matches database |
| `sync-database.mjs` | Sync remote database to local (for dev) |
| `preflight.mjs` | CI preflight checks |

## Shared Utilities (`lib/`)

The `lib/utils.mjs` module provides cross-platform utilities:

- Colored console output
- Command execution helpers
- Port checking
- Process management
- Health check utilities

## Migrating from Shell Scripts

All `.sh`, `.ps1`, and `.bat` scripts have been converted to `.mjs` for cross-platform compatibility. The old scripts have been removed.

## Related

- Database seed TypeScript files: `packages/db/seed*.ts`
- See `docs/deployment/` for deployment guides

# Scripts

Utility scripts for development, building, and seeding the IronScout platform.

## Folder Structure

```
scripts/
├── build/           # Build and verification scripts
├── dev/             # Development environment scripts
├── seeding/         # Database seeding scripts
└── README.md
```

## Build Scripts (`build/`)

| Script | Description |
|--------|-------------|
| `build-all.ps1` | PowerShell script to build all apps in correct order |
| `verify-all.ps1` | Verify builds and dependencies are correct |
| `generate-pwa-icons.js` | Generate PWA icons for web app |

## Development Scripts (`dev/`)

| Script | Description |
|--------|-------------|
| `dev.sh` | Start all services in development mode |
| `start-all.ps1` | PowerShell version of dev startup |
| `test-system.sh` | Run system integration tests |
| `setup-stripe.sh` | Configure Stripe for local development |
| `fix-conflicts.sh` | Resolve common merge conflicts |

## Seeding Scripts (`seeding/`)

| Script | Description |
|--------|-------------|
| `seed-production.bat` | Windows batch script to seed production database |
| `seed-production.sh` | Unix shell script to seed production database |

### Production Seeding

Before running seed scripts, set your `DATABASE_URL`:

**Windows (PowerShell):**
```powershell
$env:DATABASE_URL = "postgresql://user:pass@host/database"
.\docs\scripts\seeding\seed-production.bat
```

**Unix/Mac:**
```bash
export DATABASE_URL="postgresql://user:pass@host/database"
./docs/scripts/seeding/seed-production.sh
```

### What Gets Seeded

1. **Retailers** - Test retailer accounts
2. **Products** - 657 comprehensive ammunition products
3. **Price History** - 90 days of historical price data

## Related

- Database seed TypeScript files: `packages/db/seed*.ts`
- See `docs/deployment/` for deployment guides

# IronScout Documentation

This folder contains all project documentation organized by category.

## Structure

```
docs/
├── architecture/     # System design and technical architecture
├── apps/             # Per-application documentation
├── deployment/       # Setup, configuration, and deployment guides
├── product/          # Product requirements, features, and decisions
├── guides/           # How-to guides and tutorials
├── scripts/          # Utility scripts (build, dev, seeding)
└── old/              # Historical reference (archived, may be outdated)
```

---

## Architecture

Technical design and system overview.

| Document | Description |
|----------|-------------|
| [overview.md](architecture/overview.md) | Full system architecture, tier system, roadmap |
| [ai-search.md](architecture/ai-search.md) | AI search system - embeddings, intent parsing, ranking |
| [database.md](architecture/database.md) | Database schema - models, relationships, indexes |
| [normalization.md](architecture/normalization.md) | Ammunition normalization - UPC matching, caliber extraction |

---

## Apps

Documentation for each deployable application.

| Document | Description |
|----------|-------------|
| [web.md](apps/web.md) | Consumer frontend - Next.js, auth, components |
| [api.md](apps/api.md) | REST API - routes, middleware, validation |
| [harvester.md](apps/harvester.md) | BullMQ workers - 10-worker pipeline, queues |
| [admin.md](apps/admin.md) | Admin portal - dealer management, impersonation |
| [dealer.md](apps/dealer.md) | Dealer portal - feeds, SKUs, insights, contacts |

---

## Deployment

Setup and configuration guides.

| Document | Description |
|----------|-------------|
| [render.md](deployment/render.md) | Render deployment - services, databases, scaling |
| [environments.md](deployment/environments.md) | Environment setup - dev, staging, production |
| [stripe.md](deployment/stripe.md) | Stripe integration - webhooks, checkout, testing |
| [email.md](deployment/email.md) | Resend email - setup, templates, verification |
| [checklist.md](deployment/checklist.md) | Pre-deployment checklist - external services, env vars |

---

## Product

Product requirements, features, and business decisions.

| Document | Description |
|----------|-------------|
| [subscription-management.md](product/subscription-management.md) | Dealer subscription lifecycle, access control, notifications |
| [offerings.md](product/offerings.md) | Dealer tier features (STANDARD, PRO, FOUNDING) |
| [consumer-tiers.md](product/consumer-tiers.md) | Consumer tier features (FREE, PREMIUM) |

### Agents

| Document | Description |
|----------|-------------|
| [agents.md](agents.md) | Available Codex-friendly agents and how to run them |

**Not yet documented:**
- `stripe-integration.md` - Stripe webhooks and billing flows (dealer-specific)

---

## Guides

How-to documentation for common tasks.

| Document | Description |
|----------|-------------|
| [testing.md](guides/testing.md) | Testing strategy, Vitest setup, writing tests |
| [feed-troubleshooting.md](guides/feed-troubleshooting.md) | Diagnosing and fixing dealer feed issues |

**Not yet documented:**
- `adding-a-dealer-worker.md` - How to add new harvester worker
- `adding-api-routes.md` - API patterns and conventions

---

## Scripts

Utility scripts for development, building, and database operations.

| Folder | Description |
|--------|-------------|
| [scripts/](scripts/README.md) | Scripts overview and usage |
| [scripts/build/](scripts/build/) | Build and verification scripts (PowerShell, JS) |
| [scripts/dev/](scripts/dev/) | Development environment scripts (shell, PowerShell) |
| [scripts/seeding/](scripts/seeding/) | Production database seeding scripts |

**Key scripts:**
- `scripts/seeding/seed-production.sh` - Seed production database (retailers, products, price history)
- `scripts/build/build-all.ps1` - Build all apps in correct dependency order
- `scripts/dev/start-all.ps1` - Start all services for development

---

## Old / Historical

The `old/` folder contains archived documentation for historical reference only. These documents may be outdated and should not be used as current references.

---

## Quick Links

### For Developers

- [Environment Setup](deployment/environments.md) - Get your local environment running
- [Testing Guide](guides/testing.md) - Testing strategy and conventions
- [Database Schema](architecture/database.md) - Understand the data model
- [API Routes](apps/api.md) - API endpoint reference

### For Product/Business

- [Product Offerings](product/offerings.md) - What we deliver to dealers
- [Subscription Management](product/subscription-management.md) - Billing and access control
- [Consumer Tiers](product/consumer-tiers.md) - FREE vs PREMIUM features

### For Operations

- [Render Deployment](deployment/render.md) - Production infrastructure
- [Feed Troubleshooting](guides/feed-troubleshooting.md) - Diagnose feed issues
- [Admin Portal](apps/admin.md) - Managing dealers

---

## Keeping Docs in Sync

To ensure documentation stays current with code:

1. **PR Checklist**: Include doc updates in PR reviews when relevant code changes
2. **CLAUDE.md**: Reference doc files so Claude reminds you when code changes affect docs
3. **Regular Review**: Periodically review docs for accuracy (quarterly recommended)

---

## Contributing

When adding new documentation:

1. Place in the appropriate folder based on content type
2. Update this README with a link and description
3. Use consistent formatting (see existing docs)
4. Include "Last updated" date at bottom of document

---

*Last updated: December 16, 2025*

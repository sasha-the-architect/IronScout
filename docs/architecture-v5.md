
# ZeroedIn — Full Application Specification

## Overview
ZeroedIn is an AI-native, responsive purchasing assistant platform that discovers, normalizes, and presents product deals across the internet. It supports user subscriptions, premium dealer prioritization, affiliate revenue, and display ads. The foundation includes stubs for a future Data as a Service (DaaS) offering.

---

## 1. Project Goal
Create the foundational architecture and code stubs for the MVP, featuring a responsive UI, monetization mechanisms, and a scalable backend that supports future AI-powered deal intelligence.

---

## 2. Core Concept
ZeroedIn acts as a proactive purchasing assistant. It aggregates and ranks real-time deals, offering users personalized search results and alerts. Premium dealers are prioritized, and users can subscribe for faster alerting and richer insights.

---

## 3. Technology Stack
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Styling:** Tailwind CSS
- **UI Components:** Shadcn/UI
- **Authentication:** NextAuth.js
- **Payment Processing:** Stripe SDK
- **Queue/Worker:** BullMQ + Redis

---

## 4. Architecture Overview

### Monorepo Setup
- Managed with pnpm workspaces.
- Apps: `apps/web`, `apps/api`, `apps/harvester`.
- Shared packages: `packages/db`, `packages/ui`, `packages/config`.

### Environments
`.env.example` with placeholders for database, auth, and Stripe keys.

### Core Apps
- **apps/web:** Responsive frontend UI.
- **apps/api:** Backend API and admin endpoints.
- **apps/harvester:** Automated internet crawler and price harvester.

---

## 5. Functional Modules

### 5.1 Product & Ad Search
Endpoints:
- `/api/products/search`
- `/api/ads/placement`

Features:
- Mixed stream of ProductCard and AdCard components.
- Premium dealer visual tags.
- Responsive grid layout across all screen sizes.

### 5.2 Alerts & Payments
- Users create alerts for products or searches.
- Stripe integration for premium subscriptions.
- Premium users get real-time alerts; free users see delayed alerts.

### 5.3 Data as a Service (DaaS) [POST-MVP]
- `/api/data/market-trends`
- `/api/data/price-velocity?productId={id}`
- Restricted to DaaS subscribers.

---

## 6. Database Schema (Prisma)
Includes models for:
- User
- Product
- Retailer
- Price
- Alert
- Advertisement
- Source
- Execution / ExecutionLog (for job monitoring)
- DataSubscription
- MarketReport

Full schema includes enums for job statuses, dealer tiers, and log levels.

---

## 7. Harvester Service (apps/harvester)

Purpose:
Continuously discover, extract, and normalize product pricing data from allowed online sources.

Pipeline stages:
1. **Scheduler** — creates crawl jobs per source.
2. **Fetcher** — retrieves documents (RSS, JSON, HTML, JS-rendered).
3. **Extractor** — applies site-specific adapters.
4. **Normalizer** — standardizes data (title, price, currency, brand).
5. **Writer** — upserts to DB.
6. **Alerter** — triggers alerts on price changes.

Admin-triggered or automated by schedule.

---

## 8. Admin Console

### Features
- Dashboard for executions (success/failure, duration, stats).
- View crawl logs and DB updates.
- Run crawls manually (global or per source).
- Toggle sources on/off.
- Live log streaming via SSE.
- Scheduled recurring runs via BullMQ repeatable jobs.
- Role-based access control (ADMIN / USER).

### Log Events
- FETCH_START / FETCH_OK / FETCH_FAIL
- EXTRACT_OK / EXTRACT_FAIL
- UPSERT_PRODUCT / UPSERT_PRICE / UPSERT_RETAILER
- ALERT_EVALUATE / ALERT_NOTIFY
- EXEC_DONE / EXEC_FAIL

---

## 9. End-User Features

### MVP
- Search products with premium prioritization.
- Subscribe and receive alerts.
- Responsive UI (mobile-first).
- Light/dark themes.

### Phase 2+
- Watchlists and saved searches.
- Price history visualization.
- Multi-currency support.
- Deal scoring and product comparison.
- Personalized recommendations.
- Shareable links for affiliate tracking.

---

## 10. Admin Features

### MVP
- Execution monitoring dashboard.
- Manual and scheduled runs.
- Source activation toggle.
- Execution logs with filtering and search.

### Phase 2+
- Retailer success metrics.
- Error classification and retry management.
- Config editor for source intervals.
- Affiliate revenue dashboard.
- Audit trail of admin actions.

---

## 11. Non-Functional Requirements
- **Scalability:** Modular queue system.
- **Resilience:** Retry/backoff logic for failed jobs.
- **Security:** Role-based access and token validation.
- **Compliance:** Respect robots.txt and ToS of crawled sources.
- **Observability:** Structured logging and health endpoints.

---

## 12. Product Roadmap

### Phase 1 — MVP (Core Value)
**Users:** Search, alerts, subscriptions.  
**Admin:** Dashboard, manual runs, basic logs.  
**Infra:** PostgreSQL, Redis, BullMQ, Prisma, Tailwind, Stripe.

### Phase 2 — Product Intelligence & Engagement
**Users:** Watchlists, saved searches, price history, deal scores, multi-currency.  
**Admin:** Source analytics, error classification, alert analytics, config UI.  
**Infra:** Adaptive crawling, Prometheus metrics.

### Phase 3 — Premium Intelligence & DaaS
**Users:** Targeted crawls, real-time alerts, price velocity graphs, market trends, regional data.  
**Admin:** Affiliate dashboards, extractor rollback, advanced RBAC, onboarding wizard.  
**Infra:** Market-trend APIs, partner hooks, advanced alert routing.

### Phase 4 — Ecosystem & Optimization
**Users:** PWA mode, deep linking, ML recommendations.  
**Admin:** Source scoring, A/B testing, partner self-service portal.  
**Infra:** Automated anomaly detection, continuous optimization.

---

## 13. Acceptance Criteria (MVP)
- Admin can trigger and monitor crawls.
- Product search interleaves ads and prioritizes premium dealers.
- Alerts work with Stripe-tier distinction.
- System operates on an hourly crawl schedule.
- Fully responsive UI and functional local setup (`pnpm dev`).

---

## 14. Future Directions
- Integration with AI-driven extraction and summarization models.
- Expansion into retailer partnerships for data syndication.
- DaaS monetization and external API licensing.

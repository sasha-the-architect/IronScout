# Commands

This document lists the **canonical commands** for working with the IronScout codebase.
It is written for humans and coding agents.

Rules:
- Prefer workspace-wide commands where possible
- Avoid undocumented one-off scripts
- If a command is required, it must appear here

If this document conflicts with package.json scripts, package.json wins.

---

## Package Manager

IronScout uses a **pnpm monorepo**.

All examples use `pnpm`.

---

## Install

```bash
pnpm install
```

---

## Local Development

### Run all apps (if supported)

```bash
pnpm dev
```

---

### API

```bash
cd apps/api
pnpm dev
```

---

### Consumer Web

```bash
cd apps/web
pnpm dev
```

---

### Dealer Portal

```bash
cd apps/dealer
pnpm dev
```

---

### Admin Portal

```bash
cd apps/admin
pnpm dev
```

---

### Harvester

⚠️ Scheduler must be singleton.

```bash
cd apps/harvester
HARVESTER_SCHEDULER_ENABLED=false pnpm dev
```

---

### Bull Board (Queue Monitor)

Ops-only dashboard for monitoring BullMQ queues. Protected by HTTP Basic Auth.

```bash
cd apps/harvester
BULLBOARD_USERNAME=admin BULLBOARD_PASSWORD=<strong-password> pnpm bullboard:dev
```

Access at: `http://localhost:3939/admin/queues`

⚠️ **Security:**
- Never expose to the public internet
- Run behind firewall or VPN only
- Use strong, unique credentials
- See `context/02_monitoring_and_observability.md` for full documentation

---

## Database

```bash
pnpm prisma generate
pnpm prisma migrate dev
```

---

## Tests

```bash
pnpm test
```

---

## Linting & Formatting

```bash
pnpm lint
pnpm format
```

---

## Build

```bash
pnpm build
```

---

## Guiding Principle

> If an action is common, it must be scripted.

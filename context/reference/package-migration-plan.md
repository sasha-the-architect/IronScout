# Package Migration Plan

**Created:** 2025-12-29
**Status:** Planning

This document provides detailed migration plans for major package updates that require breaking changes.

---

## Priority Order

| Priority | Package | Current | Target | Risk | Effort |
|----------|---------|---------|--------|------|--------|
| 1 | vitest | 1.6.1 | 4.x | Medium | Low |
| 2 | zod | 3.x | 4.x | Medium | Medium |
| 3 | stripe | 13.x | 20.x | High | High |
| 4 | express | 4.x | 5.x | High | Medium |
| 5 | tailwindcss | 3.x | 4.x | High | High |
| 6 | openai | 4.x | 6.x | Low | Low |

---

## 1. Vitest (1.6.1 → 4.x)

**Affected:** `@ironscout/harvester`, `@ironscout/api`, `@ironscout/crypto`

### Breaking Changes
- Config file format changes
- Snapshot format updated
- `vi.mock()` hoisting behavior changed
- Coverage reporter API changes
- Node.js 18+ required

### Current Config (`apps/harvester/vitest.config.ts`)
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
    },
  },
})
```

### Migration Steps
1. Update vitest and related packages:
   ```bash
   pnpm add -D vitest@latest @vitest/coverage-v8@latest @vitest/ui@latest --filter @ironscout/harvester
   pnpm add -D vitest@latest --filter @ironscout/api --filter @ironscout/crypto
   ```

2. Update config (minimal changes expected - config is simple)

3. Update snapshots:
   ```bash
   pnpm --filter harvester test:run -- -u
   ```

4. Fix any failing tests due to mock hoisting changes

### Risk Assessment
- **Low risk** - Config is minimal, no complex mocking patterns observed
- 549 tests provide good coverage for regressions

---

## 2. Zod (3.x → 4.x)

**Affected:** `@ironscout/api`, `@ironscout/dealer`, `@ironscout/web`

### Breaking Changes
- `.parse()` now returns `readonly` arrays
- `.refine()` type inference changes
- Error formatting API changes
- `z.ZodType` generic parameter changes
- Some schema methods renamed

### Current Usage Pattern (from `apps/api/src/routes/payments.ts`)
```typescript
const createCheckoutSchema = z.object({
  priceId: z.string(),
  userId: z.string(),
  successUrl: z.string(),
  cancelUrl: z.string()
})

// Usage
const { priceId, userId, successUrl, cancelUrl } = createCheckoutSchema.parse(req.body)
```

### Files to Audit
```
apps/api/src/routes/*.ts        (17 files)
apps/dealer/app/api/**/*.ts     (multiple)
apps/web/                       (likely validation)
```

### Migration Steps
1. Install zod v4:
   ```bash
   pnpm add zod@4 --filter @ironscout/api --filter @ironscout/dealer --filter @ironscout/web
   ```

2. Run TypeScript compiler to find type errors:
   ```bash
   pnpm --filter @ironscout/api build
   ```

3. Common fixes:
   - Add `as const` for literal arrays if mutability needed
   - Update any custom error formatters
   - Check `.refine()` callbacks for type issues

4. Run API tests to validate

### Risk Assessment
- **Medium risk** - Simple schemas used, no complex refinements observed
- Type changes may surface at compile time

---

## 3. Stripe (13.x → 20.x)

**Affected:** `apps/api`, `apps/admin`, `apps/web`

### Breaking Changes (Major)
- **API version update**: `2023-08-16` → `2024-12-18.acacia`
- Type changes for `Stripe.Checkout.Session`, `Stripe.Subscription`, `Stripe.Invoice`
- `payment_method_types` deprecated in favor of automatic payment methods
- Webhook event structure changes
- ESM-first module system

### Current Usage (`apps/api/src/routes/payments.ts`)
```typescript
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-08-16'  // OLD - must update
})

// Checkout session creation
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  payment_method_types: ['card'],  // DEPRECATED
  line_items: [{ price: priceId, quantity: 1 }],
  // ...
})

// Webhook handling
const event = stripe.webhooks.constructEvent(req.body, sig, secret)
const session = event.data.object as Stripe.Checkout.Session
```

### Files to Update
- `apps/api/src/routes/payments.ts` (1755 lines)
- `apps/admin/app/dealers/[id]/actions.ts`
- `apps/web` (Stripe.js frontend)

### Migration Steps

#### Phase 1: Test Environment
1. Create Stripe test mode account for v20 testing
2. Update test webhook endpoints

#### Phase 2: Backend (apps/api)
1. Update stripe package:
   ```bash
   pnpm add stripe@20 --filter @ironscout/api
   ```

2. Update API version:
   ```typescript
   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
     apiVersion: '2024-12-18.acacia'
   })
   ```

3. Remove deprecated `payment_method_types`:
   ```typescript
   // Before
   const session = await stripe.checkout.sessions.create({
     payment_method_types: ['card'],
     // ...
   })

   // After
   const session = await stripe.checkout.sessions.create({
     // Remove payment_method_types - Stripe auto-selects
     // ...
   })
   ```

4. Update type casts for webhook events (review Stripe changelog)

5. Test all webhook handlers:
   - `checkout.session.completed`
   - `invoice.paid` / `invoice.payment_failed`
   - `customer.subscription.*`

#### Phase 3: Frontend (apps/web)
1. Update `@stripe/stripe-js`:
   ```bash
   pnpm add @stripe/stripe-js@latest --filter @ironscout/web
   ```

2. Review Stripe Elements usage for breaking changes

#### Phase 4: Admin (apps/admin)
1. Update stripe in admin app
2. Test dealer billing actions

### Risk Assessment
- **High risk** - Critical payment infrastructure
- **Requires Stripe test mode validation**
- **Recommend: Production deploy during low-traffic window**

---

## 4. Express (4.x → 5.x)

**Affected:** `@ironscout/api`, `@ironscout/harvester`

### Breaking Changes
- **Async middleware support** (promise rejections handled automatically)
- `res.status()` must be called before `res.json()`
- Removed deprecated methods: `res.send(status)`, `res.json(status, obj)`
- Query parser defaults changed
- RegExp path matching changes
- Node.js 18+ required

### Current Usage (`apps/api/src/index.ts`)
```typescript
import express, { Express } from 'express'
const app: Express = express()

// Error handler pattern
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.error('Unhandled error', { path: req.path, method: req.method }, err)
  res.status(500).json({ error: 'Something went wrong!' })
})
```

### Migration Steps

1. Update express and types:
   ```bash
   pnpm add express@5 --filter @ironscout/api --filter @ironscout/harvester
   pnpm add -D @types/express@5 --filter @ironscout/api
   ```

2. Update error handlers for async support:
   ```typescript
   // Express 5 catches async errors automatically
   app.get('/route', async (req, res) => {
     const data = await fetchData() // No try/catch needed
     res.json(data)
   })
   ```

3. Audit route handlers (17 route files):
   - Check for `res.send(status)` patterns (deprecated)
   - Ensure `res.status()` before `res.json()`

4. Update helmet and cors if needed (check compatibility)

5. Run full API test suite

### Risk Assessment
- **Medium risk** - Standard Express patterns used
- Error handling is consistent, async patterns minimal

---

## 5. Tailwind CSS (3.x → 4.x)

**Affected:** `apps/web`, `apps/admin`, `apps/dealer`

### Breaking Changes (Major Rewrite)
- **CSS-first configuration** - no more `tailwind.config.js`
- New `@theme` directive in CSS
- JIT mode is now the only mode
- PostCSS plugin API changes
- Color opacity syntax changes
- Container plugin removed (built-in)

### Current Config (`apps/web/tailwind.config.js`)
```javascript
module.exports = {
  darkMode: ["class"],
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        // ... many custom CSS variables
      },
      // Custom animations, fonts, etc.
    }
  },
  plugins: [require("tailwindcss-animate")]
}
```

### Migration Steps

#### Phase 1: Preparation
1. Audit custom theme usage across all apps
2. Document all custom colors, animations, fonts
3. Check `tailwindcss-animate` plugin compatibility

#### Phase 2: Create CSS-based Config
```css
/* New Tailwind 4 approach - app/globals.css */
@import "tailwindcss";

@theme {
  --color-border: hsl(var(--border));
  --color-primary: hsl(var(--primary));
  /* ... migrate all theme extensions */
}
```

#### Phase 3: Update Build Config
1. Update PostCSS config
2. Remove old `tailwind.config.js` files
3. Update `postcss.config.js`

#### Phase 4: Test Visual Regression
1. Screenshot critical pages before migration
2. Compare after migration
3. Fix any styling issues

### Risk Assessment
- **High risk** - Complete config rewrite
- **High effort** - 3 apps with custom themes
- **Recommendation:** Wait for ecosystem stability (plugins, shadcn/ui)

---

## 6. OpenAI (4.x → 6.x)

**Affected:** `@ironscout/api`

### Breaking Changes
- Response types restructured
- Streaming API changes
- Tool calling format updates
- Completion API deprecations

### Current Usage
- AI-assisted search
- Explanations generation
- Minimal direct API usage

### Migration Steps
1. Update package:
   ```bash
   pnpm add openai@6 --filter @ironscout/api
   ```

2. Review response type changes
3. Update any streaming handlers
4. Test AI features

### Risk Assessment
- **Low risk** - Limited usage, non-critical feature
- Can be done independently

---

## Recommended Migration Order

### Week 1: Low-Risk Updates
1. **Vitest 4.x** - Test framework, good safety net
2. **OpenAI 6.x** - Isolated, non-critical

### Week 2: Medium-Risk Updates
3. **Zod 4.x** - Schema validation, affects API
4. **Express 5.x** - Core framework, test thoroughly

### Week 3-4: High-Risk Updates
5. **Stripe 20.x** - Critical payments, requires full QA
6. **Tailwind 4.x** - Defer until ecosystem stable

---

## Testing Checklist

### Before Each Migration
- [ ] All tests passing
- [ ] Create git branch for migration
- [ ] Document current behavior

### After Each Migration
- [ ] All tests passing
- [ ] Manual smoke test critical paths
- [ ] Check for TypeScript errors
- [ ] Review console for deprecation warnings
- [ ] Deploy to staging first

### Stripe-Specific Testing
- [ ] Create test subscription
- [ ] Process test payment
- [ ] Trigger webhook events
- [ ] Cancel subscription flow
- [ ] Payment failure flow

---

## Rollback Plan

Each migration should be:
1. In its own branch/PR
2. Easily revertable via `git revert`
3. Deployed to staging before production

If issues arise in production:
1. Revert commit immediately
2. Redeploy previous version
3. Investigate in staging

---

## Environment Variables

No new environment variables required for these migrations.

Stripe API version is hardcoded - update in:
- `apps/api/src/routes/payments.ts` line 89

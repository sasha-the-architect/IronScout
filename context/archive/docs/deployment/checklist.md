# Pre-Deployment Checklist for Render.com

Use this checklist to ensure you have everything ready before deploying to Render.com.

## ☐ 1. Repository Setup

- [ ] All code committed to Git
- [ ] Pushed to GitHub/GitLab
- [ ] `render.yaml` is in repository root
- [ ] `.gitignore` includes sensitive files
- [ ] README.md is up to date

## ☐ 2. External Services Setup

### Stripe (Payment Processing)
- [ ] Created Stripe account
- [ ] Obtained Secret Key (`sk_test_...` or `sk_live_...`)
- [ ] Obtained Publishable Key (`pk_test_...` or `pk_live_...`)
- [ ] Will configure webhook after deployment *(URL needed from Render)*

### Resend (Email Service)
- [ ] Created Resend account
- [ ] Verified sender domain or email address
- [ ] Created API key
- [ ] Noted sender email address (FROM_EMAIL)

### Google OAuth (Social Login)
- [ ] Created Google Cloud project
- [ ] Enabled Google+ API
- [ ] Created OAuth 2.0 credentials
- [ ] Obtained Client ID
- [ ] Obtained Client Secret
- [ ] Will add redirect URIs after deployment *(URL needed from Render)*

### Anthropic (AI Extraction)
- [ ] Created Anthropic account
- [ ] Created API key
- [ ] Verified billing is set up (if needed)

## ☐ 3. Render.com Account

- [ ] Created Render.com account
- [ ] Connected GitHub/GitLab account
- [ ] Set up billing (if using paid plans)
- [ ] Verified email address

## ☐ 4. Redis Instance Creation

**IMPORTANT:** Redis must be created before deploying the Blueprint.

- [ ] Created Redis instance in Render dashboard
  - Name: `ironscout-redis`
  - Region: `Ohio` (or same as other services)
  - Plan: `Free` (or `Starter` for production)
  - Max Memory Policy: `noeviction`
- [ ] Noted Redis host (e.g., `red-xxxxx.ohio-redis.render.com`)
- [ ] Noted Redis port (typically `6379`)
- [ ] Redis instance showing "Available" status

## ☐ 5. Database Preparation

- [ ] Reviewed Prisma schema (`packages/db/schema.prisma`)
- [ ] All migrations created (`packages/db/prisma/migrations/`)
- [ ] Seed scripts ready (optional) (`packages/db/seed.ts`)
- [ ] Know which data to seed initially

## ☐ 6. Environment Variables Prepared

Have the following values ready to paste into Render dashboard:

### For API Service:
```
REDIS_HOST=_______________________________________________ (from Step 4)
REDIS_PORT=_______________________________________________ (from Step 4)
STRIPE_SECRET_KEY=________________________________________
STRIPE_WEBHOOK_SECRET=____________________________________ (after webhook setup)
RESEND_API_KEY=___________________________________________
FROM_EMAIL=_______________________________________________
```

### For Web Service:
```
GOOGLE_CLIENT_ID=_________________________________________
GOOGLE_CLIENT_SECRET=_____________________________________
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=_______________________
```

### For Harvester Worker:
```
REDIS_HOST=_______________________________________________ (from Step 4)
REDIS_PORT=_______________________________________________ (from Step 4)
ANTHROPIC_API_KEY=________________________________________
RESEND_API_KEY=___________________________________________
FROM_EMAIL=_______________________________________________
```

## ☐ 7. Code Verification

- [ ] All services build locally without errors:
  ```bash
  cd apps/api && pnpm build
  cd apps/web && pnpm build
  cd apps/harvester && pnpm build
  ```
- [ ] TypeScript compilation passes:
  ```bash
  pnpm type-check
  ```
- [ ] Health check endpoint works:
  ```bash
  # Start API locally
  cd apps/api && pnpm dev
  # Test in another terminal
  curl http://localhost:8000/health
  ```

## ☐ 8. Review render.yaml

- [ ] Service names are unique
- [ ] Build commands are correct
- [ ] Start commands are correct
- [ ] All environment variable references are correct
- [ ] Database connection strings are properly referenced
- [ ] Selected appropriate plans (free/starter/standard)

## ☐ 9. Documentation Review

- [ ] Read DEPLOYMENT.md completely
- [ ] Understand the architecture diagram
- [ ] Know how to access logs
- [ ] Know how to run migrations
- [ ] Know how to set environment variables

## Post-Deployment Steps (Do After Deploying)

## ☐ 10. Initial Deployment Verification

- [ ] All services show "Live" status in Render dashboard
- [ ] No errors in logs
- [ ] Database is provisioned
- [ ] Redis is provisioned

## ☐ 11. Database Setup

- [ ] Connected to API service shell
- [ ] Ran migrations:
  ```bash
  cd packages/db && pnpm prisma migrate deploy
  ```
- [ ] Verified migrations completed successfully
- [ ] Seeded initial data (if needed):
  ```bash
  pnpm db:seed
  ```

## ☐ 12. Stripe Webhook Configuration

- [ ] Copied API service URL from Render dashboard
- [ ] Created webhook in Stripe dashboard:
  - Endpoint URL: `https://your-api.onrender.com/api/payments/webhook`
  - Selected events:
    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
- [ ] Copied webhook signing secret
- [ ] Added `STRIPE_WEBHOOK_SECRET` to API service environment variables
- [ ] Service auto-redeployed after adding secret

## ☐ 13. OAuth Redirect URIs

### Google OAuth
- [ ] Added redirect URI to Google Cloud Console:
  - `https://your-web-app.onrender.com/api/auth/callback/google`
- [ ] Tested Google login on deployed site

### Other Providers (if configured)
- [ ] Facebook redirect URI configured
- [ ] Twitter redirect URI configured
- [ ] GitHub redirect URI configured

## ☐ 14. Service Verification

### API Service
- [ ] Health check returns 200:
  ```bash
  curl https://your-api.onrender.com/health
  ```
- [ ] Can connect to database
- [ ] Can connect to Redis
- [ ] CORS allows requests from web frontend

### Web Service
- [ ] Homepage loads successfully
- [ ] Can navigate to different pages
- [ ] API calls work (check Network tab)
- [ ] Authentication works (Google login)
- [ ] Static assets load properly

### Harvester Worker
- [ ] Logs show "All 6 workers started successfully"
- [ ] No connection errors to Redis
- [ ] No connection errors to database
- [ ] Can process test jobs (check admin console)

## ☐ 15. Feature Testing

- [ ] User can sign up with email/password
- [ ] User can sign in with Google
- [ ] User can search for products
- [ ] Product cards display correctly
- [ ] User can create price alerts
- [ ] User can view pricing page
- [ ] User can checkout with Stripe (test mode)
- [ ] Admin console is accessible
- [ ] Can view execution logs in admin console

## ☐ 16. Monitoring Setup

- [ ] Reviewed logs for all services
- [ ] Set up log alerts for errors
- [ ] Configured uptime monitoring (optional)
- [ ] Set up error tracking (e.g., Sentry) - optional
- [ ] Configured Render alerts:
  - [ ] Service crashes
  - [ ] High error rates
  - [ ] Resource limits

## ☐ 17. Security

- [ ] All secrets are set via Render dashboard (not in code)
- [ ] Database has SSL enabled (default on Render)
- [ ] API has rate limiting (check code)
- [ ] CORS is properly configured
- [ ] Environment variables reviewed for security

## ☐ 18. Performance

- [ ] Page load times are acceptable
- [ ] API response times are acceptable
- [ ] Database queries are optimized
- [ ] Consider upgrading from free tier if needed

## ☐ 19. Backup Strategy

- [ ] Verified automatic database backups are enabled
- [ ] Know how to restore from backup
- [ ] Documented backup retention policy
- [ ] Consider manual backup for critical data

## ☐ 20. Documentation

- [ ] Updated README.md with production URL
- [ ] Documented any production-specific configuration
- [ ] Team knows how to access Render dashboard
- [ ] Team knows how to view logs
- [ ] Team knows how to deploy updates

## ☐ 21. Go Live Preparation (Production Only)

- [ ] Switch Stripe from test to live keys
- [ ] Switch all OAuth apps from test to production
- [ ] Update redirect URIs to production domain
- [ ] Point custom domain to Render (if applicable)
- [ ] Set up SSL certificate (automatic on Render)
- [ ] Update DNS records
- [ ] Test with production data
- [ ] Announce launch!

---

## Quick Reference Commands

### View Logs
```bash
# In Render dashboard
1. Select service
2. Click "Logs" tab
```

### Run Migrations
```bash
# In API service shell on Render
cd packages/db
pnpm prisma migrate deploy
```

### Restart Service
```bash
# In Render dashboard
1. Select service
2. Click "Manual Deploy" → "Deploy latest commit"
```

### Update Environment Variable
```bash
# In Render dashboard
1. Select service
2. Go to "Environment" tab
3. Edit or add variable
4. Click "Save Changes" (auto-redeploys)
```

---

**Ready to Deploy?** If you've checked all items above, proceed to [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

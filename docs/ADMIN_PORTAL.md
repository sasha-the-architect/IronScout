# Admin Portal Documentation

The IronScout Admin Portal provides administrative oversight for dealer management, analytics, and system settings.

## URLs

| Environment | URL |
|-------------|-----|
| Production | https://admin.ironscout.ai |
| Render (direct) | https://ironscout-admin.onrender.com |
| Local | http://localhost:3001 |

## Architecture

The admin portal is a separate Next.js application that shares authentication with the main web app via JWT cookies.

```
┌─────────────────────┐     ┌─────────────────────┐
│   ironscout.ai      │     │ admin.ironscout.ai  │
│   (Web App)         │     │   (Admin Portal)    │
│                     │     │                     │
│  ┌───────────────┐  │     │  ┌───────────────┐  │
│  │   NextAuth    │  │     │  │  JWT Verify   │  │
│  │   (login)     │──┼─────┼─▶│  (read-only)  │  │
│  └───────────────┘  │     │  └───────────────┘  │
│         │           │     │         │           │
│         ▼           │     │         ▼           │
│  ┌───────────────┐  │     │  ┌───────────────┐  │
│  │ JWT Cookie    │  │     │  │ Check email   │  │
│  │ domain:       │  │     │  │ in ADMIN_     │  │
│  │ .ironscout.ai │  │     │  │ EMAILS list   │  │
│  └───────────────┘  │     │  └───────────────┘  │
└─────────────────────┘     └─────────────────────┘
```

## Authentication Flow

1. **User visits admin.ironscout.ai**
2. **No cookie?** → Auto-redirect to `ironscout.ai/auth/signin?callbackUrl=admin.ironscout.ai`
3. **User logs in** with Google OAuth at main site
4. **Cookie set** with `domain: .ironscout.ai` (shared across subdomains)
5. **Redirect back** to admin.ironscout.ai
6. **Admin app verifies:**
   - JWT signature matches `NEXTAUTH_SECRET`
   - Email is in `ADMIN_EMAILS` list
7. **Access granted** or denied

## Environment Variables

### Admin App (`apps/admin`)

```env
# Required - must match web app
NEXTAUTH_SECRET=your-secret-here
# or
AUTH_SECRET=your-secret-here

# Required - comma-separated admin emails
ADMIN_EMAILS=admin@example.com,jeb@ironscout.ai

# Optional - for redirect URLs
NEXT_PUBLIC_WEB_URL=https://ironscout.ai
NEXT_PUBLIC_ADMIN_URL=https://admin.ironscout.ai

# Optional - enable debug logging
ADMIN_DEBUG=true
```

### Web App (`apps/web`)

```env
# Required for cross-subdomain cookies
COOKIE_DOMAIN=.ironscout.ai

# Optional - allow redirect after login
ADMIN_URL=https://admin.ironscout.ai
```

## Local Development

Run admin on a different port:

```bash
# Terminal 1 - Web app
cd apps/web
pnpm dev  # runs on :3000

# Terminal 2 - Admin app
cd apps/admin
pnpm dev -p 3001  # runs on :3001
```

Set local env vars in `apps/admin/.env.local`:
```env
NEXTAUTH_SECRET=your-dev-secret
ADMIN_EMAILS=your@email.com
NEXT_PUBLIC_WEB_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3001
```

## Deployment (Render)

### Custom Domain Setup

1. **Upgrade Render plan** (free tier = 1 custom domain)
2. **Add custom domain in Render:**
   - Dashboard → ironscout-admin → Settings → Custom Domains
   - Add `admin.ironscout.ai`
3. **Add DNS record in Cloudflare:**
   ```
   Type: CNAME
   Name: admin
   Target: ironscout-admin.onrender.com
   Proxy: OFF (gray cloud) ← Important for SSL
   ```
4. **Wait for SSL** (~1-2 minutes)

### Environment Variables in Render

Set these in the admin service:
- `NEXTAUTH_SECRET` (same as web app)
- `ADMIN_EMAILS` (comma-separated)
- `DATABASE_URL` (from Render PostgreSQL)

## Features

### Dealer Management (`/dealers`)
- View all registered dealers
- Pending approval queue
- Approve/reject dealers
- Suspend active dealers
- View dealer details (SKUs, feeds, etc.)

### Analytics (`/analytics`)
- Platform usage metrics
- Price tracking statistics
- User growth charts

### Settings (`/settings`)
- System configuration
- Admin user management

## Debug Endpoint

When `ADMIN_DEBUG=true`, visit `/api/debug` to diagnose issues:

```json
{
  "environment": {
    "NODE_ENV": "production",
    "hasNextAuthSecret": true,
    "secretLength": 32,
    "adminEmailsConfigured": true,
    "adminEmailsCount": 2,
    "adminEmails": ["admin@example.com", "jeb@ironscout.ai"]
  },
  "cookies": {
    "expectedCookieName": "__Secure-authjs.session-token",
    "availableCookieNames": ["__Secure-authjs.session-token"],
    "hasSessionCookie": true,
    "sessionCookieLength": 485
  },
  "hints": []
}
```

## Troubleshooting

### "Admin Access Required" shown even when logged in

1. **Check cookie is present:** Browser DevTools → Application → Cookies
2. **Check domain:** Cookie should have `domain: .ironscout.ai`
3. **Check email:** Your email must be in `ADMIN_EMAILS`
4. **Check secrets match:** `NEXTAUTH_SECRET` must be identical between apps

### "Error 1016" from Cloudflare

DNS record missing. Add CNAME in Cloudflare pointing to Render URL.

### SSL certificate error

Cloudflare proxy is ON. Turn it OFF (gray cloud) so Render can provision SSL.

### Cookie not shared between domains

This is expected for different root domains (e.g., `ironscout.ai` vs `onrender.com`). 
Cookie sharing only works on subdomains of the same root domain.

## Security Considerations

1. **Admin emails hardcoded** - Only accounts in `ADMIN_EMAILS` can access
2. **OAuth required** - Admins must use Google OAuth (no password login)
3. **JWT verification** - Cookie is cryptographically verified
4. **Audit logging** - All admin actions logged to `AdminAuditLog` table

## File Structure

```
apps/admin/
├── app/
│   ├── api/
│   │   ├── dealers/     # Dealer management API
│   │   └── debug/       # Debug endpoint
│   ├── analytics/       # Analytics page
│   ├── dealers/         # Dealer management UI
│   ├── settings/        # Settings page
│   ├── layout.tsx       # Root layout with auth check
│   └── page.tsx         # Redirects to /dealers
├── components/          # UI components
├── lib/
│   ├── auth.ts         # JWT verification
│   ├── email.ts        # Email notifications
│   ├── logger.ts       # Structured logging
│   └── utils.ts        # Utilities
└── package.json
```

## Related Files

- **Web app auth:** `apps/web/lib/auth.ts`
- **Database models:** `packages/db/schema.prisma` (Dealer, AdminAuditLog)
- **Render config:** `render.yaml` (ironscout-admin service)

---
*Last updated: December 10, 2025*

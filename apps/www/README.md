# IronScout WWW

Static marketing site for IronScout.ai - separated from the main app for independent deployments.

## Architecture

```
www.ironscout.ai (this package) - Static marketing
├── Landing page with search (redirects to app)
├── Features / Comparison / How it works
├── Privacy & Terms
└── Future: Blog, guides, long-tail SEO pages

app.ironscout.ai (apps/web) - Dynamic app
├── Search results
├── Dashboard
├── Alerts & watchlists
└── Account management
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Run development server (port 3002)
pnpm dev

# Build for production (static export)
pnpm build
```

## Deployment (Render)

1. Create new **Static Site** on Render
2. Connect to your repo
3. Root directory: `apps/www`
4. Build command: `pnpm install && pnpm build`
5. Publish directory: `out`
6. Add custom domain: `www.ironscout.ai`

## Configuration

Update `APP_URL` in `app/page.tsx` if your app domain changes:

```typescript
const APP_URL = 'https://app.ironscout.ai';
```

## Structure

```
www/
├── app/
│   ├── layout.tsx      # Root layout with fonts & meta
│   ├── page.tsx        # Landing page (Hero, Features, Comparison, How it Works, CTA)
│   ├── privacy/        # Privacy policy
│   └── terms/          # Terms of service
├── public/
│   ├── robots.txt
│   └── sitemap.xml
└── tailwind.config.ts  # IronScout brand colors (iron, brass, gunmetal)
```

## Cross-Domain Auth

Users searching from www get redirected to app.ironscout.ai. Your existing cross-subdomain 
auth (shared cookies on `.ironscout.ai`) means authenticated users stay logged in.

## TODO

- [ ] Connect waitlist form to backend API
- [ ] Add favicon and OG images
- [ ] Add /about page
- [ ] Add /dealers page (for dealer acquisition)
- [ ] Blog/content section (later phase for SEO)


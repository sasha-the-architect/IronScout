# Web Application

The Web App (`apps/web/`) is the consumer-facing Next.js frontend for IronScout.ai.

## Overview

- **Framework**: Next.js 14 with App Router
- **Port**: 3000 (default)
- **Styling**: Tailwind CSS + Shadcn/UI
- **Auth**: NextAuth.js with Google OAuth plus email/password (admins must use OAuth; admin emails are blocked from credentials login). Other providers can be added later.

---

## Architecture

```
apps/web/
├── app/                      # Next.js App Router
│   ├── page.tsx              # Home page
│   ├── layout.tsx            # Root layout
│   ├── search/               # Search pages
│   ├── product/[id]/         # Product detail
│   ├── alerts/               # Alert management
│   ├── pricing/              # Subscription plans
│   ├── auth/                 # Auth pages
│   └── admin/                # Admin console
├── components/
│   ├── ui/                   # Shadcn/UI primitives
│   ├── search/               # Search components
│   ├── product/              # Product components
│   ├── pricing/              # Pricing components
│   └── layout/               # Layout components
├── lib/
│   ├── api.ts                # API client
│   └── auth.ts               # NextAuth config
├── public/                   # Static assets
└── styles/                   # Global styles
```

---

## Starting the App

```bash
cd apps/web

# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

---

## Key Pages

### Home (`/`)

Landing page with:
- Hero section
- Search bar
- Featured products
- Value proposition

### Search (`/search`)

AI-powered search with:
- Natural language input
- Filter sidebar
- Result grid
- Premium badges (PREMIUM users)

### Product Detail (`/product/[id]`)

Product page with:
- Price comparison table
- Price history chart (PREMIUM)
- Alert creation
- Similar products

### Pricing (`/pricing`)

Subscription plans:
- FREE tier features
- PREMIUM tier features
- Stripe checkout integration

### Alerts (`/alerts`)

User's price alerts:
- Active alerts list
- Create new alert
- Edit/delete alerts
- Tier limits display

### Admin Console (`/admin`)

Internal admin tools:
- Embedding stats
- Ballistic field coverage
- Backfill triggers
- Debug endpoints

---

## Authentication

### NextAuth.js Configuration (Google + email/password; admin safeguards)

**File**: `lib/auth.ts`

```typescript
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    // Email/password for consumers (non-admins)
    CredentialsProvider({
      /* ... */
    }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // Future: additional OAuth providers can be added behind env guards
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
```

**Admin safeguard:** admin emails (from `ADMIN_EMAILS`) are blocked from credentials sign-in and must authenticate via OAuth to ensure verified identity and shared cookies across subdomains.

### Using Session

```typescript
// Server Component
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function Page() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  return <div>Hello {session.user.name}</div>;
}

// Client Component
'use client';
import { useSession } from 'next-auth/react';

export function UserMenu() {
  const { data: session } = useSession();
  // ...
}
```

---

## API Client

**File**: `lib/api.ts`

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function searchProducts(query: string, filters?: SearchFilters) {
  const res = await fetch(`${API_URL}/api/search/semantic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,  // From session
    },
    body: JSON.stringify({ query, filters }),
  });
  return res.json();
}

export async function createAlert(productId: string, targetPrice: number) {
  // ...
}

export async function getUserAlerts() {
  // ...
}
```

---

## Components

### UI Components (Shadcn/UI)

Located in `components/ui/`:
- Button
- Input
- Card
- Dialog
- Select
- Badge
- Toast
- etc.

### Search Components

- `SearchBar` - Main search input with suggestions
- `SearchFilters` - Filter sidebar
- `SearchResults` - Product grid
- `ProductCard` - Individual product display
- `PremiumBadge` - Premium feature indicator

### Product Components

- `PriceTable` - Price comparison across retailers
- `PriceChart` - Historical price graph (PREMIUM)
- `AlertForm` - Create/edit alert
- `SimilarProducts` - Related items

---

## Tier-Based Features

### FREE Tier

- Basic search
- 20 results max
- Create up to 5 alerts
- Basic product info

### PREMIUM Tier

- AI-powered search
- 100 results max
- Unlimited alerts
- Price history charts
- Best Value scores
- Performance badges
- Premium filters

### Checking Tier in Components

```typescript
// Server Component
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { tier: true }
});

const isPremium = user?.tier === 'PREMIUM';

// Client Component
const { data: user } = useUser();
const isPremium = user?.tier === 'PREMIUM';
```

---

## Styling

### Tailwind Configuration

**File**: `tailwind.config.js`

```javascript
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { /* brand colors */ },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

### CSS Variables

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  /* ... */
}
```

---

## Environment Variables

```env
# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret"

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# API
NEXT_PUBLIC_API_URL="http://localhost:8000"

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

---

## Deployment

### Build

```bash
pnpm build
```

### Static Export (if applicable)

```bash
pnpm build
# Output in .next/
```

### Environment

Set production environment variables:
- `NEXTAUTH_URL` = `https://ironscout.ai`
- `NEXT_PUBLIC_API_URL` = `https://api.ironscout.ai`

---

## Adding New Pages

1. Create page file in `app/[route]/page.tsx`
2. Add any required components
3. Implement data fetching (Server Components preferred)
4. Add authentication if needed

```typescript
// app/example/page.tsx
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function ExamplePage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold">Example Page</h1>
      {/* Content */}
    </div>
  );
}
```

---

*Last updated: December 14, 2024*

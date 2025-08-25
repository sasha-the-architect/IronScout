# ZeroedIn - AI-Powered Shopping Assistant

ZeroedIn is a modern, AI-native web application that serves as a proactive, personalized purchasing assistant. The platform helps users find the best deals through intelligent price monitoring, real-time alerts, and AI-powered recommendations.

## 🚀 Features

### MVP Features
- **Smart Product Search**: AI-powered search across millions of products
- **Real-time Price Alerts**: Get notified when prices drop on products you're watching
- **Premium Retailer Priority**: Enhanced visibility for premium dealer partners
- **Responsive Design**: Fully responsive UI that works on all devices
- **User Authentication**: Secure login with NextAuth.js
- **Subscription Management**: Stripe-powered billing and subscription handling

### Monetization Strategy
- **User Subscriptions**: Free and Premium tiers with different alert capabilities
- **Dealer Partnerships**: Premium placement and enhanced visibility for retailers
- **Affiliate Revenue**: Commission from purchases through tracked links
- **Display Advertising**: Contextual ads mixed with search results

### Post-MVP Features (Stubs Included)
- **Data as a Service (DaaS)**: API access for market trends and price velocity data
- **Advanced Analytics**: Detailed market insights and reporting
- **Enterprise Solutions**: White-label options and custom integrations

## 🏗️ Architecture

This project is built as a modern monorepo using:

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS with Shadcn/UI components
- **Authentication**: NextAuth.js
- **Payments**: Stripe SDK
- **Package Management**: pnpm workspaces

### Project Structure

```
ZeroedIn/
├── apps/
│   ├── api/                 # Express.js backend API
│   │   ├── src/
│   │   │   ├── routes/      # API route handlers
│   │   │   └── index.ts     # Main server file
│   │   └── package.json
│   └── web/                 # Next.js frontend application
│       ├── app/             # Next.js app router pages
│       ├── components/      # React components
│       ├── lib/             # Utility functions and API clients
│       └── package.json
├── packages/
│   └── db/                  # Shared database schema and utilities
│       ├── schema.prisma    # Prisma database schema
│       └── index.ts         # Database client exports
├── package.json             # Root package.json with workspace config
└── pnpm-workspace.yaml     # pnpm workspace configuration
```

## 🛠️ Local Development Setup

### Prerequisites

- Node.js 18+ 
- pnpm 8+
- PostgreSQL 14+

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ZeroedIn
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   # Copy environment files
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   
   # Edit the files with your actual values
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma client
   cd packages/db
   pnpm db:generate
   
   # Run database migrations
   pnpm db:migrate
   ```

5. **Start the development servers**
   ```bash
   # From the root directory
   pnpm dev
   ```

   This will start:
   - API server on http://localhost:8000
   - Web application on http://localhost:3000

### Environment Variables

#### Root `.env`
```env
DATABASE_URL="postgresql://username:password@localhost:5432/zeroedin"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
STRIPE_PUBLISHABLE_KEY="pk_test_your-stripe-publishable-key"
STRIPE_SECRET_KEY="sk_test_your-stripe-secret-key"
STRIPE_WEBHOOK_SECRET="whsec_your-webhook-secret"
API_URL="http://localhost:8000"
```

#### API `.env` (`apps/api/.env`)
```env
DATABASE_URL="postgresql://username:password@localhost:5432/zeroedin"
STRIPE_SECRET_KEY="sk_test_your-stripe-secret-key"
STRIPE_WEBHOOK_SECRET="whsec_your-webhook-secret"
FRONTEND_URL="http://localhost:3000"
PORT=8000
```

#### Web `.env.local` (`apps/web/.env.local`)
```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_your-stripe-publishable-key"
```

## 📱 Responsive Design

The application is built with a mobile-first approach using Tailwind CSS responsive utilities:

- **Mobile**: Single column layouts, collapsible navigation
- **Tablet**: 2-3 column grids, expanded navigation
- **Desktop**: 4-5 column grids, full navigation, sidebar layouts

Key responsive breakpoints:
- `sm:` 640px and up
- `md:` 768px and up  
- `lg:` 1024px and up
- `xl:` 1280px and up

## 🔧 Available Scripts

### Root Level
- `pnpm dev` - Start all development servers
- `pnpm build` - Build all applications
- `pnpm lint` - Run linting across all packages

### Database (`packages/db`)
- `pnpm db:generate` - Generate Prisma client
- `pnpm db:push` - Push schema changes to database
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Prisma Studio

### API (`apps/api`)
- `pnpm dev` - Start API development server
- `pnpm build` - Build API for production
- `pnpm start` - Start production API server

### Web (`apps/web`)
- `pnpm dev` - Start Next.js development server
- `pnpm build` - Build Next.js application
- `pnpm start` - Start production Next.js server
- `pnpm lint` - Run ESLint

## 🗄️ Database Schema

The application uses PostgreSQL with Prisma ORM. Key models include:

- **User**: User accounts with tier-based permissions
- **Product**: Product catalog with categories and brands
- **Retailer**: Retailer information with tier-based prioritization
- **Price**: Price tracking across retailers
- **Alert**: User-created price alerts
- **Advertisement**: Sponsored content and ads
- **Subscription**: User and retailer subscription management

### Post-MVP Models (Stubs)
- **DataSubscription**: DaaS API access management
- **MarketReport**: Market analysis and trends data

## 🎨 UI Components

Built with Shadcn/UI and Tailwind CSS:

- **Layout**: Header, Footer, responsive navigation
- **Forms**: Search, filters, authentication
- **Cards**: Product cards, ad cards, dashboard widgets
- **Data Display**: Tables, charts, statistics
- **Feedback**: Alerts, toasts, loading states

## 🔐 Authentication & Authorization

- **NextAuth.js** for authentication
- **Google OAuth** provider (configurable)
- **JWT sessions** for stateless authentication
- **Role-based access** (FREE/PREMIUM users)

## 💳 Payment Integration

- **Stripe** for subscription management
- **Webhook handling** for subscription events
- **Multiple subscription tiers** (Free, Premium, Pro)
- **Dealer subscription plans** (Standard, Premium, Enterprise)

## 🚀 Deployment

The application is designed to be deployed on modern platforms:

- **Frontend**: Vercel, Netlify, or similar
- **Backend**: Railway, Render, or containerized deployment
- **Database**: PostgreSQL on Railway, Supabase, or managed service

## 📈 Monitoring & Analytics

- **Error tracking**: Ready for Sentry integration
- **Performance monitoring**: Web Vitals tracking
- **User analytics**: Event tracking setup
- **Business metrics**: Revenue and usage tracking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation in `/docs`

---

Built with ❤️ by the ZeroedIn team

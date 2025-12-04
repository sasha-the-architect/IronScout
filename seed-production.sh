#!/bin/bash
# Seed Production Database Script
# This script seeds the production database with test data

# Exit on error
set -e

echo "🌱 Seeding Production Database..."
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL environment variable not set"
  echo "Please set it to your Render production database URL:"
  echo "  export DATABASE_URL='postgresql://user:pass@host/database'"
  exit 1
fi

echo "Using database: $DATABASE_URL"
echo ""

# Navigate to db package
cd packages/db

echo "Step 1: Seeding retailers..."
pnpm db:seed-retailers

echo ""
echo "Step 2: Seeding comprehensive products (657 products)..."
pnpm db:seed-comprehensive

echo ""
echo "Step 3: Seeding price history (90 days)..."
pnpm db:seed-price-history

echo ""
echo "✅ Production database seeded successfully!"
echo ""
echo "Next steps:"
echo "1. Test search on Render: https://ironscout-web.onrender.com/search?q=ammo"
echo "2. Products should now appear in search results"

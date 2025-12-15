#!/bin/bash

# IronScout.ai System Test Script
# This script helps verify each component is working

set -e

echo "======================================"
echo "IronScout.ai System Test"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check Redis
echo -n "1. Testing Redis connection... "
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "   Redis is not running. Install and start it:"
    echo "   sudo apt install redis-server"
    echo "   sudo service redis-server start"
    exit 1
fi

# Test 2: Check PostgreSQL
echo -n "2. Testing PostgreSQL connection... "
if cd packages/db && npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
    cd ../..
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "   Check DATABASE_URL in packages/db/.env"
    exit 1
fi

# Test 3: Check Prisma Client
echo -n "3. Checking Prisma client... "
if [ -d "node_modules/.prisma/client" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${YELLOW}⚠ Generating...${NC}"
    cd packages/db
    pnpm db:generate
    cd ../..
    echo -e "${GREEN}✓ PASS${NC}"
fi

# Test 4: Check for migrations
echo -n "4. Checking database schema... "
cd packages/db
if npx prisma db execute --stdin <<< "SELECT 1 FROM sources LIMIT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
    cd ../..
else
    echo -e "${YELLOW}⚠ Running migrations...${NC}"
    pnpm db:migrate
    cd ../..
    echo -e "${GREEN}✓ PASS${NC}"
fi

# Test 5: Check for test source
echo -n "5. Checking for test source... "
cd packages/db
SOURCE_COUNT=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM sources;" 2>/dev/null | grep -o '[0-9]*' | head -1 || echo "0")
cd ../..
if [ "$SOURCE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ PASS (${SOURCE_COUNT} sources)${NC}"
else
    echo -e "${YELLOW}⚠ Seeding...${NC}"
    cd packages/db
    pnpm db:seed-source
    cd ../..
    echo -e "${GREEN}✓ PASS${NC}"
fi

# Test 6: Check API dependencies
echo -n "6. Checking API dependencies... "
if [ -d "apps/api/node_modules" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${YELLOW}⚠ Installing...${NC}"
    pnpm install
    echo -e "${GREEN}✓ PASS${NC}"
fi

# Test 7: Check harvester dependencies
echo -n "7. Checking harvester dependencies... "
if [ -d "apps/harvester/node_modules" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${YELLOW}⚠ Installing...${NC}"
    pnpm install
    echo -e "${GREEN}✓ PASS${NC}"
fi

echo ""
echo "======================================"
echo -e "${GREEN}All checks passed!${NC}"
echo "======================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Start harvester workers (Terminal 1):"
echo "   cd apps/harvester && pnpm worker"
echo ""
echo "2. Start API server (Terminal 2):"
echo "   cd apps/api && pnpm dev"
echo ""
echo "3. Start web frontend (Terminal 3):"
echo "   cd apps/web && pnpm dev"
echo ""
echo "4. Access admin console:"
echo "   http://localhost:3000/admin"
echo ""
echo "5. Trigger a test crawl:"
echo "   Go to Sources → Click 'Run Now' on test source"
echo ""

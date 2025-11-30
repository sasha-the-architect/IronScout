#!/bin/bash

# ZeroedIn Stripe Setup Helper Script
# This script helps you configure Stripe for local development

echo "=================================="
echo "ZeroedIn Stripe Setup Helper"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Stripe CLI Installation${NC}"
echo ""
echo "Stripe CLI is needed to test webhooks locally."
echo "Download it from: https://github.com/stripe/stripe-cli/releases"
echo ""
echo "For Windows (PowerShell as Administrator):"
echo "  scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git"
echo "  scoop install stripe"
echo ""
echo "Or download the .zip file directly from GitHub releases and add to PATH"
echo ""
read -p "Press Enter once Stripe CLI is installed..."

# Check if Stripe CLI is available
if command -v stripe &> /dev/null; then
    echo -e "${GREEN}✓ Stripe CLI found!${NC}"
else
    echo -e "${RED}✗ Stripe CLI not found in PATH. Please install it first.${NC}"
    echo "After installing, you may need to restart your terminal."
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Login to Stripe${NC}"
echo ""
echo "This will open your browser to authenticate with Stripe."
read -p "Press Enter to login to Stripe..."
stripe login

echo ""
echo -e "${YELLOW}Step 3: Get Stripe Keys${NC}"
echo ""
echo "Please visit: https://dashboard.stripe.com/test/apikeys"
echo ""
echo "You'll need TWO keys:"
echo "  1. Publishable key (pk_test_...)"
echo "  2. We already have your Secret key"
echo ""
read -p "Enter your Publishable Key (pk_test_...): " PUBLISHABLE_KEY

# Update web .env.local
if [ -f "apps/web/.env.local" ]; then
    # Check if the key already exists
    if grep -q "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=" apps/web/.env.local; then
        # Replace existing key
        sed -i "s|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\"$PUBLISHABLE_KEY\"|" apps/web/.env.local
    else
        # Add key if not exists
        echo "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\"$PUBLISHABLE_KEY\"" >> apps/web/.env.local
    fi
    echo -e "${GREEN}✓ Publishable key saved to apps/web/.env.local${NC}"
else
    echo -e "${RED}✗ apps/web/.env.local not found${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 4: Create Premium Product in Stripe${NC}"
echo ""
echo "Please do this manually in Stripe Dashboard:"
echo "  1. Visit: https://dashboard.stripe.com/test/products"
echo "  2. Click '+ Add product'"
echo "  3. Name: ZeroedIn Premium"
echo "  4. Description: Premium subscription with unlimited alerts"
echo "  5. Pricing: Recurring, \$9.99/month"
echo "  6. Click 'Save product'"
echo ""
read -p "Press Enter once you've created the product..."
echo ""
read -p "Enter the Price ID (price_...): " PRICE_ID

# Update API .env
if [ -f "apps/api/.env" ]; then
    # Check if the key already exists
    if grep -q "STRIPE_PRICE_ID_PREMIUM=" apps/api/.env; then
        # Replace existing key
        sed -i "s|STRIPE_PRICE_ID_PREMIUM=.*|STRIPE_PRICE_ID_PREMIUM=\"$PRICE_ID\"|" apps/api/.env
    else
        # Add key if not exists
        echo "" >> apps/api/.env
        echo "# Stripe Product IDs" >> apps/api/.env
        echo "STRIPE_PRICE_ID_PREMIUM=\"$PRICE_ID\"" >> apps/api/.env
    fi
    echo -e "${GREEN}✓ Price ID saved to apps/api/.env${NC}"
else
    echo -e "${RED}✗ apps/api/.env not found${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 5: Setup Webhook Forwarding${NC}"
echo ""
echo "Starting webhook listener..."
echo "This will forward Stripe webhooks to your local API server."
echo ""
echo -e "${YELLOW}IMPORTANT: Keep this running in a separate terminal!${NC}"
echo ""
echo "The webhook signing secret will be displayed."
echo "Copy it and add to apps/api/.env as STRIPE_WEBHOOK_SECRET"
echo ""
read -p "Press Enter to start webhook forwarding..."

# Start webhook forwarding
stripe listen --forward-to localhost:8000/api/payments/webhook

# This will keep running until Ctrl+C

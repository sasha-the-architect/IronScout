#!/bin/bash
# IronScout Local Domain Setup Script (macOS/Linux)
#
# This script sets up local domain aliases for development:
# - Installs mkcert certificates
# - Updates hosts file
# - Creates .env.local.domains files
#
# Run with sudo for hosts file modification
#
# Usage: sudo ./scripts/dev/setup-local-domains.sh

set -e

DOMAINS=(
    "www.ironscout.local"
    "app.ironscout.local"
    "api.ironscout.local"
    "admin.ironscout.local"
    "merchant.ironscout.local"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CERTS_DIR="$PROJECT_ROOT/.certs"

echo -e "\033[36mIronScout Local Domain Setup\033[0m"
echo -e "\033[36m=============================\033[0m"
echo ""

# Step 1: Check for mkcert
echo -e "\033[33m[1/4] Checking for mkcert...\033[0m"
if ! command -v mkcert &> /dev/null; then
    echo -e "\033[31m  mkcert not found. Install it with:\033[0m"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "    brew install mkcert"
    else
        echo "    # See https://github.com/FiloSottile/mkcert#installation"
    fi
    exit 1
fi
echo -e "\033[32m  mkcert found: $(which mkcert)\033[0m"

# Step 2: Generate certificates
echo ""
echo -e "\033[33m[2/4] Generating SSL certificates...\033[0m"

mkdir -p "$CERTS_DIR"

if [[ ! -f "$CERTS_DIR/_wildcard.ironscout.local.pem" ]]; then
    pushd "$CERTS_DIR" > /dev/null

    # Install mkcert CA if not already done
    mkcert -install 2>/dev/null || true

    # Generate wildcard cert
    mkcert "*.ironscout.local" "ironscout.local"

    popd > /dev/null
    echo -e "\033[32m  Certificates generated in .certs/\033[0m"
else
    echo -e "\033[32m  Certificates already exist in .certs/\033[0m"
fi

# Step 3: Update hosts file
echo ""
echo -e "\033[33m[3/4] Updating hosts file...\033[0m"

HOSTS_FILE="/etc/hosts"
NEEDS_UPDATE=false

for domain in "${DOMAINS[@]}"; do
    if ! grep -q "$domain" "$HOSTS_FILE"; then
        NEEDS_UPDATE=true
        break
    fi
done

if [[ "$NEEDS_UPDATE" == true ]]; then
    if [[ $EUID -ne 0 ]]; then
        echo -e "\033[31m  Hosts file needs updating but script is not running as root.\033[0m"
        echo -e "\033[33m  Please add these lines to /etc/hosts manually:\033[0m"
        echo ""
        echo "  # IronScout Local Development"
        for domain in "${DOMAINS[@]}"; do
            echo "  127.0.0.1 $domain"
        done
        echo ""
    else
        echo "" >> "$HOSTS_FILE"
        echo "# IronScout Local Development" >> "$HOSTS_FILE"
        for domain in "${DOMAINS[@]}"; do
            echo "127.0.0.1 $domain" >> "$HOSTS_FILE"
        done
        echo -e "\033[32m  Hosts file updated\033[0m"
    fi
else
    echo -e "\033[32m  Hosts file already configured\033[0m"
fi

# Step 4: Check for Caddy
echo ""
echo -e "\033[33m[4/4] Checking for Caddy...\033[0m"
if ! command -v caddy &> /dev/null; then
    echo -e "\033[31m  Caddy not found. Install it with:\033[0m"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "    brew install caddy"
    else
        echo "    # See https://caddyserver.com/docs/install"
    fi
else
    echo -e "\033[32m  Caddy found: $(which caddy)\033[0m"
fi

# Summary
echo ""
echo -e "\033[36m=============================\033[0m"
echo -e "\033[32mSetup Complete!\033[0m"
echo ""
echo -e "\033[33mNext steps:\033[0m"
echo "  1. Copy environment variables:"
echo "     - Review .env.local.domains.example files in each app"
echo "     - Merge relevant values into your .env.local files"
echo ""
echo "  2. Start the development servers:"
echo -e "     \033[36mpnpm dev:all\033[0m"
echo ""
echo "  3. Start Caddy proxy (in separate terminal):"
echo -e "     \033[36mcaddy run\033[0m"
echo ""
echo "  4. Access your apps:"
echo "     https://www.ironscout.local      - Marketing"
echo "     https://app.ironscout.local      - Web App"
echo "     https://api.ironscout.local      - API"
echo "     https://admin.ironscout.local    - Admin"
echo "     https://merchant.ironscout.local - Merchant"
echo ""

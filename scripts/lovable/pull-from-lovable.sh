#!/bin/bash
# pull-from-lovable.sh
# Pull Lovable changes back into the monorepo
#
# Usage: ./scripts/lovable/pull-from-lovable.sh

set -e

REMOTE_NAME="lovable"
REMOTE_URL="https://github.com/jeb-scarbrough/ironscout-www-lovable.git"
PREFIX="apps/www"

echo "==> Pulling Lovable changes into apps/www..."

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Ensure remote exists
if ! git remote get-url "$REMOTE_NAME" > /dev/null 2>&1; then
    echo "==> Adding remote '$REMOTE_NAME'..."
    git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

# Fetch latest from Lovable
echo "==> Fetching from $REMOTE_NAME..."
git fetch "$REMOTE_NAME"

# Pull with subtree
echo "==> Pulling changes into $PREFIX..."
git subtree pull --prefix="$PREFIX" "$REMOTE_NAME" main --squash -m "chore: sync www changes from Lovable"

echo ""
echo "✅ Successfully pulled Lovable changes into apps/www!"
echo ""
echo "Review changes with: git diff HEAD~1"

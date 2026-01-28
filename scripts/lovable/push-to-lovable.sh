#!/bin/bash
# push-to-lovable.sh
# Push apps/www changes from monorepo to Lovable repo
#
# Usage: ./scripts/lovable/push-to-lovable.sh

set -e

REMOTE_NAME="lovable"
REMOTE_URL="https://github.com/jeb-scarbrough/ironscout-www-lovable.git"
PREFIX="apps/www"
BRANCH="lovable-www"

echo "==> Pushing apps/www to Lovable repo..."

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

# Create subtree split
echo "==> Creating subtree split from $PREFIX..."
git subtree split --prefix="$PREFIX" -b "$BRANCH"

# Push to Lovable repo
echo "==> Pushing to $REMOTE_NAME main branch..."
git push "$REMOTE_NAME" "$BRANCH":main --force-with-lease

echo ""
echo "✅ Successfully pushed apps/www to Lovable repo!"
echo "   View at: https://github.com/jeb-scarbrough/ironscout-www-lovable"

#!/bin/bash

# Script to auto-resolve merge conflicts by keeping HEAD version

echo "Fixing merge conflicts..."

# Find all files with conflict markers
files=$(find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.json" \) ! -path "*/node_modules/*" ! -path "*/.next/*" -exec grep -l "<<<<<<< HEAD" {} \; 2>/dev/null)

for file in $files; do
    echo "Fixing: $file"

    # Use sed to remove conflict markers and keep HEAD version
    # This removes:
    # 1. Lines with <<<<<<< HEAD
    # 2. Everything from ======= to >>>>>>> (inclusive)

    sed -i '/^<<<<<<< HEAD$/d; /^=======$/,/^>>>>>>> /d' "$file"

    echo "  ✓ Fixed"
done

echo ""
echo "All conflicts resolved!"
echo "Files fixed: $(echo "$files" | wc -l)"

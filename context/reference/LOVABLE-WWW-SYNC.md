# Lovable WWW Sync Workflow

This document describes how to sync the `apps/www` directory between the IronScout monorepo and the dedicated Lovable repo using git subtree.

## Overview

- **Monorepo:** `https://github.com/jeb-scarbrough/IronScout.git`
- **Lovable Repo:** `https://github.com/jeb-scarbrough/ironscout-www-lovable.git`
- **Synced Directory:** `apps/www`

Lovable edits the standalone repo. Changes flow back to the monorepo via subtree pulls.

## Why Subtree?

- Lovable stays constrained to `www` code only
- No exposure of build tooling, infra, or unrelated packages
- Avoids Lovable "helpfully" touching monorepo plumbing
- Deterministic, intentional sync process

---

## Initial Setup (One-Time)

### 1. Add the Lovable remote to your monorepo

```bash
cd S:\workspace\IronScout
git remote add lovable https://github.com/jeb-scarbrough/ironscout-www-lovable.git
```

### 2. Initial push to Lovable repo

```bash
# Create a split branch from apps/www
git subtree split --prefix=apps/www -b lovable-www

# Push to Lovable repo
git push lovable lovable-www:main --force
```

### 3. Verify in GitHub

Check that `https://github.com/jeb-scarbrough/ironscout-www-lovable` now contains the www app files.

---

## Ongoing Workflows

### Push Monorepo Changes → Lovable Repo

When you've made changes to `apps/www` in the monorepo and want Lovable to see them:

```bash
# Using the helper script
./scripts/lovable/push-to-lovable.sh

# Or manually
git subtree split --prefix=apps/www -b lovable-www
git push lovable lovable-www:main --force-with-lease
```

### Pull Lovable Changes → Monorepo

When Lovable has made changes and you want them in the monorepo:

```bash
# Using the helper script
./scripts/lovable/pull-from-lovable.sh

# Or manually
git subtree pull --prefix=apps/www lovable main --squash -m "chore: sync www changes from Lovable"
```

---

## Helper Scripts

Two helper scripts are provided in `scripts/lovable/`:

| Script | Purpose |
|--------|---------|
| `push-to-lovable.sh` | Push monorepo www changes to Lovable repo |
| `pull-from-lovable.sh` | Pull Lovable changes back to monorepo |

### Usage

```bash
# From monorepo root
./scripts/lovable/push-to-lovable.sh
./scripts/lovable/pull-from-lovable.sh
```

---

## Conflict Resolution

If you get merge conflicts when pulling from Lovable:

1. Resolve conflicts in the affected files
2. Stage the resolved files: `git add <files>`
3. Complete the merge: `git commit`

---

## Best Practices

1. **Always commit monorepo changes before syncing** - Scripts will abort if working directory is dirty
2. **Pull from Lovable before pushing** - Avoids overwriting Lovable's work
3. **Review Lovable's changes** - Use `git diff` after pulling to verify changes
4. **Keep www self-contained** - Avoid adding shared package dependencies that would break Lovable's isolated build

---

## Troubleshooting

### "Remote 'lovable' not found"

Add the remote:
```bash
git remote add lovable https://github.com/jeb-scarbrough/ironscout-www-lovable.git
```

### "fatal: refusing to merge unrelated histories"

Use `--allow-unrelated-histories` on first pull:
```bash
git subtree pull --prefix=apps/www lovable main --squash --allow-unrelated-histories
```

### Subtree split is slow

This is normal for large repos. The split operation walks through git history.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    IronScout Monorepo                       │
│  github.com/jeb-scarbrough/IronScout                        │
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ apps/   │ │ apps/   │ │ apps/   │ │ apps/   │           │
│  │ api     │ │ web     │ │ admin   │ │ www ────┼───────┐   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │   │
│                                                         │   │
│  ┌─────────────────────────────────────────────┐       │   │
│  │ packages/ (db, ui, config, etc.)            │       │   │
│  └─────────────────────────────────────────────┘       │   │
└─────────────────────────────────────────────────────────┼───┘
                                                          │
                        git subtree                       │
                        split/pull                        │
                                                          ▼
┌─────────────────────────────────────────────────────────────┐
│              ironscout-www-lovable                          │
│  github.com/jeb-scarbrough/ironscout-www-lovable            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Next.js app (standalone)                            │   │
│  │ - app/                                              │   │
│  │ - public/                                           │   │
│  │ - package.json                                      │   │
│  │ - next.config.ts                                    │   │
│  │ - tailwind.config.ts                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                    ▲                                        │
│                    │ Lovable edits here                     │
└─────────────────────────────────────────────────────────────┘
```

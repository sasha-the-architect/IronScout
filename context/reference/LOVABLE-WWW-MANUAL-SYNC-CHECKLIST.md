# Manual WWW Sync Checklist

> Standalone `ironscout-www-lovable` repo → Monorepo `apps/www`

Use this checklist every time you "promote" a batch of Lovable changes back into the monorepo.

**App Router:** Yes  
**Workspace Strategy:** pnpm workspace with per-app `package.json`

---

## A) File Sync Scope

Copy exactly this set of files/folders:

### 1. App Code
- `app/**` - All routes and pages
- `components/**` - React components (if exists)
- `lib/**` - Utility libraries (if exists)
- `utils/**` - Helper functions (if exists)
- `styles/**` - Stylesheets (if exists)
- `public/**` - Static assets (only if changed)

### 2. Next.js + Styling Config
- `next.config.ts`
- `tailwind.config.ts`
- `postcss.config.js`
- `eslint.config.*` / `.eslintrc.*` (if exists)
- `tsconfig.json`

### 3. Optional Files (if used)
- `middleware.ts`
- `next-sitemap.config.*`
- `fonts/**`

### ⚠️ Do NOT Copy
- `.next/` - Build output
- `out/` - Static export output
- `node_modules/` - Dependencies
- `.turbo/` - Turbo cache
- `.vercel/` - Vercel config
- `pnpm-lock.yaml` - Standalone lockfile (monorepo has its own)

---

## B) Dependency & Scripts Alignment

### 1. Dependencies Check

Compare `apps/www/package.json` in monorepo vs standalone:

```bash
# View diff of package.json
diff <(cat apps/www/package.json) <(curl -s https://raw.githubusercontent.com/jeb-scarbrough/ironscout-www-lovable/main/package.json)
```

**Must match:**
- `next`, `react`, `react-dom` versions
- `tailwindcss`, `postcss`, `autoprefixer` versions
- Any UI libs added (e.g., `clsx`, `lucide-react`, `framer-motion`)

**If Lovable added new dependencies:**
1. Add them to `apps/www/package.json` in monorepo
2. Run `pnpm install` from monorepo root

### 2. Scripts Check

Ensure monorepo can still run:

```powershell
# From monorepo root
pnpm --filter @ironscout/www dev      # Dev server
pnpm --filter @ironscout/www build    # Production build
pnpm --filter @ironscout/www lint     # Linting (if configured)
```

---

## C) Environment & Runtime Checks

### 1. Environment Variables

Inventory any new `process.env.*` usages in standalone:

```bash
# Find all env var references
grep -r "process.env" apps/www/app --include="*.ts" --include="*.tsx"
```

**Checklist:**
- [ ] New env vars documented in `.env.example` (if exists)
- [ ] No hardcoded secrets in code
- [ ] No "silent fallback" behavior that changes prod behavior

### 2. Routing & Asset Path Check

Since standalone runs at `/` and monorepo deploys to `www.ironscout.ai`:

- [ ] No hardcoded absolute URLs (use relative paths)
- [ ] Asset paths work (`/images/...`, etc.)
- [ ] Internal links use Next.js `<Link>` component
- [ ] No `basePath` conflicts

---

## D) Build Correctness Gate

**Run these commands before merging. If any fail, fix the issue first.**

```powershell
# From monorepo root
cd S:\workspace\IronScout

# 1. Install dependencies
pnpm install

# 2. Type check
pnpm --filter @ironscout/www type-check

# 3. Lint (if configured)
pnpm --filter @ironscout/www lint

# 4. Build
pnpm --filter @ironscout/www build
```

✅ All pass → Safe to commit  
❌ Any fail → Fix contract drift first

---

## E) Promotion Workflow

### Using Scripts (Recommended)

```powershell
# Pull Lovable changes into monorepo
.\scripts\lovable\pull-from-lovable.ps1

# Run build gate
pnpm --filter @ironscout/www build

# If build passes, you're done!
# The pull script already committed the changes
```

### Manual Workflow

1. **In standalone repo:** Merge changes to `main`

2. **Copy files to monorepo:**
   ```powershell
   # From monorepo root - copy changed files
   # (Use your preferred diff/merge tool)
   ```

3. **Apply checks B + C** (dependencies, env vars)

4. **Run gate D** (build correctness)

5. **Commit in monorepo:**
   ```powershell
   git add apps/www
   git commit -m "sync(www): promote lovable changes (YYYY-MM-DD)"
   git push
   ```

---

## F) Quick Reference Commands

| Task | Command |
|------|---------|
| Push monorepo → Lovable | `.\scripts\lovable\push-to-lovable.ps1` |
| Pull Lovable → monorepo | `.\scripts\lovable\pull-from-lovable.ps1` |
| Dev server | `pnpm --filter @ironscout/www dev` |
| Build | `pnpm --filter @ironscout/www build` |
| Type check | `pnpm --filter @ironscout/www type-check` |
| Find new env vars | `grep -r "process.env" apps/www/app` |

---

## G) Troubleshooting

### "Module not found" after sync

Lovable added a dependency that's not in monorepo:

```powershell
# Check what's different
diff apps/www/package.json <lovable-repo>/package.json

# Add missing deps
pnpm --filter @ironscout/www add <package-name>
```

### Build works in standalone but fails in monorepo

1. Check Node version matches (monorepo uses 25.5.0 for most apps, 22 for www deploy)
2. Check for workspace-specific path resolutions
3. Verify no `workspace:*` protocol in standalone deps

### Merge conflicts in `package.json`

Keep monorepo's structure, but merge in new dependencies from standalone:
- Keep `name: "@ironscout/www"`
- Keep monorepo's script names
- Add new `dependencies` and `devDependencies`

---

## H) Source of Truth

| Aspect | Source of Truth |
|--------|-----------------|
| UI/UX changes | Lovable repo (standalone) |
| Build config | Monorepo |
| Dependencies | Monorepo (Lovable proposes, you verify) |
| Deployment | Monorepo (Render deploys from here) |

---

## See Also

- [LOVABLE-WWW-SYNC.md](./LOVABLE-WWW-SYNC.md) - Subtree workflow documentation
- [Render deployment docs](../DEPLOYMENT.md) - How www gets deployed

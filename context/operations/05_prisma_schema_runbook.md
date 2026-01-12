# Prisma Schema Change Runbook

This runbook documents how to safely make Prisma schema changes without causing P2022 ("column does not exist") errors.

## Quick Reference

| Scenario | Command |
|----------|---------|
| Start local database | `pnpm db:up` |
| Check database status | `pnpm db:check` |
| Generate Prisma client | `pnpm db:generate` |
| Create migration | `pnpm db:migrate:dev` |
| Apply migrations | `pnpm db:migrate:deploy` |
| Full reset (destroys data) | `pnpm db:reset` |
| View database | `pnpm db:studio` |

---

## Local Development Setup

### First-Time Setup

```bash
# 1. Start PostgreSQL and Redis
pnpm db:up

# 2. Copy environment file
cp .env.example .env

# 3. Update DATABASE_URL in .env
DATABASE_URL="postgresql://ironscout:ironscout_dev@localhost:5432/ironscout_dev"

# 4. Apply migrations
pnpm db:migrate:deploy

# 5. Generate Prisma client
pnpm db:generate

# 6. Verify everything works
pnpm db:check
```

### Daily Workflow

```bash
# Start the database
pnpm db:up

# Quick health check before starting apps
pnpm db:check

# Start development servers
pnpm dev
```

---

## Troubleshooting

### If You See P2022 Locally

**Error**: `PrismaClientKnownRequestError: P2022 - The column '...' does not exist`

**Cause**: Your Prisma client expects columns that don't exist in your database.

**Fix**:

```bash
# 1. Check if you have pending migrations
pnpm db:migrate:status

# 2. If migrations pending, apply them
pnpm db:migrate:dev

# 3. If schema changed but no migration exists
pnpm db:migrate:dev --name describe_your_change

# 4. Regenerate Prisma client
pnpm db:generate

# 5. Verify fix
pnpm db:check
```

### If Migrations Are Out of Sync

**Error**: Schema drift detected

**Fix**:

```bash
# Option 1: Create migration for your schema changes
pnpm db:migrate:dev --name fix_schema_drift

# Option 2: Nuclear option (destroys all data)
pnpm db:reset
```

### If Generated Client Is Stale

**Error**: Generated Prisma client may be stale

**Fix**:

```bash
pnpm db:generate
```

---

## Making Schema Changes

### Safe Change Pattern (Recommended)

For any schema change, follow this sequence:

```bash
# 1. Edit packages/db/schema.prisma

# 2. Create migration
pnpm db:migrate:dev --name add_new_column

# 3. Regenerate client
pnpm db:generate

# 4. Verify
pnpm db:check

# 5. Commit ALL generated files
git add packages/db/schema.prisma
git add packages/db/migrations/
git add packages/db/generated/
git commit -m "feat(db): add new column to products"
```

### Adding a Column

Safe by default if nullable or has a default:

```prisma
model products {
  // Adding nullable column - safe
  newField String?

  // Adding column with default - safe
  status   String @default("active")
}
```

Then:
```bash
pnpm db:migrate:dev --name add_new_field
pnpm db:generate
```

### Removing a Column

**DANGEROUS** - requires coordination:

1. **First PR**: Remove all code that reads/writes the column
2. **Wait for full deploy**: All pods running new code
3. **Second PR**: Remove column from schema, create migration

```bash
# After code no longer uses the column:
pnpm db:migrate:dev --name remove_deprecated_field
pnpm db:generate
```

### Renaming a Column

**NEVER** use `RENAME COLUMN` in migrations. Instead:

1. **PR 1**: Add new column, migrate data, update code to write both
2. **PR 2**: Update code to read from new column
3. **PR 3**: Remove old column

```prisma
// Step 1: Add new column
model products {
  oldName String?
  newName String?  // New column
}

// Step 3: Remove old column
model products {
  newName String
}
```

### Making a Column Required

1. Ensure all existing rows have values
2. Add default first, then remove default if needed

```prisma
// Step 1: Add with default
model products {
  status String @default("active")
}

// Step 2: (after data migration) Make required without default
model products {
  status String
}
```

---

## Before Opening a PR

Run the full validation suite:

```bash
# 1. Ensure database is running
pnpm db:up

# 2. Run strict checks
pnpm db:check:strict

# 3. Verify migrations are clean
pnpm db:check:drift

# 4. Ensure client is generated
pnpm db:generate

# 5. Check for uncommitted changes
git status

# 6. Run tests
pnpm --filter @ironscout/db test:schema
```

---

## CI Checks

The `schema-integrity.yml` workflow runs on every PR that touches:
- `packages/db/schema.prisma`
- `packages/db/migrations/`
- `packages/db/generated/`

It will **block merge** if:
- Schema has changes without a migration
- Generated client is stale
- Migrations fail to apply
- Critical queries fail against the migrated schema

---

## Production Deploy Sequence

**CRITICAL**: Always apply migrations BEFORE deploying code.

```
1. Run migrations against production database
2. Wait for migrations to complete successfully
3. Deploy new code
4. Verify application health
```

For rolling deploys:
- Migrations must be backward-compatible
- Old code must continue working after migration
- Use the add→migrate→remove pattern for breaking changes

---

## Emergency Recovery

If P2022 hits production:

1. **Identify the missing column**
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'affected_table';
   ```

2. **Check if migration was applied**
   ```sql
   SELECT * FROM _prisma_migrations
   ORDER BY finished_at DESC LIMIT 10;
   ```

3. **If migration missing, apply it**
   ```bash
   DATABASE_URL="production_url" pnpm db:migrate:deploy
   ```

4. **If migration applied but column missing**
   - Migration may have failed partially
   - Check migration logs
   - May need manual SQL intervention

---

## Key Files

| File | Purpose |
|------|---------|
| `packages/db/schema.prisma` | Source of truth for database schema |
| `packages/db/migrations/` | SQL migration files |
| `packages/db/generated/` | Generated Prisma client (committed) |
| `packages/db/scripts/prestart-check.ts` | Local dev health check |
| `packages/db/scripts/check-schema-drift.ts` | CI schema validation |
| `.github/workflows/schema-integrity.yml` | CI workflow |

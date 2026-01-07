/**
 * Run the Product Resolver v1.2 migration
 */
import pg from 'pg';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env manually
const envPath = join(__dirname, '..', '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const eqPos = line.indexOf('=');
  if (eqPos > 0) {
    const key = line.substring(0, eqPos).trim();
    let value = line.substring(eqPos + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

console.log('Connecting to:', connectionString.replace(/:[^:@]+@/, ':***@'));

const client = new pg.Client({ connectionString });

async function main() {
  await client.connect();
  console.log('Connected!');

  const sqlPath = join(__dirname, 'migrations', '20260106_product_resolver_v12', 'migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing Product Resolver v1.2 migration...');
  console.log('');

  try {
    await client.query(sql);
    console.log('');
    console.log('Migration completed successfully!');
  } catch (e) {
    // Check if it's a "already exists" error (which is fine for IF NOT EXISTS)
    if (e.message.includes('already exists')) {
      console.log('Some objects already exist (expected for re-runs):', e.message);
    } else {
      console.error('Migration failed:', e.message);
      if (e.detail) console.error('Detail:', e.detail);
      if (e.hint) console.error('Hint:', e.hint);
      process.exit(1);
    }
  }

  // Verify the migration
  console.log('');
  console.log('Verifying migration...');

  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('product_links', 'product_aliases', 'source_trust_config')
    ORDER BY table_name
  `);

  console.log('New tables created:');
  for (const row of tables.rows) {
    console.log('  ✓', row.table_name);
  }

  const columns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'products'
      AND column_name IN ('canonicalKey', 'upcNorm', 'brandNorm', 'caliberNorm', 'specs')
    ORDER BY column_name
  `);

  console.log('');
  console.log('New columns on products:');
  for (const row of columns.rows) {
    console.log('  ✓', row.column_name);
  }

  const spColumns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'source_products'
      AND column_name = 'normalizedHash'
  `);

  console.log('');
  console.log('New columns on source_products:');
  for (const row of spColumns.rows) {
    console.log('  ✓', row.column_name);
  }

  await client.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

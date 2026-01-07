/**
 * Run the source_product_identifiers migration
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

  const sqlPath = join(__dirname, 'migrations', '20260106_source_product_identifiers', 'migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing migration...');
  console.log('');

  try {
    await client.query(sql);
    console.log('');
    console.log('Migration completed successfully!');
  } catch (e) {
    console.error('Migration failed:', e.message);
    if (e.detail) console.error('Detail:', e.detail);
    if (e.hint) console.error('Hint:', e.hint);
    process.exit(1);
  }

  // Show summary
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM source_products) as source_products,
      (SELECT COUNT(*) FROM source_product_identifiers) as identifiers,
      (SELECT COUNT(*) FROM source_product_identifiers WHERE "isCanonical" = true) as canonical,
      (SELECT COUNT(DISTINCT "idType") FROM source_product_identifiers) as id_types
  `);

  console.log('');
  console.log('Summary:');
  console.log('  source_products:', result.rows[0].source_products);
  console.log('  identifiers:', result.rows[0].identifiers);
  console.log('  canonical:', result.rows[0].canonical);
  console.log('  distinct id_types:', result.rows[0].id_types);

  await client.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

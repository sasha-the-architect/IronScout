/**
 * Run the benchmark removal migration using pg directly
 */
import pg from 'pg';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env manually
const envPath = join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');
for (const line of envLines) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
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

  const sqlPath = join(__dirname, 'migrate-remove-benchmark.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split on semicolon but be careful about statements
  const statements = sql
    .split(/;(?=\s*(?:--|ALTER|DROP|CREATE|TRUNCATE|UPDATE|SELECT|$))/i)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  console.log(`Executing ${statements.length} SQL statements...`);

  for (const stmt of statements) {
    if (!stmt) continue;
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    console.log('Executing:', preview + '...');
    try {
      await client.query(stmt);
      console.log('  OK');
    } catch (e) {
      console.log('  Error:', e.message);
    }
  }

  await client.end();
  console.log('Migration complete!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

/**
 * Run the benchmark removal migration
 */
import 'dotenv/config';
import { prisma } from '../packages/db/index.js';
import fs from 'fs';

async function main() {
  const sql = fs.readFileSync('./scripts/migrate-remove-benchmark.sql', 'utf8');
  const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));

  console.log(`Executing ${statements.length} SQL statements...`);

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    const preview = trimmed.substring(0, 80).replace(/\n/g, ' ');
    console.log('Executing:', preview + '...');
    try {
      await prisma.$executeRawUnsafe(trimmed);
      console.log('  OK');
    } catch (e) {
      console.log('  Error:', e.message);
    }
  }

  await prisma.$disconnect();
  console.log('Migration complete!');
}

main().catch(console.error);

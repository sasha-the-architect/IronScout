import { config } from 'dotenv';
config({ path: '../../.env' });

async function main() {
  const { prisma } = await import('../index.js');

  console.log('='.repeat(80));
  console.log('IRONSCOUT DATABASE AUDIT REPORT');
  console.log('Generated:', new Date().toISOString());
  console.log('='.repeat(80));

  // Query 1: Table activity and scan patterns
  console.log('\n\n' + '='.repeat(80));
  console.log('1. TABLE ACTIVITY AND SCAN PATTERNS');
  console.log('='.repeat(80));
  const tableActivity = await prisma.$queryRaw`
    SELECT
      schemaname, relname,
      n_live_tup, n_dead_tup,
      seq_scan, seq_tup_read,
      idx_scan, idx_tup_fetch,
      n_tup_ins, n_tup_upd, n_tup_del,
      last_vacuum, last_autovacuum,
      last_analyze, last_autoanalyze
    FROM pg_stat_user_tables
    ORDER BY (seq_scan + idx_scan) ASC, n_live_tup DESC
  `;
  console.log('\nTable | LiveRows | DeadRows | SeqScans | IdxScans | Ins | Upd | Del | LastAutoVacuum');
  console.log('-'.repeat(120));
  for (const row of tableActivity as any[]) {
    console.log(
      `${row.relname.padEnd(35)} | ${String(row.n_live_tup).padStart(8)} | ${String(row.n_dead_tup).padStart(8)} | ` +
      `${String(row.seq_scan).padStart(8)} | ${String(row.idx_scan).padStart(8)} | ` +
      `${String(row.n_tup_ins).padStart(6)} | ${String(row.n_tup_upd).padStart(6)} | ${String(row.n_tup_del).padStart(6)} | ` +
      `${row.last_autovacuum ? new Date(row.last_autovacuum).toISOString().slice(0, 10) : 'never'}`
    );
  }

  // Query 2: Index usage
  console.log('\n\n' + '='.repeat(80));
  console.log('2. INDEX USAGE (sorted by scan count ASC - lowest first)');
  console.log('='.repeat(80));
  const indexUsage = await prisma.$queryRaw`
    SELECT
      s.schemaname, s.relname AS table_name,
      i.relname AS index_name,
      idx_scan,
      pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
      pg_get_indexdef(i.oid) AS index_def
    FROM pg_stat_user_indexes s
    JOIN pg_class i ON i.oid = s.indexrelid
    ORDER BY idx_scan ASC, pg_relation_size(i.oid) DESC
  `;
  console.log('\nIndex | Table | Scans | Size');
  console.log('-'.repeat(120));
  for (const row of indexUsage as any[]) {
    console.log(
      `${row.index_name.padEnd(50)} | ${row.table_name.padEnd(30)} | ${String(row.idx_scan).padStart(10)} | ${row.index_size}`
    );
  }

  // Query 3: Big unused indexes
  console.log('\n\n' + '='.repeat(80));
  console.log('3. BIG INDEXES NEVER SCANNED (idx_scan = 0)');
  console.log('='.repeat(80));
  const unusedIndexes = await prisma.$queryRaw`
    SELECT
      s.schemaname, s.relname AS table_name,
      i.relname AS index_name,
      pg_size_pretty(pg_relation_size(i.oid)) AS size,
      pg_relation_size(i.oid) AS bytes
    FROM pg_stat_user_indexes s
    JOIN pg_class i ON i.oid = s.indexrelid
    WHERE s.idx_scan = 0
    ORDER BY pg_relation_size(i.oid) DESC
  `;
  console.log('\nIndex | Table | Size');
  console.log('-'.repeat(100));
  for (const row of unusedIndexes as any[]) {
    console.log(`${row.index_name.padEnd(50)} | ${row.table_name.padEnd(30)} | ${row.size}`);
  }
  console.log(`\nTotal unused indexes: ${(unusedIndexes as any[]).length}`);

  // Query 4: Redundant index candidates
  console.log('\n\n' + '='.repeat(80));
  console.log('4. REDUNDANT INDEX CANDIDATES (same leading columns)');
  console.log('='.repeat(80));
  const redundantIndexes = await prisma.$queryRaw`
    WITH idx AS (
      SELECT
        ns.nspname AS schemaname,
        t.relname AS table_name,
        ic.relname AS index_name,
        i.indexrelid,
        i.indrelid,
        i.indisunique,
        i.indisprimary,
        (SELECT string_agg(a.attname, ',' ORDER BY x.n)
         FROM unnest(i.indkey) WITH ORDINALITY AS x(attnum,n)
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
        ) AS cols
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_namespace ns ON ns.oid = t.relnamespace
      WHERE ns.nspname NOT IN ('pg_catalog','information_schema')
    )
    SELECT a.schemaname, a.table_name,
           a.index_name AS maybe_redundant, b.index_name AS covers_it,
           a.cols AS redundant_cols, b.cols AS covering_cols,
           a.indisunique AS redundant_unique, b.indisunique AS covering_unique
    FROM idx a
    JOIN idx b
      ON a.indrelid = b.indrelid
     AND a.index_name <> b.index_name
     AND b.cols LIKE a.cols || '%'
    WHERE NOT a.indisprimary
    ORDER BY a.schemaname, a.table_name, a.index_name
  `;
  console.log('\nMaybe Redundant | Covered By | Table | Redundant Cols | Covering Cols');
  console.log('-'.repeat(140));
  for (const row of redundantIndexes as any[]) {
    console.log(
      `${row.maybe_redundant.padEnd(40)} | ${row.covers_it.padEnd(40)} | ${row.table_name.padEnd(25)} | ` +
      `${row.redundant_cols.padEnd(20)} | ${row.covering_cols}`
    );
  }
  console.log(`\nTotal redundant candidates: ${(redundantIndexes as any[]).length}`);

  // Query 5: Tables with no activity
  console.log('\n\n' + '='.repeat(80));
  console.log('5. TABLES WITH NO RECORDED ACTIVITY (candidate orphans)');
  console.log('='.repeat(80));
  const noActivityTables = await prisma.$queryRaw`
    SELECT schemaname, relname
    FROM pg_stat_user_tables
    WHERE (coalesce(seq_scan,0) + coalesce(idx_scan,0)) = 0
      AND (coalesce(n_tup_ins,0) + coalesce(n_tup_upd,0) + coalesce(n_tup_del,0)) = 0
    ORDER BY schemaname, relname
  `;
  console.log('\nSchema | Table');
  console.log('-'.repeat(60));
  for (const row of noActivityTables as any[]) {
    console.log(`${row.schemaname.padEnd(10)} | ${row.relname}`);
  }
  console.log(`\nTotal tables with no activity: ${(noActivityTables as any[]).length}`);

  // Query 6: Column inventory
  console.log('\n\n' + '='.repeat(80));
  console.log('6. COLUMN INVENTORY (for code cross-reference)');
  console.log('='.repeat(80));
  const columns = await prisma.$queryRaw`
    SELECT
      n.nspname AS schema,
      c.relname AS table,
      a.attname AS column,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
      a.attnotnull AS not_null
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE a.attnum > 0 AND NOT a.attisdropped
      AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND c.relkind = 'r'
    ORDER BY 1,2,3
  `;
  // Group by table for readability
  const byTable: Record<string, any[]> = {};
  for (const row of columns as any[]) {
    const key = `${row.schema}.${row.table}`;
    if (!byTable[key]) byTable[key] = [];
    byTable[key].push(row);
  }
  console.log(`\nTotal columns: ${(columns as any[]).length}`);
  console.log(`Total tables: ${Object.keys(byTable).length}`);

  // Just show column counts per table
  console.log('\nTable | Column Count');
  console.log('-'.repeat(60));
  for (const [table, cols] of Object.entries(byTable).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${table.padEnd(45)} | ${cols.length}`);
  }

  // Query 7: Table sizes
  console.log('\n\n' + '='.repeat(80));
  console.log('7. TABLE SIZES (largest first)');
  console.log('='.repeat(80));
  const tableSizes = await prisma.$queryRaw`
    SELECT
      n.nspname AS schema,
      c.relname AS table,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
    ORDER BY pg_total_relation_size(c.oid) DESC
  `;
  console.log('\nTable | Total Size');
  console.log('-'.repeat(70));
  let totalBytes = 0n;
  for (const row of tableSizes as any[]) {
    console.log(`${row.table.padEnd(45)} | ${row.total_size}`);
    totalBytes += BigInt(row.bytes);
  }
  console.log('-'.repeat(70));
  console.log(`TOTAL DATABASE SIZE: ${(Number(totalBytes) / 1024 / 1024).toFixed(2)} MB`);

  // Additional: Check for sequences
  console.log('\n\n' + '='.repeat(80));
  console.log('8. SEQUENCES');
  console.log('='.repeat(80));
  const sequences = await prisma.$queryRaw`
    SELECT
      n.nspname AS schema,
      c.relname AS sequence_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
    ORDER BY c.relname
  `;
  console.log('\nSequence Name');
  console.log('-'.repeat(60));
  for (const row of sequences as any[]) {
    console.log(row.sequence_name);
  }

  // Additional: Foreign key constraints
  console.log('\n\n' + '='.repeat(80));
  console.log('9. FOREIGN KEY CONSTRAINTS');
  console.log('='.repeat(80));
  const fkeys = await prisma.$queryRaw`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name
  `;
  console.log('\nTable.Column -> Foreign Table.Column | Constraint');
  console.log('-'.repeat(100));
  for (const row of fkeys as any[]) {
    console.log(
      `${row.table_name}.${row.column_name}`.padEnd(40) + ' -> ' +
      `${row.foreign_table_name}.${row.foreign_column_name}`.padEnd(30) + ' | ' +
      row.constraint_name
    );
  }
  console.log(`\nTotal FK constraints: ${(fkeys as any[]).length}`);

  // Additional: Check for triggers
  console.log('\n\n' + '='.repeat(80));
  console.log('10. TRIGGERS');
  console.log('='.repeat(80));
  const triggers = await prisma.$queryRaw`
    SELECT
      trigger_name,
      event_manipulation,
      event_object_table,
      action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name
  `;
  console.log('\nTrigger | Event | Table');
  console.log('-'.repeat(80));
  for (const row of triggers as any[]) {
    console.log(`${row.trigger_name.padEnd(30)} | ${row.event_manipulation.padEnd(10)} | ${row.event_object_table}`);
  }
  console.log(`\nTotal triggers: ${(triggers as any[]).length}`);

  // Additional: Views
  console.log('\n\n' + '='.repeat(80));
  console.log('11. VIEWS');
  console.log('='.repeat(80));
  const views = await prisma.$queryRaw`
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log('\nView Name');
  console.log('-'.repeat(60));
  for (const row of views as any[]) {
    console.log(row.table_name);
  }
  console.log(`\nTotal views: ${(views as any[]).length}`);

  // Additional: Functions
  console.log('\n\n' + '='.repeat(80));
  console.log('12. USER-DEFINED FUNCTIONS');
  console.log('='.repeat(80));
  const functions = await prisma.$queryRaw`
    SELECT
      p.proname AS function_name,
      pg_get_function_arguments(p.oid) AS arguments,
      l.lanname AS language
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  `;
  console.log('\nFunction | Arguments | Language');
  console.log('-'.repeat(80));
  for (const row of functions as any[]) {
    console.log(`${row.function_name.padEnd(30)} | ${(row.arguments || '').padEnd(30)} | ${row.language}`);
  }
  console.log(`\nTotal functions: ${(functions as any[]).length}`);

  await prisma.$disconnect();
  console.log('\n\n' + '='.repeat(80));
  console.log('AUDIT COMPLETE');
  console.log('='.repeat(80));
}

main().catch(e => {
  console.error('Audit failed:', e);
  process.exit(1);
});

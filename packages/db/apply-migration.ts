import { prisma } from './index'
import * as fs from 'fs'
import * as path from 'path'

async function applyMigration() {
  const migrationPath = path.join(__dirname, 'migrations', '20250826200000_add_user_role', 'migration.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  console.log('Applying migration: add_user_role')
  console.log('SQL:', sql)

  try {
    // Execute raw SQL
    await prisma.$executeRawUnsafe(sql)
    console.log('✓ Migration applied successfully')
  } catch (error) {
    console.error('✗ Migration failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

applyMigration()

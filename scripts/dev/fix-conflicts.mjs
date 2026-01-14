#!/usr/bin/env node
/**
 * Auto-resolve Merge Conflicts
 * Keeps HEAD version of conflicting files
 *
 * Usage: node scripts/dev/fix-conflicts.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { colors, success, info, header } from '../lib/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')

// File extensions to check
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs']

// Directories to skip
const SKIP_DIRS = ['node_modules', '.next', '.git', 'dist', 'build', '.turbo']

/**
 * Recursively find files with conflict markers
 */
function findConflictFiles(dir, files = []) {
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = resolve(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      if (!SKIP_DIRS.includes(entry)) {
        findConflictFiles(fullPath, files)
      }
    } else if (stat.isFile() && EXTENSIONS.includes(extname(entry))) {
      try {
        const content = readFileSync(fullPath, 'utf-8')
        if (content.includes('<<<<<<< HEAD')) {
          files.push(fullPath)
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return files
}

/**
 * Fix conflicts in a file by keeping HEAD version
 */
function fixConflicts(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const result = []
  let inConflict = false
  let keepingHead = true

  for (const line of lines) {
    if (line.startsWith('<<<<<<< HEAD')) {
      inConflict = true
      keepingHead = true
      continue
    }

    if (line.startsWith('=======') && inConflict) {
      keepingHead = false
      continue
    }

    if (line.startsWith('>>>>>>>') && inConflict) {
      inConflict = false
      continue
    }

    if (!inConflict || keepingHead) {
      result.push(line)
    }
  }

  writeFileSync(filePath, result.join('\n'))
}

async function main() {
  header('Fixing Merge Conflicts')

  info('Scanning for files with conflict markers...')

  const conflictFiles = findConflictFiles(PROJECT_ROOT)

  if (conflictFiles.length === 0) {
    success('No conflict markers found!')
    return
  }

  console.log('')
  info(`Found ${conflictFiles.length} file(s) with conflicts`)
  console.log('')

  for (const file of conflictFiles) {
    const relativePath = file.replace(PROJECT_ROOT, '').replace(/^[\\/]/, '')
    info(`Fixing: ${relativePath}`)
    fixConflicts(file)
    success('  Fixed')
  }

  console.log('')
  success('All conflicts resolved!')
  info(`Files fixed: ${conflictFiles.length}`)
  console.log('')
  info('Note: This script keeps the HEAD version of all conflicts.')
  info('Please review the changes before committing.')
}

main().catch((e) => {
  console.error(`${colors.red}Error:${colors.reset}`, e.message)
  process.exit(1)
})

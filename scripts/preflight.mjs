#!/usr/bin/env node

/**
 * CI Preflight Checks
 *
 * Fast validation script that runs before tests to catch common issues early:
 * - Lint errors (including ESLint config issues)
 * - TypeScript errors (including Next.js 16 breaking changes)
 * - Build failures
 * - Package export issues
 *
 * Usage:
 *   pnpm preflight        # Run all checks
 *   pnpm preflight:quick  # Skip build (faster, for local dev)
 *
 * These checks would have caught:
 * - Next.js 16 async searchParams (type-check)
 * - ESLint config issues (lint)
 * - ESM export resolution (build)
 * - Prisma schema issues (type-check after generate)
 */

import { spawn } from 'child_process'
import { performance } from 'perf_hooks'

const SKIP_BUILD = process.argv.includes('--skip-build')
const VERBOSE = process.argv.includes('--verbose')

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
}

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`)
}

function runCommand(name, command, args = []) {
  return new Promise((resolve) => {
    const start = performance.now()
    log(`\n▶ ${name}...`, colors.blue)

    if (VERBOSE) {
      log(`  ${colors.dim}$ ${command} ${args.join(' ')}${colors.reset}`)
    }

    const proc = spawn(command, args, {
      stdio: VERBOSE ? 'inherit' : 'pipe',
      shell: true,
      cwd: process.cwd(),
    })

    let stderr = ''
    if (!VERBOSE && proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })
    }

    proc.on('close', (code) => {
      const duration = ((performance.now() - start) / 1000).toFixed(1)

      if (code === 0) {
        log(`  ✓ ${name} passed (${duration}s)`, colors.green)
        resolve({ success: true, name, duration })
      } else {
        log(`  ✗ ${name} failed (${duration}s)`, colors.red)
        if (!VERBOSE && stderr) {
          // Show last 20 lines of error output
          const lines = stderr.trim().split('\n').slice(-20)
          console.log(colors.dim + lines.join('\n') + colors.reset)
        }
        resolve({ success: false, name, duration, code })
      }
    })

    proc.on('error', (err) => {
      log(`  ✗ ${name} error: ${err.message}`, colors.red)
      resolve({ success: false, name, error: err.message })
    })
  })
}

async function main() {
  log('\n🔍 Running preflight checks...', colors.blue)
  const totalStart = performance.now()

  const checks = [
    // 1. Lint - catches ESLint config issues, code quality
    { name: 'Lint', command: 'pnpm', args: ['lint'] },

    // 2. Type Check - catches TS errors, Next.js 16 breaking changes
    { name: 'Type Check', command: 'pnpm', args: ['type-check'] },

    // 3. Prisma Generate - ensures schema is valid and client is fresh
    { name: 'Prisma Generate', command: 'pnpm', args: ['db:generate'] },
  ]

  // 4. Build (optional) - catches build-time errors, ESM issues
  if (!SKIP_BUILD) {
    checks.push({ name: 'Build', command: 'pnpm', args: ['build'] })
  }

  const results = []
  for (const check of checks) {
    const result = await runCommand(check.name, check.command, check.args)
    results.push(result)

    // Fail fast on first error (except in verbose mode where we show all)
    if (!result.success && !VERBOSE) {
      break
    }
  }

  const totalDuration = ((performance.now() - totalStart) / 1000).toFixed(1)
  const failed = results.filter((r) => !r.success)
  const passed = results.filter((r) => r.success)

  console.log('\n' + '─'.repeat(50))

  if (failed.length === 0) {
    log(`\n✅ All ${passed.length} preflight checks passed (${totalDuration}s)`, colors.green)
    process.exit(0)
  } else {
    log(`\n❌ ${failed.length} preflight check(s) failed:`, colors.red)
    for (const f of failed) {
      log(`   • ${f.name}`, colors.red)
    }
    log(`\nRun with --verbose for full output`, colors.dim)
    process.exit(1)
  }
}

main().catch((err) => {
  log(`\nPreflight script error: ${err.message}`, colors.red)
  process.exit(1)
})

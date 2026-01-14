#!/usr/bin/env node
/**
 * Verify All Services Start Correctly
 * Cross-platform Node.js version
 *
 * Builds and starts all services, verifies they respond to health checks, then stops them.
 *
 * Usage:
 *   node scripts/build/verify-all.mjs             # Full build + verify
 *   node scripts/build/verify-all.mjs --skip-build  # Skip build, just verify runtime
 *   node scripts/build/verify-all.mjs --timeout 60  # Custom timeout (seconds)
 */

import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  colors,
  success,
  error,
  info,
  header,
  run,
  healthCheck,
  sleep,
  parseArgs,
} from '../lib/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')

// Services to verify
const SERVICES = [
  {
    name: 'api',
    port: 8000,
    command: 'pnpm --filter @ironscout/api start',
    healthCheck: 'http://localhost:8000/health',
  },
  {
    name: 'web',
    port: 3000,
    command: 'pnpm --filter @ironscout/web start',
    healthCheck: 'http://localhost:3000',
  },
  {
    name: 'admin',
    port: 3002,
    command: 'pnpm --filter @ironscout/admin start',
    healthCheck: 'http://localhost:3002',
  },
  {
    name: 'merchant',
    port: 3003,
    command: 'pnpm --filter @ironscout/merchant start',
    healthCheck: 'http://localhost:3003',
  },
]

async function main() {
  const args = parseArgs()
  const skipBuild = args.flags['skip-build']
  const timeout = parseInt(args.flags.timeout || '45', 10) * 1000

  const results = []
  const processes = []
  let overallSuccess = true

  // Build first if not skipped
  if (!skipBuild) {
    header('Building All Services')
    const buildResult = run('node scripts/build/build-all.mjs --skip-tests', {
      cwd: PROJECT_ROOT,
    })
    if (!buildResult.success) {
      error('Build failed. Fix errors before verifying runtime.')
      process.exit(1)
    }
    success('Build completed successfully')
  }

  header('Starting Services for Verification')

  // Set dummy DATABASE_URL for Prisma if not set
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
  }

  // Start each service
  for (const service of SERVICES) {
    info(`Starting ${service.name} on port ${service.port}...`)

    const child = spawn(service.command, [], {
      cwd: PROJECT_ROOT,
      shell: true,
      stdio: 'pipe',
      env: { ...process.env },
    })

    processes.push({ name: service.name, process: child, service })

    await sleep(1000) // Small delay between starts
  }

  header(`Verifying Services (${timeout / 1000} second timeout)`)

  const startTime = Date.now()

  // Check each service's health
  for (const svc of processes) {
    process.stdout.write(`Checking ${svc.name}...`)

    let ready = false
    let errorMsg = null

    while (!ready && Date.now() - startTime < timeout) {
      // Check if process died
      if (svc.process.exitCode !== null) {
        errorMsg = 'Process exited unexpectedly'
        break
      }

      // Try health check
      ready = await healthCheck(svc.service.healthCheck, 2000)
      if (!ready) {
        process.stdout.write('.')
        await sleep(2000)
      }
    }

    if (ready) {
      console.log(`${colors.green} OK${colors.reset}`)
      results.push({ name: svc.name, status: 'PASS', message: 'Started successfully' })
    } else {
      if (!errorMsg) errorMsg = 'Timeout waiting for service'
      console.log(`${colors.red} FAILED${colors.reset}`)
      results.push({ name: svc.name, status: 'FAIL', message: errorMsg })
      overallSuccess = false
    }
  }

  header('Stopping All Services')

  // Stop all processes
  for (const svc of processes) {
    info(`Stopping ${svc.name}...`)
    svc.process.kill('SIGTERM')
    await sleep(500)
    if (svc.process.exitCode === null) {
      svc.process.kill('SIGKILL')
    }
  }

  header('Verification Results')

  // Display results table
  console.log('')
  console.log(`${colors.white}Service          Status     Message${colors.reset}`)
  console.log(`${colors.gray}-------          ------     -------${colors.reset}`)

  for (const result of results) {
    const name = result.name.padEnd(16)
    const status = result.status
    const statusColor = status === 'PASS' ? colors.green : colors.red
    const message = result.message

    console.log(`${name} ${statusColor}${status.padEnd(10)}${colors.reset} ${message}`)
  }

  console.log('')

  if (overallSuccess) {
    success('All services verified successfully!')
    process.exit(0)
  } else {
    error('Some services failed verification')
    process.exit(1)
  }
}

main().catch((e) => {
  error(e.message)
  process.exit(1)
})

/**
 * Shared utilities for cross-platform scripts
 */

import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { dirname, resolve, join } from 'path'
import { fileURLToPath } from 'url'
import { platform } from 'os'

// ANSI colors (works on both Windows Terminal and Unix)
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
}

export function success(msg) {
  console.log(`${colors.green}[OK]${colors.reset} ${msg}`)
}

export function error(msg) {
  console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`)
}

export function warn(msg) {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`)
}

export function info(msg) {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`)
}

export function header(msg) {
  console.log('')
  console.log(`${colors.yellow}========== ${msg} ==========${colors.reset}`)
  console.log('')
}

export function debug(msg, verbose = false) {
  if (verbose) {
    console.log(`${colors.gray}[DEBUG] ${msg}${colors.reset}`)
  }
}

/**
 * Get project root directory
 */
export function getProjectRoot(importMetaUrl) {
  const __dirname = dirname(fileURLToPath(importMetaUrl))
  // Navigate from scripts/lib to project root
  return resolve(__dirname, '../..')
}

/**
 * Check if running on Windows
 */
export function isWindows() {
  return platform() === 'win32'
}

/**
 * Run a command synchronously
 */
export function run(cmd, options = {}) {
  const { cwd = process.cwd(), silent = false, ignoreError = false } = options
  try {
    const result = execSync(cmd, {
      cwd,
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      shell: true,
    })
    return { success: true, output: result }
  } catch (e) {
    if (!ignoreError) {
      return { success: false, error: e.message, output: e.stdout || '' }
    }
    return { success: false, output: '' }
  }
}

/**
 * Run a command and return output
 */
export function runCapture(cmd, options = {}) {
  const { cwd = process.cwd() } = options
  try {
    const result = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { success: true, output: result.trim() }
  } catch (e) {
    return { success: false, error: e.message, output: e.stdout?.trim() || '' }
  }
}

/**
 * Spawn a background process
 */
export function spawnBackground(cmd, args = [], options = {}) {
  const { cwd = process.cwd(), logFile = null } = options

  const child = spawn(cmd, args, {
    cwd,
    shell: true,
    detached: !isWindows(), // Detach on Unix
    stdio: logFile ? ['ignore', 'pipe', 'pipe'] : 'ignore',
  })

  if (logFile && child.stdout && child.stderr) {
    const logStream = require('fs').createWriteStream(logFile, { flags: 'a' })
    child.stdout.pipe(logStream)
    child.stderr.pipe(logStream)
  }

  // Don't keep parent alive
  child.unref()

  return child
}

/**
 * Check if a command exists
 */
export function commandExists(cmd) {
  const checkCmd = isWindows() ? `where ${cmd}` : `which ${cmd}`
  const result = runCapture(checkCmd)
  return result.success
}

/**
 * Ensure directory exists
 */
export function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Remove directory recursively
 */
export function removeDir(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Check if port is in use (cross-platform)
 */
export async function isPortInUse(port) {
  return new Promise((resolve) => {
    const net = require('net')
    const server = net.createServer()

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true)
      } else {
        resolve(false)
      }
    })

    server.once('listening', () => {
      server.close()
      resolve(false)
    })

    server.listen(port)
  })
}

/**
 * Find process using a port (cross-platform)
 */
export function findProcessOnPort(port) {
  if (isWindows()) {
    const result = runCapture(`netstat -ano | findstr :${port} | findstr LISTENING`)
    if (result.success && result.output) {
      const lines = result.output.split('\n')
      const pids = new Set()
      for (const line of lines) {
        const match = line.trim().match(/\s+(\d+)$/)
        if (match) {
          pids.add(parseInt(match[1], 10))
        }
      }
      return Array.from(pids)
    }
  } else {
    const result = runCapture(`lsof -t -i:${port}`)
    if (result.success && result.output) {
      return result.output.split('\n').map((p) => parseInt(p, 10)).filter(Boolean)
    }
  }
  return []
}

/**
 * Kill a process by PID (cross-platform)
 */
export function killProcess(pid) {
  try {
    if (isWindows()) {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
      // Force kill after delay if still running
      setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          // Already dead
        }
      }, 1000)
    }
    return true
  } catch {
    return false
  }
}

/**
 * Sleep for milliseconds
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Parse command line arguments
 */
export function parseArgs(args = process.argv.slice(2)) {
  const result = { _: [], flags: {} }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const nextArg = args[i + 1]
      if (nextArg && !nextArg.startsWith('-')) {
        result.flags[key] = nextArg
        i++
      } else {
        result.flags[key] = true
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1)
      result.flags[key] = true
    } else {
      result._.push(arg)
    }
  }

  return result
}

/**
 * Read JSON file safely
 */
export function readJson(filepath) {
  try {
    return JSON.parse(readFileSync(filepath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Write JSON file
 */
export function writeJson(filepath, data) {
  writeFileSync(filepath, JSON.stringify(data, null, 2))
}

/**
 * HTTP health check
 */
export async function healthCheck(url, timeout = 2000) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response.ok || response.status === 302
  } catch {
    return false
  }
}

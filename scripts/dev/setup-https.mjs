#!/usr/bin/env node
/**
 * Setup Local HTTPS Certificates
 * Cross-platform Node.js version
 *
 * Uses mkcert to create locally-trusted certificates.
 *
 * Usage: node scripts/dev/setup-https.mjs
 */

import { existsSync, mkdirSync, renameSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import {
  colors,
  success,
  error,
  info,
  warn,
  header,
  run,
  runCapture,
  isWindows,
} from '../lib/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')
const CERTS_DIR = resolve(PROJECT_ROOT, 'certs')

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * Download mkcert binary
 */
async function downloadMkcert() {
  const arch = process.arch === 'x64' ? 'amd64' : process.arch
  const platform = isWindows() ? 'windows' : process.platform
  const ext = isWindows() ? '.exe' : ''

  const url = `https://dl.filippo.io/mkcert/latest?for=${platform}/${arch}`
  const mkcertPath = resolve(CERTS_DIR, `mkcert${ext}`)

  info(`Downloading mkcert from ${url}...`)

  // Use curl or wget to download (they handle HTTPS better than fetch)
  const curlResult = runCapture(`curl -L -o "${mkcertPath}" "${url}"`)
  if (!curlResult.success) {
    // Try wget
    const wgetResult = runCapture(`wget -O "${mkcertPath}" "${url}"`)
    if (!wgetResult.success) {
      error('Failed to download mkcert')
      console.log('Please download manually from: https://github.com/FiloSottile/mkcert/releases')
      return null
    }
  }

  // Make executable on Unix
  if (!isWindows()) {
    run(`chmod +x "${mkcertPath}"`)
  }

  return mkcertPath
}

async function main() {
  header('Setting Up Local HTTPS')

  // Create certs directory
  if (!existsSync(CERTS_DIR)) {
    mkdirSync(CERTS_DIR, { recursive: true })
    info('Created certs directory')
  }

  // Check for mkcert
  const mkcertExt = isWindows() ? '.exe' : ''
  let mkcertPath = resolve(CERTS_DIR, `mkcert${mkcertExt}`)

  if (!existsSync(mkcertPath)) {
    // Check if mkcert is in PATH
    const globalMkcert = runCapture('mkcert -version')
    if (globalMkcert.success) {
      mkcertPath = 'mkcert'
      info('Using system-installed mkcert')
    } else {
      info('mkcert not found, downloading...')
      const downloaded = await downloadMkcert()
      if (!downloaded) {
        process.exit(1)
      }
      mkcertPath = downloaded
      success('Downloaded mkcert')
    }
  } else {
    info('mkcert already downloaded')
  }

  // Install local CA
  info('Installing local CA (may require admin privileges)...')
  console.log(`${colors.gray}  If prompted, click 'Yes' to trust the certificate${colors.reset}`)

  const installResult = run(`"${mkcertPath}" -install`, { cwd: CERTS_DIR })
  if (!installResult.success) {
    error('Failed to install CA. Try running as Administrator/sudo.')
    process.exit(1)
  }
  success('Local CA installed')

  // Check if certificates already exist
  const certFile = resolve(CERTS_DIR, 'localhost.pem')
  const keyFile = resolve(CERTS_DIR, 'localhost-key.pem')

  if (existsSync(certFile) && existsSync(keyFile)) {
    info('Certificates already exist')
    const regenerate = await prompt('Regenerate? (y/N): ')
    if (regenerate.toLowerCase() !== 'y') {
      success('Using existing certificates')
      process.exit(0)
    }
  }

  // Generate certificates
  info('Generating certificates for localhost...')

  // Run mkcert in certs directory
  const genResult = run(`"${mkcertPath}" localhost 127.0.0.1 ::1`, { cwd: CERTS_DIR })
  if (!genResult.success) {
    error('Certificate generation failed')
    process.exit(1)
  }

  // Rename generated files to consistent names
  // mkcert creates files like localhost+2.pem and localhost+2-key.pem
  try {
    const files = require('fs').readdirSync(CERTS_DIR)
    for (const file of files) {
      if (file.match(/localhost\+\d+\.pem$/) && !file.includes('-key')) {
        renameSync(resolve(CERTS_DIR, file), certFile)
      } else if (file.match(/localhost\+\d+-key\.pem$/)) {
        renameSync(resolve(CERTS_DIR, file), keyFile)
      }
    }
  } catch (e) {
    warn('Could not rename certificate files, they may have default names')
  }

  success('Generated certificates')

  header('Setup Complete')

  console.log(`${colors.white}Certificates created:${colors.reset}`)
  console.log(`${colors.gray}  Certificate: ${certFile}${colors.reset}`)
  console.log(`${colors.gray}  Private Key: ${keyFile}${colors.reset}`)
  console.log('')
  info('Next steps:')
  console.log(`${colors.gray}  1. Update apps/web/.env.local:${colors.reset}`)
  console.log(`${colors.yellow}     NEXTAUTH_URL=https://localhost:3000${colors.reset}`)
  console.log('')
  console.log(`${colors.gray}  2. Start services with HTTPS enabled${colors.reset}`)
}

main().catch((e) => {
  error(e.message)
  process.exit(1)
})

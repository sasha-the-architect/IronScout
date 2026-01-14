#!/usr/bin/env node
/**
 * Stripe Setup Helper
 * Cross-platform Node.js version
 *
 * Guides you through setting up Stripe for local development.
 *
 * Usage: node scripts/dev/setup-stripe.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
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
  commandExists,
  run,
} from '../lib/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')

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
 * Update or add a key in an env file
 */
function updateEnvFile(filePath, key, value) {
  let content = ''
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8')
  }

  const regex = new RegExp(`^${key}=.*$`, 'm')
  const newLine = `${key}="${value}"`

  if (regex.test(content)) {
    content = content.replace(regex, newLine)
  } else {
    content = content.trim() + '\n' + newLine + '\n'
  }

  writeFileSync(filePath, content)
}

async function main() {
  console.log('')
  console.log('==================================')
  console.log('IronScout Stripe Setup Helper')
  console.log('==================================')
  console.log('')

  // Step 1: Check Stripe CLI
  console.log(`${colors.yellow}Step 1: Stripe CLI Installation${colors.reset}`)
  console.log('')
  console.log('Stripe CLI is needed to test webhooks locally.')
  console.log('Download it from: https://github.com/stripe/stripe-cli/releases')
  console.log('')
  console.log('For Windows (with scoop):')
  console.log('  scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git')
  console.log('  scoop install stripe')
  console.log('')
  console.log('For macOS:')
  console.log('  brew install stripe/stripe-cli/stripe')
  console.log('')

  await prompt('Press Enter once Stripe CLI is installed...')

  if (commandExists('stripe')) {
    success('Stripe CLI found!')
  } else {
    error('Stripe CLI not found in PATH. Please install it first.')
    console.log('After installing, you may need to restart your terminal.')
    process.exit(1)
  }

  // Step 2: Login to Stripe
  console.log('')
  console.log(`${colors.yellow}Step 2: Login to Stripe${colors.reset}`)
  console.log('')
  console.log('This will open your browser to authenticate with Stripe.')
  await prompt('Press Enter to login to Stripe...')

  run('stripe login', { cwd: PROJECT_ROOT })

  // Step 3: Get Stripe Keys
  console.log('')
  console.log(`${colors.yellow}Step 3: Get Stripe Keys${colors.reset}`)
  console.log('')
  console.log('Please visit: https://dashboard.stripe.com/test/apikeys')
  console.log('')
  console.log("You'll need TWO keys:")
  console.log('  1. Publishable key (pk_test_...)')
  console.log('  2. Secret key (sk_test_...)')
  console.log('')

  const publishableKey = await prompt('Enter your Publishable Key (pk_test_...): ')

  // Update web .env.local
  const webEnvPath = resolve(PROJECT_ROOT, 'apps/web/.env.local')
  if (existsSync(webEnvPath) || true) {
    updateEnvFile(webEnvPath, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', publishableKey)
    success('Publishable key saved to apps/web/.env.local')
  }

  // Step 4: Create Premium Product
  console.log('')
  console.log(`${colors.yellow}Step 4: Create Premium Product in Stripe${colors.reset}`)
  console.log('')
  console.log('Please do this manually in Stripe Dashboard:')
  console.log('  1. Visit: https://dashboard.stripe.com/test/products')
  console.log("  2. Click '+ Add product'")
  console.log('  3. Name: IronScout.ai Premium')
  console.log('  4. Description: Premium subscription with AI recommendations')
  console.log('  5. Pricing: Recurring, $49.99/year')
  console.log("  6. Click 'Save product'")
  console.log('')
  await prompt("Press Enter once you've created the product...")
  console.log('')

  const priceId = await prompt('Enter the Price ID (price_...): ')

  // Update API .env
  const apiEnvPath = resolve(PROJECT_ROOT, 'apps/api/.env')
  if (existsSync(apiEnvPath) || true) {
    updateEnvFile(apiEnvPath, 'STRIPE_PRICE_ID_PREMIUM', priceId)
    success('Price ID saved to apps/api/.env')
  }

  // Step 5: Webhook forwarding info
  console.log('')
  console.log(`${colors.yellow}Step 5: Setup Webhook Forwarding${colors.reset}`)
  console.log('')
  console.log('To forward webhooks to your local server, run in a separate terminal:')
  console.log('')
  console.log(`${colors.cyan}  stripe listen --forward-to localhost:8000/api/payments/webhook${colors.reset}`)
  console.log('')
  console.log('The webhook signing secret will be displayed.')
  console.log('Copy it and add to apps/api/.env as STRIPE_WEBHOOK_SECRET')
  console.log('')
  success('Stripe setup complete!')
}

main().catch((e) => {
  error(e.message)
  process.exit(1)
})

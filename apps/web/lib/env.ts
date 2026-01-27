/**
 * Environment Variable Validation
 *
 * This module validates required environment variables at startup.
 * If required variables are missing, the app will fail fast with clear error messages.
 *
 * Usage:
 *   import { env } from '@/lib/env'
 *   const apiUrl = env.NEXT_PUBLIC_API_URL
 */

import { createLogger } from './logger'

const logger = createLogger('env')

// ============================================================================
// Types
// ============================================================================

interface EnvConfig {
  /** Required environment variables - app will fail if missing */
  required: string[]
  /** Optional environment variables with default values */
  optional: Record<string, string>
}

interface ValidatedEnv {
  NEXT_PUBLIC_API_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  JWT_SECRET: string
  NEXTAUTH_URL: string
  // Optional with defaults
  NODE_ENV: string
  NEXT_PUBLIC_E2E_TEST_MODE: string
  ADMIN_EMAILS: string
  COOKIE_DOMAIN: string
}

// ============================================================================
// Configuration
// ============================================================================

const envConfig: EnvConfig = {
  required: [
    'NEXT_PUBLIC_API_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'JWT_SECRET',
    'NEXTAUTH_URL',
  ],
  optional: {
    NODE_ENV: 'development',
    NEXT_PUBLIC_E2E_TEST_MODE: 'false',
    ADMIN_EMAILS: '',
    COOKIE_DOMAIN: '',
  },
}

// ============================================================================
// Validation
// ============================================================================

function validateEnv(): ValidatedEnv {
  const missing: string[] = []
  const validated: Record<string, string> = {}

  // Check required variables
  for (const key of envConfig.required) {
    const value = process.env[key]
    if (!value || value.trim() === '') {
      missing.push(key)
    } else {
      validated[key] = value
    }
  }

  // Apply optional variables with defaults
  for (const [key, defaultValue] of Object.entries(envConfig.optional)) {
    const value = process.env[key]
    validated[key] = value && value.trim() !== '' ? value : defaultValue
  }

  // If any required variables are missing, fail fast
  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}`

    // Log the error
    logger.error(errorMessage, { missing })

    // In production, this should also alert to Slack
    if (process.env.NODE_ENV === 'production') {
      alertMissingEnvVars(missing).catch(console.error)
    }

    // Throw to prevent app startup
    throw new Error(errorMessage)
  }

  return validated as unknown as ValidatedEnv
}

// ============================================================================
// Alerting
// ============================================================================

async function alertMissingEnvVars(missing: string[]): Promise<void> {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!slackWebhookUrl) {
    console.error('[CRITICAL] Missing env vars and no Slack webhook configured')
    return
  }

  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:rotating_light: *IronScout Web App Startup Failed*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:rotating_light: *IronScout Web App Startup Failed*\n\nMissing required environment variables:\n${missing.map(k => `• \`${k}\``).join('\n')}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Environment: \`${process.env.NODE_ENV || 'unknown'}\` | Time: ${new Date().toISOString()}`,
              },
            ],
          },
        ],
      }),
    })
  } catch (error) {
    console.error('[CRITICAL] Failed to send Slack alert for missing env vars:', error)
  }
}

// ============================================================================
// Export
// ============================================================================

/**
 * Validated environment variables.
 * Access this instead of process.env directly to ensure type safety
 * and fail-fast behavior for missing required variables.
 */
export const env = validateEnv()

/**
 * Check if we're in E2E test mode
 */
export const isE2E = env.NEXT_PUBLIC_E2E_TEST_MODE === 'true'

/**
 * Check if we're in production
 */
export const isProd = env.NODE_ENV === 'production'

/**
 * Check if we're in development
 */
export const isDev = env.NODE_ENV === 'development'

/**
 * Runtime Schema Validation Types
 */

export interface SchemaValidationResult {
  valid: boolean
  errors: string[]
}

export interface ConnectivityCheckResult {
  connected: boolean
  error: string | null
}

/**
 * Validates that critical schema elements exist in the database.
 */
export function validateSchema(): Promise<SchemaValidationResult>

/**
 * Validates schema and exits the process if validation fails.
 * Use this at application startup to fail fast before processing any work.
 */
export function validateSchemaOrDie(): Promise<void>

/**
 * Lightweight connectivity check without full schema validation.
 * Use when you just want to verify the database is reachable.
 */
export function checkDatabaseConnectivity(): Promise<ConnectivityCheckResult>

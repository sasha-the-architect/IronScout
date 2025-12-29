/**
 * Credential Encryption Utility
 *
 * AES-256-GCM encryption for sensitive credentials (affiliate feed passwords, etc.)
 *
 * Key storage: CREDENTIAL_ENCRYPTION_KEY_B64 environment variable
 * Format: Base64-encoded 32-byte key
 *
 * Ciphertext payload format:
 * | Offset | Length  | Field                           |
 * |--------|---------|----------------------------------|
 * | 0      | 1 byte  | Version (currently 1)            |
 * | 1      | 12 bytes| IV (random, generated per encrypt)|
 * | 13     | 16 bytes| Auth Tag (from GCM)              |
 * | 29     | N bytes | Ciphertext                       |
 *
 * Associated Data (AAD): Optional context string to prevent copy-paste attacks
 * Example: "feed:{feedId}:v{secretVersion}"
 */

import crypto from 'crypto'

const VERSION = 1
const IV_LEN = 12
const TAG_LEN = 16

let cachedKey: Buffer | null = null

/**
 * Load and validate the encryption key from environment variable.
 * Caches the key after first load.
 *
 * @throws Error if key is missing or invalid
 */
export function loadCredentialKey(): Buffer {
  if (cachedKey) {
    return cachedKey
  }

  const keyB64 = process.env.CREDENTIAL_ENCRYPTION_KEY_B64
  if (!keyB64) {
    throw new Error('Missing CREDENTIAL_ENCRYPTION_KEY_B64 environment variable')
  }

  const key = Buffer.from(keyB64, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY_B64 must decode to exactly 32 bytes (got ${key.length})`
    )
  }

  cachedKey = key
  return key
}

/**
 * Validate that the encryption key is configured correctly.
 * Call this at application startup to fail fast.
 *
 * @throws Error if key is missing or invalid
 */
export function validateCredentialKey(): void {
  loadCredentialKey()
}

/**
 * Clear the cached key (for testing purposes only)
 */
export function clearKeyCache(): void {
  cachedKey = null
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt
 * @param aad - Optional associated data for authentication (e.g., "feed:{feedId}:v{version}")
 * @returns Buffer containing version + IV + tag + ciphertext
 */
export function encryptSecret(plaintext: string, aad?: string): Buffer {
  const key = loadCredentialKey()
  const iv = crypto.randomBytes(IV_LEN)

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'))
  }

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return Buffer.concat([
    Buffer.from([VERSION]),
    iv,
    tag,
    ciphertext,
  ])
}

/**
 * Decrypt a ciphertext payload encrypted with encryptSecret.
 *
 * @param payload - Buffer containing version + IV + tag + ciphertext
 * @param aad - Optional associated data (must match what was used during encryption)
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails or payload is malformed
 */
export function decryptSecret(payload: Buffer, aad?: string): string {
  const minLength = 1 + IV_LEN + TAG_LEN
  if (payload.length < minLength) {
    throw new Error(
      `Ciphertext payload too short (got ${payload.length} bytes, need at least ${minLength})`
    )
  }

  const version = payload.readUInt8(0)
  if (version !== VERSION) {
    throw new Error(`Unsupported secret version ${version} (expected ${VERSION})`)
  }

  const iv = payload.subarray(1, 1 + IV_LEN)
  const tag = payload.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN)
  const ciphertext = payload.subarray(1 + IV_LEN + TAG_LEN)

  const key = loadCredentialKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'))
  }
  decipher.setAuthTag(tag)

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}

/**
 * Build the AAD string for affiliate feed credentials.
 *
 * @param feedId - The affiliate feed ID
 * @param secretVersion - The secret version number
 * @returns AAD string in format "feed:{feedId}:v{secretVersion}"
 */
export function buildFeedCredentialAAD(feedId: string, secretVersion: number): string {
  return `feed:${feedId}:v${secretVersion}`
}

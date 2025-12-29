import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import {
  loadCredentialKey,
  validateCredentialKey,
  clearKeyCache,
  encryptSecret,
  decryptSecret,
  buildFeedCredentialAAD,
} from '../secrets'

// Generate a valid test key
const TEST_KEY = crypto.randomBytes(32)
const TEST_KEY_B64 = TEST_KEY.toString('base64')

describe('secrets', () => {
  beforeEach(() => {
    clearKeyCache()
    process.env.CREDENTIAL_ENCRYPTION_KEY_B64 = TEST_KEY_B64
  })

  afterEach(() => {
    clearKeyCache()
    delete process.env.CREDENTIAL_ENCRYPTION_KEY_B64
  })

  describe('loadCredentialKey', () => {
    it('loads and caches a valid key', () => {
      const key = loadCredentialKey()
      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32)

      // Second call should return cached key
      const key2 = loadCredentialKey()
      expect(key2).toBe(key)
    })

    it('throws if key is missing', () => {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY_B64
      expect(() => loadCredentialKey()).toThrow('Missing CREDENTIAL_ENCRYPTION_KEY_B64')
    })

    it('throws if key is wrong length', () => {
      process.env.CREDENTIAL_ENCRYPTION_KEY_B64 = Buffer.from('too-short').toString('base64')
      expect(() => loadCredentialKey()).toThrow('must decode to exactly 32 bytes')
    })
  })

  describe('validateCredentialKey', () => {
    it('does not throw for valid key', () => {
      expect(() => validateCredentialKey()).not.toThrow()
    })

    it('throws for missing key', () => {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY_B64
      expect(() => validateCredentialKey()).toThrow()
    })
  })

  describe('encryptSecret / decryptSecret', () => {
    it('encrypts and decrypts a simple string', () => {
      const plaintext = 'my-secret-password'
      const ciphertext = encryptSecret(plaintext)

      expect(ciphertext).toBeInstanceOf(Buffer)
      expect(ciphertext.length).toBeGreaterThan(29) // 1 + 12 + 16 + at least 1

      const decrypted = decryptSecret(ciphertext)
      expect(decrypted).toBe(plaintext)
    })

    it('encrypts and decrypts with AAD', () => {
      const plaintext = 'secret-with-aad'
      const aad = 'feed:abc123:v1'
      const ciphertext = encryptSecret(plaintext, aad)

      const decrypted = decryptSecret(ciphertext, aad)
      expect(decrypted).toBe(plaintext)
    })

    it('fails decryption with wrong AAD', () => {
      const plaintext = 'secret-with-aad'
      const aad = 'feed:abc123:v1'
      const ciphertext = encryptSecret(plaintext, aad)

      expect(() => decryptSecret(ciphertext, 'wrong-aad')).toThrow()
    })

    it('fails decryption with missing AAD when encrypted with AAD', () => {
      const plaintext = 'secret-with-aad'
      const aad = 'feed:abc123:v1'
      const ciphertext = encryptSecret(plaintext, aad)

      expect(() => decryptSecret(ciphertext)).toThrow()
    })

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'same-secret'
      const ct1 = encryptSecret(plaintext)
      const ct2 = encryptSecret(plaintext)

      expect(ct1.equals(ct2)).toBe(false)

      // But both decrypt to same plaintext
      expect(decryptSecret(ct1)).toBe(plaintext)
      expect(decryptSecret(ct2)).toBe(plaintext)
    })

    it('handles empty string', () => {
      const plaintext = ''
      const ciphertext = encryptSecret(plaintext)
      const decrypted = decryptSecret(ciphertext)
      expect(decrypted).toBe('')
    })

    it('handles unicode characters', () => {
      const plaintext = 'пароль 密码 🔐'
      const ciphertext = encryptSecret(plaintext)
      const decrypted = decryptSecret(ciphertext)
      expect(decrypted).toBe(plaintext)
    })

    it('handles long strings', () => {
      const plaintext = 'x'.repeat(10000)
      const ciphertext = encryptSecret(plaintext)
      const decrypted = decryptSecret(ciphertext)
      expect(decrypted).toBe(plaintext)
    })
  })

  describe('decryptSecret error handling', () => {
    it('throws for payload too short', () => {
      const shortPayload = Buffer.from([1, 2, 3])
      expect(() => decryptSecret(shortPayload)).toThrow('too short')
    })

    it('throws for unsupported version', () => {
      // Create a valid-length payload with wrong version
      const payload = Buffer.alloc(30)
      payload[0] = 99 // Wrong version
      expect(() => decryptSecret(payload)).toThrow('Unsupported secret version 99')
    })

    it('throws for tampered ciphertext', () => {
      const plaintext = 'secret'
      const ciphertext = encryptSecret(plaintext)

      // Tamper with the ciphertext portion
      ciphertext[ciphertext.length - 1] ^= 0xff

      expect(() => decryptSecret(ciphertext)).toThrow()
    })

    it('throws for tampered auth tag', () => {
      const plaintext = 'secret'
      const ciphertext = encryptSecret(plaintext)

      // Tamper with the auth tag (bytes 13-28)
      ciphertext[15] ^= 0xff

      expect(() => decryptSecret(ciphertext)).toThrow()
    })
  })

  describe('buildFeedCredentialAAD', () => {
    it('builds correct AAD string', () => {
      const aad = buildFeedCredentialAAD('feed123', 1)
      expect(aad).toBe('feed:feed123:v1')
    })

    it('handles different versions', () => {
      const aad = buildFeedCredentialAAD('feed456', 5)
      expect(aad).toBe('feed:feed456:v5')
    })
  })
})

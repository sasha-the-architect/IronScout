/**
 * @ironscout/crypto
 *
 * Cryptographic utilities for IronScout.
 * Currently provides credential encryption for affiliate feeds.
 */

export {
  loadCredentialKey,
  validateCredentialKey,
  clearKeyCache,
  encryptSecret,
  decryptSecret,
  buildFeedCredentialAAD,
} from './secrets'

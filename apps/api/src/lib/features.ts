/**
 * Feature Flags Module - Server Side
 *
 * ============================================================================
 * V1 NOTE
 * ============================================================================
 * Premium/tier feature flags have been removed for v1. All users receive
 * identical capabilities defined in config/tiers.ts (V1_CAPABILITIES).
 *
 * This file is preserved for:
 * - Logging feature status on startup
 * - Future non-premium feature flags
 *
 * Historical premium flag functions have been removed. See tiers.legacy.ts
 * for the original tier configuration.
 * ============================================================================
 */

/**
 * Log feature status on startup (v1: minimal output)
 */
export function logFeatureStatus(): void {
  console.log('[Features] V1 mode: All users receive full capabilities')
}

/**
 * Centralized brand constants for IronScout
 *
 * Use BRAND.name for in-product display (sidebar, headers, titles)
 * Use BRAND.domain for external/marketing contexts only
 */
export const BRAND = {
  /** Primary brand name for in-product usage */
  name: 'IronScout',
  /** Full domain form - use only for external/marketing contexts */
  domain: 'IronScout.ai',
  /** Product tagline */
  tagline: 'AI-Powered Ammo Search',
  /** Official website URL */
  website: 'https://www.ironscout.ai',
  /** Short description */
  description: 'Intent-aware ammunition search and price comparison',
} as const

/** Convenience export for common usage */
export const BRAND_NAME = BRAND.name

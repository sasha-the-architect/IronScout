/**
 * Affiliate Tracking URL Generation
 *
 * This module provides click-time affiliate link generation.
 * Product URLs are stored canonical (without tracking params).
 * Tracking URLs are generated at click time using Source config.
 *
 * @see context/reference/market/affiliate-feed-analysis.md (Item F)
 */

import type { AffiliateNetwork } from '@ironscout/db'

/**
 * Affiliate configuration picked from Source for click-time link generation.
 * This is an in-code type only, not a DB table.
 */
export interface AffiliateContext {
  affiliateNetwork: AffiliateNetwork | null
  affiliateProgramId: string | null
  affiliateAdvertiserId: string | null
  affiliateCampaignId: string | null
  affiliateTrackingTemplate: string | null
}

/**
 * Placeholder tokens supported in tracking templates.
 * Templates use {PLACEHOLDER} syntax.
 */
export const TEMPLATE_PLACEHOLDERS = {
  /** The canonical product URL (URL-encoded) */
  PRODUCT_URL: 'PRODUCT_URL',
  /** The raw product URL (not encoded) */
  PRODUCT_URL_RAW: 'PRODUCT_URL_RAW',
  /** Internal program/partner ID from Source config */
  PROGRAM_ID: 'PROGRAM_ID',
  /** Advertiser/merchant ID from Source config */
  ADVERTISER_ID: 'ADVERTISER_ID',
  /** Campaign ID from Source config */
  CAMPAIGN_ID: 'CAMPAIGN_ID',
} as const

type PlaceholderKey = keyof typeof TEMPLATE_PLACEHOLDERS
const KNOWN_PLACEHOLDERS = new Set<string>(Object.values(TEMPLATE_PLACEHOLDERS))

/**
 * Result of template validation.
 */
export interface TemplateValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validates an affiliate tracking template.
 *
 * @param template - The tracking URL template to validate
 * @returns Validation result with errors and warnings
 */
export function validateTrackingTemplate(
  template: string | null
): TemplateValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!template) {
    return { valid: true, errors, warnings }
  }

  // Check for required product URL placeholder
  const hasProductUrl = template.includes(`{${TEMPLATE_PLACEHOLDERS.PRODUCT_URL}}`)
  const hasProductUrlRaw = template.includes(`{${TEMPLATE_PLACEHOLDERS.PRODUCT_URL_RAW}}`)

  if (!hasProductUrl && !hasProductUrlRaw) {
    errors.push(
      'Template must contain {PRODUCT_URL} or {PRODUCT_URL_RAW} placeholder'
    )
  }

  // Check for unknown placeholders
  const placeholderRegex = /\{([A-Z_]+)\}/g
  let match
  while ((match = placeholderRegex.exec(template)) !== null) {
    const placeholder = match[1]
    if (!KNOWN_PLACEHOLDERS.has(placeholder)) {
      warnings.push(`Unknown placeholder: {${placeholder}}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Result of building a tracking URL.
 */
export interface TrackingUrlResult {
  url: string
  warning?: string
}

/**
 * Builds a tracking URL from a canonical product URL and affiliate context.
 *
 * If no tracking template is configured, returns the original URL unchanged.
 * Templates support placeholder substitution: {PRODUCT_URL}, {ADVERTISER_ID}, etc.
 *
 * @param productUrl - The canonical product URL (stored in Price.url)
 * @param context - Affiliate configuration from Source
 * @returns The tracking-wrapped URL and optional warning
 *
 * @example
 * // Impact-style template
 * const result = buildTrackingUrl(
 *   'https://retailer.com/product/123',
 *   {
 *     affiliateNetwork: 'IMPACT',
 *     affiliateProgramId: 'prog456',
 *     affiliateAdvertiserId: 'abc123',
 *     affiliateCampaignId: 'winter2025',
 *     affiliateTrackingTemplate: 'https://track.impact.com/c/{CAMPAIGN_ID}/a/{ADVERTISER_ID}?url={PRODUCT_URL}'
 *   }
 * )
 * // Returns: { url: 'https://track.impact.com/c/winter2025/a/abc123?url=https%3A%2F%2Fretailer.com%2Fproduct%2F123' }
 */
export function buildTrackingUrl(
  productUrl: string,
  context: AffiliateContext
): TrackingUrlResult {
  // No template configured
  if (!context.affiliateTrackingTemplate) {
    // Warn if network is set but no template - potential revenue leak
    if (context.affiliateNetwork) {
      return {
        url: productUrl,
        warning: `Affiliate network ${context.affiliateNetwork} configured but no tracking template set`,
      }
    }
    return { url: productUrl }
  }

  let result = context.affiliateTrackingTemplate

  // Replace placeholders
  result = result.replace(
    new RegExp(`\\{${TEMPLATE_PLACEHOLDERS.PRODUCT_URL}\\}`, 'g'),
    encodeURIComponent(productUrl)
  )
  result = result.replace(
    new RegExp(`\\{${TEMPLATE_PLACEHOLDERS.PRODUCT_URL_RAW}\\}`, 'g'),
    productUrl
  )
  result = result.replace(
    new RegExp(`\\{${TEMPLATE_PLACEHOLDERS.PROGRAM_ID}\\}`, 'g'),
    context.affiliateProgramId ?? ''
  )
  result = result.replace(
    new RegExp(`\\{${TEMPLATE_PLACEHOLDERS.ADVERTISER_ID}\\}`, 'g'),
    context.affiliateAdvertiserId ?? ''
  )
  result = result.replace(
    new RegExp(`\\{${TEMPLATE_PLACEHOLDERS.CAMPAIGN_ID}\\}`, 'g'),
    context.affiliateCampaignId ?? ''
  )

  return { url: result }
}

/**
 * Extracts AffiliateContext from a Source record.
 * Use this when you have a full Source object and need just the tracking fields.
 */
export function extractAffiliateContext(source: {
  affiliateNetwork: AffiliateNetwork | null
  affiliateProgramId: string | null
  affiliateAdvertiserId: string | null
  affiliateCampaignId: string | null
  affiliateTrackingTemplate: string | null
}): AffiliateContext {
  return {
    affiliateNetwork: source.affiliateNetwork,
    affiliateProgramId: source.affiliateProgramId,
    affiliateAdvertiserId: source.affiliateAdvertiserId,
    affiliateCampaignId: source.affiliateCampaignId,
    affiliateTrackingTemplate: source.affiliateTrackingTemplate,
  }
}

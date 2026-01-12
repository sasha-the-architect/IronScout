'use client'

/**
 * V1: Upgrade banners are disabled.
 * This component returns null and renders nothing.
 *
 * Preserved as a placeholder for future premium implementation.
 */

interface UpgradeBannerProps {
  title?: string
  description?: string
  feature?: string
  dismissible?: boolean
  variant?: 'banner' | 'card' | 'inline'
}

export function UpgradeBanner(_props: UpgradeBannerProps) {
  // V1: No upgrade banners
  return null
}

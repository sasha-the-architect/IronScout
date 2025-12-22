'use client'

import { QuickStartChecklist } from '../molecules/quick-start-checklist'
import { useWatchlist } from '@/hooks/use-watchlist'

interface OnboardingPanelProps {
  /** Whether user has any alerts configured */
  hasAlerts?: boolean
  /** Whether user has viewed trends page */
  hasViewedTrends?: boolean
}

/**
 * OnboardingPanel - Wrapper for Quick Start checklist
 *
 * Fetches watchlist data to determine onboarding progress.
 * Hides automatically when user completes all steps.
 */
export function OnboardingPanel({ hasAlerts = false, hasViewedTrends = false }: OnboardingPanelProps) {
  const { data, loading } = useWatchlist()

  // Don't show during loading
  if (loading) {
    return null
  }

  const savedCount = data?.items?.length ?? 0

  // If user has items saved, they've completed the first key step
  // Show checklist to guide them through remaining steps
  return (
    <QuickStartChecklist
      savedCount={savedCount}
      alertCount={hasAlerts ? 1 : 0}
      hasViewedTrends={hasViewedTrends}
    />
  )
}

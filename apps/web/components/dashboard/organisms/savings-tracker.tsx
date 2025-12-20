'use client'

import { SavingsCard, SavingsCardSkeleton } from '../molecules/savings-card'
import { useSavings } from '@/hooks/use-savings'

interface SavingsTrackerProps {
  isPremium?: boolean
}

/**
 * SavingsTracker - Savings tracking section
 *
 * Displays user's savings data in a compact card.
 * Free: Potential savings
 * Premium: Verified savings with ROI messaging
 */
export function SavingsTracker({ isPremium = false }: SavingsTrackerProps) {
  const { data, loading, error } = useSavings()

  if (loading) {
    return <SavingsCardSkeleton />
  }

  if (error || !data) {
    return null // Gracefully hide on error
  }

  return <SavingsCard savings={data.savings} isPremium={isPremium} />
}

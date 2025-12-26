'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { ViewToggle, type ViewMode } from '@/components/results/view-toggle'
import { EnhancedSortSelect } from './sort-select'
import { useViewPreference } from '@/hooks/use-view-preference'

interface SearchControlsProps {
  isPremium?: boolean
}

/**
 * SearchControls - Client component for view toggle + sort
 *
 * Combines view mode toggle and sort dropdown in a single row.
 */
export function SearchControls({ isPremium = false }: SearchControlsProps) {
  const [viewMode, setViewMode] = useViewPreference('card')

  return (
    <div className="flex flex-col items-end gap-1">
      <ViewToggle value={viewMode} onChange={setViewMode} />
      <EnhancedSortSelect isPremium={isPremium} />
    </div>
  )
}

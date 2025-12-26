'use client'

import { Loader2 } from 'lucide-react'
import { useSearchLoading } from './search-loading-context'

/**
 * SearchLoadingOverlay - Shows a loading indicator over search results
 *
 * Displays when search or sort operations are in progress.
 * Uses the SearchLoadingContext to know when to show.
 */
export function SearchLoadingOverlay() {
  const { isSearching } = useSearchLoading()

  if (!isSearching) return null

  return (
    <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-lg transition-opacity duration-200">
      <div className="flex flex-col items-center gap-3 p-4 bg-background/90 rounded-xl shadow-lg border border-border">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Updating results...</p>
      </div>
    </div>
  )
}

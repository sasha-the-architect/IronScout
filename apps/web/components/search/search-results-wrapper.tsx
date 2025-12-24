'use client'

import { useEffect, ReactNode } from 'react'
import { useSearchLoading } from './search-loading-context'

interface SearchResultsWrapperProps {
  children: ReactNode
}

/**
 * Client wrapper that signals when search results have loaded.
 * Wraps the server-rendered SearchResults component.
 */
export function SearchResultsWrapper({ children }: SearchResultsWrapperProps) {
  const { endSearch } = useSearchLoading()

  // Signal that results have loaded when this component mounts
  useEffect(() => {
    endSearch()
  }, [endSearch])

  return <>{children}</>
}

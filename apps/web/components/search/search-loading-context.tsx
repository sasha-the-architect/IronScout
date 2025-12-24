'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface SearchLoadingContextType {
  isSearching: boolean
  startSearch: () => void
  endSearch: () => void
}

const SearchLoadingContext = createContext<SearchLoadingContextType>({
  isSearching: false,
  startSearch: () => {},
  endSearch: () => {},
})

export function SearchLoadingProvider({ children }: { children: ReactNode }) {
  const [isSearching, setIsSearching] = useState(false)

  const startSearch = useCallback(() => setIsSearching(true), [])
  const endSearch = useCallback(() => setIsSearching(false), [])

  return (
    <SearchLoadingContext.Provider value={{ isSearching, startSearch, endSearch }}>
      {children}
    </SearchLoadingContext.Provider>
  )
}

export function useSearchLoading() {
  return useContext(SearchLoadingContext)
}

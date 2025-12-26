'use client'

import { createContext, useContext, useTransition, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

interface SearchLoadingContextType {
  isSearching: boolean
  navigateWithLoading: (url: string) => void
}

const SearchLoadingContext = createContext<SearchLoadingContextType>({
  isSearching: false,
  navigateWithLoading: () => {},
})

export function SearchLoadingProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const navigateWithLoading = useCallback((url: string) => {
    startTransition(() => {
      router.push(url)
    })
  }, [router])

  return (
    <SearchLoadingContext.Provider value={{ isSearching: isPending, navigateWithLoading }}>
      {children}
    </SearchLoadingContext.Provider>
  )
}

export function useSearchLoading() {
  return useContext(SearchLoadingContext)
}

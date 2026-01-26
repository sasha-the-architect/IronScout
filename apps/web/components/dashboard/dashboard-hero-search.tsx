'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSearchSuggestions } from '@/lib/api'
import { QuickCaliberFilters } from './quick-caliber-filters'
import { createLogger } from '@/lib/logger'

const logger = createLogger('components:dashboard-hero-search')

const exampleQueries = [
  "9mm for home defense",
  "cheap bulk .223 for the range",
  "match grade .308 long range",
  "subsonic 300 blackout",
]

const advancedExampleQueries = [
  "9mm for compact carry, low flash",
  "subsonic .300 blackout for suppressor",
  "short barrel optimized defense ammo",
]

interface DashboardHeroSearchProps {
  userCalibersFromAlerts?: string[]
}

export function DashboardHeroSearch({
  userCalibersFromAlerts = []
}: DashboardHeroSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const handleSearch = (searchQuery?: string) => {
    const q = searchQuery || query
    if (q.trim()) {
      setShowSuggestions(false)
      router.push(`/search?q=${encodeURIComponent(q.trim())}`)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  // Fetch suggestions on input change
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([])
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        const results = await getSearchSuggestions(query)
        setSuggestions(results.slice(0, 5))
      } catch (error) {
        logger.error('Failed to fetch suggestions', {}, error)
      }
    }, 200)

    return () => clearTimeout(timeoutId)
  }, [query])

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="w-full">
      {/* Search Bar */}
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            {/* AI indicator */}
            <div className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-[#00C2CB]" aria-label="intent-aware search" />
            </div>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Describe what you're looking for..."
              className="w-full pl-12 md:pl-14 pr-28 md:pr-32 py-4 md:py-5 text-lg md:text-xl border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:border-[#00C2CB] focus:ring-4 focus:ring-[#00C2CB]/20 transition-all bg-white dark:bg-gray-800 shadow-sm"
            />

            {/* Clear button */}
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="absolute right-28 md:right-32 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
                aria-label="Clear search"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              size="lg"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#00C2CB] hover:bg-[#00A8B0] rounded-xl px-4 md:px-6 motion-reduce:transition-none"
              aria-label={isLoading ? "Searching..." : "Search"}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <>
                  <Search className="h-4 w-4 md:mr-2" aria-hidden="true" />
                  <span className="hidden md:inline">Search</span>
                </>
              )}
            </Button>
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              role="listbox"
              aria-label="Search suggestions"
              className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  role="option"
                  onClick={() => {
                    setQuery(suggestion)
                    handleSearch(suggestion)
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors motion-reduce:transition-none focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700"
                >
                  <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Example queries */}
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {exampleQueries.map((example, i) => (
              <button
                key={i}
                onClick={() => {
                  setQuery(example)
                  handleSearch(example)
                }}
                className="text-sm px-4 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 hover:border-[#00C2CB] hover:bg-[#00C2CB]/5 transition-colors text-gray-600 dark:text-gray-400 hover:text-[#00C2CB] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none"
              >
                "{example}"
              </button>
            ))}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <p className="text-sm text-muted-foreground">Advanced examples:</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {advancedExampleQueries.map((example, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(example)
                    handleSearch(example)
                  }}
                  className="text-sm px-4 py-2.5 rounded-full border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 motion-reduce:transition-none"
                >
                  "{example}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Caliber Filters */}
        <div className="mt-8">
          <p className="text-sm text-muted-foreground text-center mb-3">Quick filters:</p>
          <QuickCaliberFilters userCalibersFromAlerts={userCalibersFromAlerts} />
        </div>
      </div>
    </div>
  )
}

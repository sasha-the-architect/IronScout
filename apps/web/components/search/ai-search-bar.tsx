'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSearchSuggestions } from '@/lib/api'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ai-search-bar')

interface AISearchBarProps {
  initialQuery?: string
}

const exampleQueries = [
  "best 9mm for home defense",
  "cheap bulk .223 for the range",
  "match grade .308 long range",
  "AR15 ammo for beginners",
  "subsonic 300 blackout",
]

export function AISearchBar({ initialQuery = '' }: AISearchBarProps) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
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
    <div className="max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          {/* AI indicator */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
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
            className="w-full pl-12 pr-28 py-4 text-lg border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all bg-white dark:bg-gray-800 shadow-sm"
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="absolute right-24 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setQuery(suggestion)
                  handleSearch(suggestion)
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
              >
                <Search className="h-4 w-4 text-gray-400" />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Example queries - shown when no query */}
      {!query && (
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {exampleQueries.map((example, i) => (
              <button
                key={i}
                onClick={() => {
                  setQuery(example)
                  handleSearch(example)
                }}
                className="text-sm px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-gray-600 dark:text-gray-400 hover:text-blue-600"
              >
                "{example}"
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

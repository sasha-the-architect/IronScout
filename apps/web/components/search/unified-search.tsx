'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Sparkles, X, Loader2, SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSearchSuggestions } from '@/lib/api'

// Common calibers for the ammunition market
const CALIBERS = [
  '9mm', '.45 ACP', '.40 S&W', '.380 ACP', '.38 Special', '.357 Magnum',
  '.223 Remington', '5.56 NATO', '.308 Winchester', '7.62x39', '6.5 Creedmoor',
  '.300 Blackout', '12 Gauge', '20 Gauge', '.22 LR', '.17 HMR'
]

const PURPOSES = [
  'Target', 'Defense', 'Hunting', 'Competition', 'Plinking', 'Training'
]

const CASE_MATERIALS = [
  'Brass', 'Steel', 'Aluminum', 'Nickel-Plated'
]

const GRAIN_RANGES = [
  { label: 'Light (< 100gr)', min: 0, max: 99 },
  { label: 'Medium (100-150gr)', min: 100, max: 150 },
  { label: 'Heavy (150-180gr)', min: 150, max: 180 },
  { label: 'Very Heavy (180+gr)', min: 180, max: 999 },
]

const exampleQueries = [
  "best 9mm for home defense",
  "cheap bulk .223 for the range",
  "match grade .308 long range",
  "AR15 ammo for beginners",
  "subsonic 300 blackout",
]

interface UnifiedSearchProps {
  initialQuery?: string
}

export function UnifiedSearch({ initialQuery = '' }: UnifiedSearchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Search state
  const [query, setQuery] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Filter state
  const [filtersOpen, setFiltersOpen] = useState(false)
  
  // Get current filter values from URL
  const getFiltersFromUrl = () => ({
    caliber: searchParams.get('caliber') || '',
    purpose: searchParams.get('purpose') || '',
    caseMaterial: searchParams.get('caseMaterial') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minGrain: searchParams.get('minGrain') || '',
    maxGrain: searchParams.get('maxGrain') || '',
    inStock: searchParams.get('inStock') === 'true',
  })

  const [filters, setFilters] = useState(getFiltersFromUrl())
  
  // Count active filters
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'inStock') return value === true
    return value !== ''
  }).length

  // Auto-open filters if any are active
  useEffect(() => {
    if (activeFilterCount > 0 && !filtersOpen) {
      setFiltersOpen(true)
    }
  }, [])

  // Sync filters with URL
  useEffect(() => {
    setFilters(getFiltersFromUrl())
  }, [searchParams])

  // Handle search
  const handleSearch = (searchQuery?: string) => {
    const q = searchQuery || query
    if (q.trim()) {
      setShowSuggestions(false)
      const params = new URLSearchParams(searchParams.toString())
      params.set('q', q.trim())
      params.delete('page') // Reset to page 1
      router.push(`/search?${params.toString()}`)
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
        console.error('Failed to fetch suggestions:', error)
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

  // Filter methods
  const applyFilters = (newFilters: typeof filters) => {
    const params = new URLSearchParams(searchParams.toString())
    
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value === '' || value === false) {
        params.delete(key)
      } else {
        params.set(key, String(value))
      }
    })
    
    params.delete('page')
    router.push(`/search?${params.toString()}`)
  }

  const clearFilters = () => {
    const clearedFilters = {
      caliber: '',
      purpose: '',
      caseMaterial: '',
      minPrice: '',
      maxPrice: '',
      minGrain: '',
      maxGrain: '',
      inStock: false,
    }
    setFilters(clearedFilters)
    
    const params = new URLSearchParams()
    const query = searchParams.get('q')
    const sortBy = searchParams.get('sortBy')
    if (query) params.set('q', query)
    if (sortBy) params.set('sortBy', sortBy)
    
    router.push(`/search?${params.toString()}`)
  }

  const handleSelectChange = (key: keyof typeof filters, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    applyFilters(newFilters)
  }

  const handleCheckboxChange = (checked: boolean) => {
    const newFilters = { ...filters, inStock: checked }
    setFilters(newFilters)
    applyFilters(newFilters)
  }

  const [priceTimeout, setPriceTimeout] = useState<NodeJS.Timeout | null>(null)
  
  const handlePriceChange = (key: 'minPrice' | 'maxPrice', value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    
    if (priceTimeout) clearTimeout(priceTimeout)
    setPriceTimeout(setTimeout(() => {
      applyFilters(newFilters)
    }, 500))
  }

  const handleGrainRange = (min: number, max: number) => {
    const newFilters = { 
      ...filters, 
      minGrain: String(min), 
      maxGrain: String(max) 
    }
    setFilters(newFilters)
    applyFilters(newFilters)
  }

  return (
    <div className="w-full">
      {/* AI Search Bar */}
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
        {!query && !filtersOpen && (
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

      {/* Advanced Filters Toggle */}
      <div className="max-w-3xl mx-auto mt-4">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all mx-auto ${
            filtersOpen 
              ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-foreground' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="font-medium text-sm">Advanced Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-500 text-white rounded-full text-xs font-semibold min-w-[20px] text-center">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {filtersOpen && (
        <div className="mt-6 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Refine Your Search</h3>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground h-8"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Clear all
              </Button>
            )}
          </div>
          
          {/* Filter Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Caliber */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Caliber
              </label>
              <select
                value={filters.caliber}
                onChange={(e) => handleSelectChange('caliber', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                <option value="">All calibers</option>
                {CALIBERS.map(cal => (
                  <option key={cal} value={cal}>{cal}</option>
                ))}
              </select>
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Purpose
              </label>
              <select
                value={filters.purpose}
                onChange={(e) => handleSelectChange('purpose', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                <option value="">All purposes</option>
                {PURPOSES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Case Material */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Case Material
              </label>
              <select
                value={filters.caseMaterial}
                onChange={(e) => handleSelectChange('caseMaterial', e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                <option value="">All materials</option>
                {CASE_MATERIALS.map(mat => (
                  <option key={mat} value={mat}>{mat}</option>
                ))}
              </select>
            </div>

            {/* Min Price */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Min Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  value={filters.minPrice}
                  onChange={(e) => handlePriceChange('minPrice', e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="w-full pl-7 pr-3 py-2 text-sm border rounded-lg bg-background focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Max Price */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Max Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  value={filters.maxPrice}
                  onChange={(e) => handlePriceChange('maxPrice', e.target.value)}
                  placeholder="Any"
                  min="0"
                  step="0.01"
                  className="w-full pl-7 pr-3 py-2 text-sm border rounded-lg bg-background focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* In Stock Only */}
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.inStock}
                  onChange={(e) => handleCheckboxChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium">In Stock Only</span>
              </label>
            </div>
          </div>

          {/* Grain Weight Quick Selects */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Grain Weight
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const newFilters = { ...filters, minGrain: '', maxGrain: '' }
                  setFilters(newFilters)
                  applyFilters(newFilters)
                }}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  !filters.minGrain && !filters.maxGrain
                    ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`}
              >
                Any weight
              </button>
              {GRAIN_RANGES.map(range => {
                const isActive = filters.minGrain === String(range.min) && filters.maxGrain === String(range.max)
                return (
                  <button
                    key={range.label}
                    onClick={() => handleGrainRange(range.min, range.max)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      isActive
                        ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                    {range.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Helper text */}
          <p className="mt-4 text-xs text-muted-foreground">
            Filters work alongside AI search to narrow your results. The AI will still understand your intent while respecting your explicit criteria.
          </p>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Sparkles, X, Loader2, SlidersHorizontal, ChevronDown, RotateCcw, TrendingUp, Bell, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSearchSuggestions } from '@/lib/api'
import { PremiumFilters } from '@/components/premium'
import { cn } from '@/lib/utils'
import { useSearchLoading } from './search-loading-context'
import { createLogger } from '@/lib/logger'

const logger = createLogger('unified-search')

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

// Rotating placeholder examples - outcome-driven
const ROTATING_PLACEHOLDERS = [
  "Find the best 9mm deals for range practice",
  "Cheap .223 for target shooting",
  "Home defense 9mm hollow points",
  "Bulk 5.56 NATO for training",
  ".308 match grade for long range",
]

// Quick-start example chips
const EXAMPLE_CHIPS = [
  { label: '9mm bulk', query: '9mm bulk for range' },
  { label: '.223 range ammo', query: '.223 cheap target practice' },
  { label: 'home defense', query: '9mm hollow point home defense' },
  { label: '.22 LR', query: '.22 LR bulk cheap' },
  { label: '5.56 NATO', query: '5.56 NATO M855 bulk' },
]

// Popular searches for social proof
const TRENDING_SEARCHES = [
  '9mm bulk',
  '.223 range ammo',
  '5.56 green tip',
]

const premiumExampleQueries = [
  "9mm for compact carry, low flash",
  "subsonic .300 blackout for suppressor",
  "short barrel optimized defense ammo",
]

interface UnifiedSearchProps {
  initialQuery?: string
  isPremium?: boolean
}

export function UnifiedSearch({ initialQuery = '', isPremium: _isPremium = false }: UnifiedSearchProps) {
  const searchParams = useSearchParams()
  const { isSearching, navigateWithLoading } = useSearchLoading()

  // Search state
  const [query, setQuery] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Filter state - collapsed by default
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [premiumFiltersOpen, setPremiumFiltersOpen] = useState(false)

  // Rotate placeholder text
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % ROTATING_PLACEHOLDERS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Autofocus on mount
  useEffect(() => {
    if (!initialQuery && inputRef.current) {
      inputRef.current.focus()
    }
  }, [])
  
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
  
  // Count active filters (basic)
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'inStock') return value === true
    return value !== ''
  }).length

  // Count Premium filters
  const premiumFilterKeys = ['bulletType', 'pressureRating', 'isSubsonic', 'shortBarrelOptimized', 
                             'suppressorSafe', 'lowFlash', 'lowRecoil', 'matchGrade']
  const premiumFiltersActive = premiumFilterKeys.filter(k => searchParams.get(k)).length

  // Auto-open filters if any are active
  useEffect(() => {
    if (activeFilterCount > 0 && !filtersOpen) {
      setFiltersOpen(true)
    }
    if (premiumFiltersActive > 0 && !premiumFiltersOpen) {
      setPremiumFiltersOpen(true)
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
      navigateWithLoading(`/search?${params.toString()}`)
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
    navigateWithLoading(`/search?${params.toString()}`)
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

    navigateWithLoading(`/search?${params.toString()}`)
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
      {/* Hero Search Bar - Tactical Console Style */}
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            {/* AI Search - confident positioning */}
            <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <div className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-mono text-xs font-bold tracking-wider transition-all",
                isSearching && "animate-pulse"
              )}>
                <Sparkles className={cn("h-4 w-4", isSearching && "animate-spin")} />
                <span className="text-xs font-semibold">AI</span>
              </div>
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
              placeholder={ROTATING_PLACEHOLDERS[placeholderIndex]}
              className="w-full pl-24 sm:pl-28 pr-36 py-5 text-lg bg-transparent border-2 border-border rounded-2xl focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/60 transition-all shadow-lg hover:shadow-xl dark:shadow-primary/5"
            />

            {/* Clear button */}
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="absolute right-28 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            <Button
              type="submit"
              disabled={isSearching}
              size="lg"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary/90 rounded-xl px-5 font-semibold tracking-wide shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200"
            >
              {isSearching ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Confident AI helper - only show when no query */}
          {!query && (
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Describe what you need. I'll handle the filters.
            </p>
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-10 w-full mt-2 bg-background rounded-xl shadow-lg border border-border overflow-hidden"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setQuery(suggestion)
                    handleSearch(suggestion)
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-muted flex items-center gap-3 transition-colors"
                >
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Quick-start chips - shown when no query */}
        {!query && (
          <div className="mt-6 space-y-5">
            {/* Value proposition - what search unlocks */}
            <p className="text-sm text-muted-foreground text-center">
              Compare prices across retailers. Save what you find.
            </p>

            {/* Clickable example chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_CHIPS.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(chip.query)
                    handleSearch(chip.query)
                  }}
                  className="px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/50 transition-all text-sm font-medium text-foreground shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Social proof - trending searches with stronger label */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full font-medium">
                <TrendingUp className="h-3 w-3" />
                Popular today
              </span>
              {TRENDING_SEARCHES.map((term, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(term)
                    handleSearch(term)
                  }}
                  className="hover:text-primary transition-colors underline-offset-2 hover:underline font-medium"
                >
                  {term}{i < TRENDING_SEARCHES.length - 1 ? ',' : ''}
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-border">
              <div className="flex items-center justify-center gap-2 mb-2">
                <p className="text-xs text-muted-foreground font-medium">Advanced searches:</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {premiumExampleQueries.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuery(example)
                      handleSearch(example)
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-muted-foreground"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Refine Toggle - Minimal, secondary action */}
      {query && (
        <div className="max-w-4xl mx-auto mt-2 flex items-center justify-center">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs ${
              filtersOpen || activeFilterCount > 0
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>
              {activeFilterCount > 0 ? `Refine (${activeFilterCount})` : 'Refine results'}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {/* Refine Panel */}
      {filtersOpen && (
        <div className="max-w-4xl mx-auto mt-3 p-4 bg-muted/30 rounded-xl border border-border/50 animate-in slide-in-from-top-2 duration-200">
          {activeFilterCount > 0 && (
            <div className="flex justify-end mb-3">
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Clear
              </button>
            </div>
          )}

          {/* Core 3 filters - always visible */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Caliber */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Caliber
              </label>
              <select
                value={filters.caliber}
                onChange={(e) => handleSelectChange('caliber', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              >
                <option value="">All calibers</option>
                {CALIBERS.map(cal => (
                  <option key={cal} value={cal}>{cal}</option>
                ))}
              </select>
            </div>

            {/* Total Price */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Total Price
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    value={filters.minPrice}
                    onChange={(e) => handlePriceChange('minPrice', e.target.value)}
                    placeholder="Min"
                    min="0"
                    step="0.01"
                    className="w-full pl-6 pr-2 py-2.5 text-sm border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  />
                </div>
                <span className="text-muted-foreground">–</span>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    value={filters.maxPrice}
                    onChange={(e) => handlePriceChange('maxPrice', e.target.value)}
                    placeholder="Max"
                    min="0"
                    step="0.01"
                    className="w-full pl-6 pr-2 py-2.5 text-sm border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* In Stock Toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer w-full px-3 py-2.5 border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={filters.inStock}
                  onChange={(e) => handleCheckboxChange(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm">In stock only</span>
              </label>
            </div>
          </div>

          {/* Advanced Refinements - collapsed by default */}
          <details className="mt-3 pt-3 border-t border-border/50 group">
            <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1.5">
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              Advanced refinements
            </summary>

            <div className="mt-3 space-y-3">
              {/* Purpose, Case Material, Grain - in a compact row */}
              <div className="grid grid-cols-3 gap-3">
                <select
                  value={filters.purpose}
                  onChange={(e) => handleSelectChange('purpose', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:border-primary transition-colors"
                >
                  <option value="">Purpose</option>
                  {PURPOSES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <select
                  value={filters.caseMaterial}
                  onChange={(e) => handleSelectChange('caseMaterial', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:border-primary transition-colors"
                >
                  <option value="">Case material</option>
                  {CASE_MATERIALS.map(mat => (
                    <option key={mat} value={mat}>{mat}</option>
                  ))}
                </select>

                <select
                  value={filters.minGrain && filters.maxGrain ? `${filters.minGrain}-${filters.maxGrain}` : ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      const newFilters = { ...filters, minGrain: '', maxGrain: '' }
                      setFilters(newFilters)
                      applyFilters(newFilters)
                    } else {
                      const [min, max] = e.target.value.split('-').map(Number)
                      handleGrainRange(min, max)
                    }
                  }}
                  className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:border-primary transition-colors"
                >
                  <option value="">Grain weight</option>
                  {GRAIN_RANGES.map(range => (
                    <option key={range.label} value={`${range.min}-${range.max}`}>{range.label}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setPremiumFiltersOpen(!premiumFiltersOpen)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>Performance filters</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${premiumFiltersOpen ? 'rotate-180' : ''}`} />
                </button>
                {premiumFiltersOpen && (
                  <div className="mt-2">
                    <PremiumFilters isPremium />
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

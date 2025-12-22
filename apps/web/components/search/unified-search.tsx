'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Sparkles, X, Loader2, SlidersHorizontal, ChevronDown, RotateCcw, Crown, TrendingUp, Bell, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSearchSuggestions } from '@/lib/api'
import { PremiumFilters } from '@/components/premium'

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

export function UnifiedSearch({ initialQuery = '', isPremium = false }: UnifiedSearchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Search state
  const [query, setQuery] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
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
      {/* Hero Search Bar */}
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            {/* AI Search - confident positioning */}
            <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold">AI Search</span>
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
              className="w-full pl-28 sm:pl-32 pr-32 py-5 text-lg border-2 border-border rounded-2xl focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all bg-background shadow-lg hover:shadow-xl"
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
              disabled={isLoading}
              size="lg"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary/90 rounded-xl px-6"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Confident AI helper */}
          <p className="mt-2 text-xs text-muted-foreground text-center">
            Describe what you need. I'll handle the filters.
          </p>

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
            {/* Outcome-oriented CTA - prime the save loop */}
            <div className="flex items-center justify-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bell className="h-4 w-4 text-primary" />
                <span>Track price drops automatically</span>
              </div>
              <span className="text-muted-foreground/50">•</span>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bookmark className="h-4 w-4 text-primary" />
                <span>Save your first search</span>
              </div>
            </div>

            {/* Clickable example chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_CHIPS.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(chip.query)
                    handleSearch(chip.query)
                  }}
                  className="px-4 py-2 rounded-full border border-border bg-background hover:border-primary hover:bg-primary/5 transition-all text-sm font-medium text-foreground shadow-sm hover:shadow"
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

            {/* Premium examples */}
            {isPremium && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Crown className="h-3 w-3 text-amber-500" />
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Advanced searches:</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {premiumExampleQueries.map((example, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setQuery(example)
                        handleSearch(example)
                      }}
                      className="text-xs px-3 py-1.5 rounded-full border border-amber-200 dark:border-amber-800 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors text-amber-700 dark:text-amber-400"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter Toggle - Discoverable */}
      <div className="max-w-4xl mx-auto mt-6 flex items-center justify-center">
        <div className="relative group">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm ${
              filtersOpen || activeFilterCount > 0
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active` : 'Filters'}
            </span>
            {/* Count badge - shows available filters */}
            {!filtersOpen && activeFilterCount === 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-muted-foreground/20 rounded-full">
                8+
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
          {/* Hover preview tooltip */}
          {!filtersOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-foreground text-background text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              Caliber, price, purpose, case material, bullet weight...
            </div>
          )}
        </div>
      </div>

      {/* Basic Filters Panel */}
      {filtersOpen && (
        <div className="max-w-4xl mx-auto mt-4 p-5 bg-muted/30 rounded-xl border border-border animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground">Quick Filters</h3>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

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

            {/* Price Range */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Price Range
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

          {/* Expandable advanced filters */}
          <details className="mt-4 group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              More options
            </summary>

            <div className="mt-4 pt-4 border-t border-border space-y-4">
              {/* Purpose & Casing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Purpose
                  </label>
                  <select
                    value={filters.purpose}
                    onChange={(e) => handleSelectChange('purpose', e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  >
                    <option value="">Any purpose</option>
                    {PURPOSES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Brass or Steel
                    <span className="ml-1 text-[10px] text-muted-foreground/70">(case material)</span>
                  </label>
                  <select
                    value={filters.caseMaterial}
                    onChange={(e) => handleSelectChange('caseMaterial', e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  >
                    <option value="">Any material</option>
                    {CASE_MATERIALS.map(mat => (
                      <option key={mat} value={mat}>{mat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bullet Weight */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  Bullet weight
                  <span className="ml-1 text-[10px] text-muted-foreground/70">(heavier = more stopping power)</span>
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
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    Any
                  </button>
                  {GRAIN_RANGES.map(range => {
                    const isActive = filters.minGrain === String(range.min) && filters.maxGrain === String(range.max)
                    return (
                      <button
                        key={range.label}
                        onClick={() => handleGrainRange(range.min, range.max)}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                          isActive
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'border-border hover:border-primary hover:bg-primary/5'
                        }`}
                      >
                        {range.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Premium Filters - Aspirational framing */}
              <div className="pt-4 border-t border-border">
                <button
                  onClick={() => setPremiumFiltersOpen(!premiumFiltersOpen)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Crown className="h-4 w-4 text-amber-500" />
                  <span>Advanced filters used by serious buyers</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${premiumFiltersOpen ? 'rotate-180' : ''}`} />
                </button>
                <p className="text-xs text-muted-foreground mt-1">
                  Subsonic, match grade, suppressor-safe, low flash
                </p>

                {premiumFiltersOpen && (
                  <div className="mt-4">
                    <PremiumFilters isPremium={isPremium} />
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

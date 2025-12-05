'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X, ChevronDown, SlidersHorizontal, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

interface AdvancedFiltersProps {
  isOpen: boolean
  onToggle: () => void
}

export function AdvancedFilters({ isOpen, onToggle }: AdvancedFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Get current filter values from URL
  const currentFilters = {
    caliber: searchParams.get('caliber') || '',
    purpose: searchParams.get('purpose') || '',
    caseMaterial: searchParams.get('caseMaterial') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minGrain: searchParams.get('minGrain') || '',
    maxGrain: searchParams.get('maxGrain') || '',
    inStock: searchParams.get('inStock') === 'true',
  }

  const [filters, setFilters] = useState(currentFilters)
  
  // Count active filters
  const activeFilterCount = Object.entries(currentFilters).filter(([key, value]) => {
    if (key === 'inStock') return value === true
    return value !== ''
  }).length

  // Update URL when filters change (with debounce for text inputs)
  const applyFilters = (newFilters: typeof filters) => {
    const params = new URLSearchParams(searchParams.toString())
    
    // Update each filter in URL
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value === '' || value === false) {
        params.delete(key)
      } else {
        params.set(key, String(value))
      }
    })
    
    // Reset to page 1 when filters change
    params.delete('page')
    
    router.push(`/search?${params.toString()}`)
  }

  // Clear all filters
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
    
    // Keep only the query param
    const params = new URLSearchParams()
    const query = searchParams.get('q')
    const sortBy = searchParams.get('sortBy')
    if (query) params.set('q', query)
    if (sortBy) params.set('sortBy', sortBy)
    
    router.push(`/search?${params.toString()}`)
  }

  // Handle select changes
  const handleSelectChange = (key: keyof typeof filters, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    applyFilters(newFilters)
  }

  // Handle checkbox change
  const handleCheckboxChange = (checked: boolean) => {
    const newFilters = { ...filters, inStock: checked }
    setFilters(newFilters)
    applyFilters(newFilters)
  }

  // Handle price changes with debounce
  const [priceTimeout, setPriceTimeout] = useState<NodeJS.Timeout | null>(null)
  
  const handlePriceChange = (key: 'minPrice' | 'maxPrice', value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    
    if (priceTimeout) clearTimeout(priceTimeout)
    setPriceTimeout(setTimeout(() => {
      applyFilters(newFilters)
    }, 500))
  }

  // Handle grain range selection
  const handleGrainRange = (min: number, max: number) => {
    const newFilters = { 
      ...filters, 
      minGrain: String(min), 
      maxGrain: String(max) 
    }
    setFilters(newFilters)
    applyFilters(newFilters)
  }

  // Sync local state with URL params
  useEffect(() => {
    setFilters(currentFilters)
  }, [searchParams])

  return (
    <div className="border-b">
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 px-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span>Advanced Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full text-xs">
              {activeFilterCount} active
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div className="pb-6 pt-2 space-y-6 animate-in slide-in-from-top-2 duration-200">
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
          <div>
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

          {/* Clear Filters Button */}
          {activeFilterCount > 0 && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

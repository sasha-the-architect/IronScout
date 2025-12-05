'use client'

import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { ExplicitFilters } from '@/lib/api'

interface SearchIntent {
  calibers?: string[]
  purpose?: string
  grainWeights?: number[]
  caseMaterials?: string[]
  brands?: string[]
  qualityLevel?: string
  confidence: number
}

interface SearchHeaderProps {
  query: string
  resultCount?: number
  intent?: SearchIntent
  processingTimeMs?: number
  vectorSearchUsed?: boolean
  hasFilters?: boolean
  explicitFilters?: ExplicitFilters
}

export function SearchHeader({ 
  query, 
  resultCount, 
  intent, 
  processingTimeMs,
  vectorSearchUsed,
  hasFilters,
  explicitFilters
}: SearchHeaderProps) {
  const [showDetails, setShowDetails] = useState(false)
  
  const hasIntent = intent && (
    intent.calibers?.length || 
    intent.purpose || 
    intent.grainWeights?.length ||
    intent.qualityLevel
  )

  // Build list of active explicit filters for display
  const activeFilters: Array<{ label: string; value: string; color: string }> = []
  if (explicitFilters) {
    if (explicitFilters.caliber) {
      activeFilters.push({ label: 'Caliber', value: explicitFilters.caliber, color: 'blue' })
    }
    if (explicitFilters.purpose) {
      activeFilters.push({ label: 'Purpose', value: explicitFilters.purpose, color: 'purple' })
    }
    if (explicitFilters.caseMaterial) {
      activeFilters.push({ label: 'Case', value: explicitFilters.caseMaterial, color: 'yellow' })
    }
    if (explicitFilters.minGrain !== undefined || explicitFilters.maxGrain !== undefined) {
      const grainRange = explicitFilters.minGrain && explicitFilters.maxGrain 
        ? `${explicitFilters.minGrain}-${explicitFilters.maxGrain}gr`
        : explicitFilters.minGrain ? `${explicitFilters.minGrain}+gr` : `≤${explicitFilters.maxGrain}gr`
      activeFilters.push({ label: 'Grain', value: grainRange, color: 'green' })
    }
    if (explicitFilters.minPrice !== undefined || explicitFilters.maxPrice !== undefined) {
      const priceRange = explicitFilters.minPrice !== undefined && explicitFilters.maxPrice !== undefined
        ? `$${explicitFilters.minPrice}-$${explicitFilters.maxPrice}`
        : explicitFilters.minPrice !== undefined ? `$${explicitFilters.minPrice}+` : `≤$${explicitFilters.maxPrice}`
      activeFilters.push({ label: 'Price', value: priceRange, color: 'emerald' })
    }
    if (explicitFilters.inStock) {
      activeFilters.push({ label: 'Stock', value: 'In Stock Only', color: 'teal' })
    }
    if (explicitFilters.brand) {
      activeFilters.push({ label: 'Brand', value: explicitFilters.brand, color: 'indigo' })
    }
  }

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
      purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
      green: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
      yellow: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300',
      orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
      emerald: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
      teal: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300',
      indigo: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
    }
    return colorMap[color] || colorMap.blue
  }

  return (
    <div className="border-b pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {query ? `Results for "${query}"` : 'Browse Products'}
          </h1>
          
          {resultCount !== undefined && (
            <p className="text-muted-foreground">
              Found {resultCount.toLocaleString()} products
              {processingTimeMs && (
                <span className="text-sm ml-2">({processingTimeMs}ms)</span>
              )}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {hasFilters && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full">
              <SlidersHorizontal className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Filtered</span>
            </div>
          )}
          {vectorSearchUsed && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200 dark:border-blue-800 rounded-full">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-medium text-blue-600">AI Search</span>
            </div>
          )}
        </div>
      </div>

      {/* Active Explicit Filters */}
      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilters.map((filter, i) => (
            <span 
              key={i} 
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${getColorClasses(filter.color)}`}
            >
              {filter.label}: {filter.value}
            </span>
          ))}
        </div>
      )}

      {/* AI Understanding Panel */}
      {hasIntent && (
        <div className="mt-4">
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Sparkles className="h-4 w-4 text-purple-500" />
            <span>AI understood your search</span>
            {showDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          
          {showDetails && (
            <div className="mt-3 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
              <p className="text-xs text-muted-foreground mb-2">
                {hasFilters 
                  ? "AI interpretation (your filters override these):" 
                  : "AI interpretation of your search:"}
              </p>
              <div className="flex flex-wrap gap-2">
                {intent.calibers?.map((cal, i) => (
                  <span key={i} className={`px-2 py-1 rounded text-xs font-medium ${
                    explicitFilters?.caliber 
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 line-through' 
                      : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                  }`}>
                    Caliber: {cal}
                  </span>
                ))}
                {intent.purpose && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    explicitFilters?.purpose 
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 line-through' 
                      : 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                  }`}>
                    Purpose: {intent.purpose}
                  </span>
                )}
                {(intent.grainWeights?.length ?? 0) > 0 && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    explicitFilters?.minGrain !== undefined || explicitFilters?.maxGrain !== undefined
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 line-through' 
                      : 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                  }`}>
                    Grain: {intent.grainWeights?.join('/') ?? ''}gr
                  </span>
                )}
                {intent.caseMaterials?.map((mat, i) => (
                  <span key={i} className={`px-2 py-1 rounded text-xs font-medium ${
                    explicitFilters?.caseMaterial 
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 line-through' 
                      : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                  }`}>
                    Case: {mat}
                  </span>
                ))}
                {intent.qualityLevel && (
                  <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded text-xs font-medium">
                    Quality: {intent.qualityLevel}
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Confidence: {Math.round(intent.confidence * 100)}%
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

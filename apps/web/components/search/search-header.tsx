'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react'

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
}

export function SearchHeader({ 
  query, 
  resultCount, 
  intent, 
  processingTimeMs,
  vectorSearchUsed 
}: SearchHeaderProps) {
  const [showDetails, setShowDetails] = useState(false)
  
  const hasIntent = intent && (
    intent.calibers?.length || 
    intent.purpose || 
    intent.grainWeights?.length ||
    intent.qualityLevel
  )

  return (
    <div className="border-b pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {query ? `Search results for "${query}"` : 'Browse Products'}
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
        
        {vectorSearchUsed && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200 dark:border-blue-800 rounded-full">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs font-medium text-blue-600">AI Search</span>
          </div>
        )}
      </div>

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
              <div className="flex flex-wrap gap-2">
                {intent.calibers?.map((cal, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                    Caliber: {cal}
                  </span>
                ))}
                {intent.purpose && (
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                    Purpose: {intent.purpose}
                  </span>
                )}
                {(intent.grainWeights?.length ?? 0) > 0 && (
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded text-xs font-medium">
                    Grain: {intent.grainWeights?.join('/') ?? ''}gr
                  </span>
                )}
                {intent.caseMaterials?.map((mat, i) => (
                  <span key={i} className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 rounded text-xs font-medium">
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

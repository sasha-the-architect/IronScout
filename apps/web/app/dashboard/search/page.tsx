import { Suspense } from 'react'
import { SearchResults } from '@/components/search/search-results'
import { UnifiedSearch } from '@/components/search/unified-search'
import { EnhancedSortSelect } from '@/components/search/sort-select'

interface SearchPageProps {
  searchParams: Promise<{
    q?: string
    category?: string
    brand?: string
    minPrice?: string
    maxPrice?: string
    inStock?: string
    caliber?: string
    grainWeight?: string
    minGrain?: string
    maxGrain?: string
    caseMaterial?: string
    purpose?: string
    sortBy?: 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc' | 'relevance' | 'best_value'
    page?: string
    // Performance filters
    bulletType?: string
    pressureRating?: string
    isSubsonic?: string
    shortBarrelOptimized?: string
    suppressorSafe?: string
    lowFlash?: string
    lowRecoil?: string
    matchGrade?: string
    minVelocity?: string
    maxVelocity?: string
  }>
}

export default async function DashboardSearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams
  const query = params.q || ''

  return (
    <div className="p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Search</h1>
        <p className="text-muted-foreground mt-1">
          Search built for ammo to find the right listings
        </p>
      </div>

      {/* Unified Search Interface - Suspense required for useSearchParams */}
      <div className="mb-8">
        <Suspense fallback={
          <div className="h-16 animate-pulse bg-muted rounded-2xl" />
        }>
          <UnifiedSearch initialQuery={query} />
        </Suspense>
      </div>

      {/* Sort & Results */}
      <div className="flex flex-col">
        {query && (
          <div className="flex justify-end mb-4">
            <Suspense fallback={<div className="h-10 w-40 animate-pulse bg-muted rounded" />}>
              <EnhancedSortSelect />
            </Suspense>
          </div>
        )}
        <Suspense fallback={
          <div className="text-center py-12">
            <div className="animate-pulse flex flex-col items-center">
              <div className="w-12 h-12 bg-gray-200 rounded-full mb-4"></div>
              <div className="h-4 w-48 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 w-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        }>
          <SearchResults searchParams={params} />
        </Suspense>
      </div>
    </div>
  )
}

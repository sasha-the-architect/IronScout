import { Suspense } from 'react'
import { SearchResults } from '@/components/search/search-results'
import { UnifiedSearch } from '@/components/search/unified-search'
import { SearchLoadingOverlay } from '@/components/search/search-loading-overlay'
import { auth } from '@/lib/auth'

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
    // Premium filters
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

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams
  const query = params.q || ''
  
  // Get session for user tier
  const session = await auth()
  const userTier = (session?.user as any)?.tier || 'FREE'
  const isPremium = userTier === 'PREMIUM'

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Unified Search Interface - Suspense required for useSearchParams */}
      <div className="mb-4">
        <Suspense fallback={
          <div className="h-16 animate-pulse bg-muted rounded-2xl" />
        }>
          <UnifiedSearch initialQuery={query} isPremium={isPremium} />
        </Suspense>
      </div>

      {/* Results */}
      <div className="relative flex flex-col">
        <SearchLoadingOverlay />
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

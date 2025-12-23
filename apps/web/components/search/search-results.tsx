import { auth } from '@/lib/auth'
import { aiSearch, getAds, AISearchResponse, ExplicitFilters } from '@/lib/api'
import { ProductCard } from '@/components/products/product-card'
import { AdCard } from '@/components/ads/ad-card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Search, Crown, Bookmark, TrendingUp, Bell } from 'lucide-react'
import { SearchHeader } from './search-header'
import { AIExplanationBanner } from '@/components/premium'
import Link from 'next/link'

interface SearchResultsProps {
  searchParams: {
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
  }
}

export async function SearchResults({ searchParams }: SearchResultsProps) {
  const query = searchParams.q || ''
  const page = parseInt(searchParams.page || '1')
  const sortBy = searchParams.sortBy || 'relevance'
  
  // Get session for user tier and token
  const session = await auth()
  const accessToken = (session as any)?.accessToken
  const userTier = (session?.user as any)?.tier || 'FREE'
  const isPremium = userTier === 'PREMIUM'
  
  // Build explicit filters from URL params
  const explicitFilters: ExplicitFilters = {}
  
  // Basic filters
  if (searchParams.caliber) explicitFilters.caliber = searchParams.caliber
  if (searchParams.purpose) explicitFilters.purpose = searchParams.purpose
  if (searchParams.caseMaterial) explicitFilters.caseMaterial = searchParams.caseMaterial
  if (searchParams.minPrice) explicitFilters.minPrice = parseFloat(searchParams.minPrice)
  if (searchParams.maxPrice) explicitFilters.maxPrice = parseFloat(searchParams.maxPrice)
  if (searchParams.minGrain) explicitFilters.minGrain = parseInt(searchParams.minGrain)
  if (searchParams.maxGrain) explicitFilters.maxGrain = parseInt(searchParams.maxGrain)
  if (searchParams.inStock === 'true') explicitFilters.inStock = true
  if (searchParams.brand) explicitFilters.brand = searchParams.brand
  
  // Premium filters (only apply if user is Premium)
  if (isPremium) {
    if (searchParams.bulletType) explicitFilters.bulletType = searchParams.bulletType as any
    if (searchParams.pressureRating) explicitFilters.pressureRating = searchParams.pressureRating as any
    if (searchParams.isSubsonic === 'true') explicitFilters.isSubsonic = true
    if (searchParams.shortBarrelOptimized === 'true') explicitFilters.shortBarrelOptimized = true
    if (searchParams.suppressorSafe === 'true') explicitFilters.suppressorSafe = true
    if (searchParams.lowFlash === 'true') explicitFilters.lowFlash = true
    if (searchParams.lowRecoil === 'true') explicitFilters.lowRecoil = true
    if (searchParams.matchGrade === 'true') explicitFilters.matchGrade = true
    if (searchParams.minVelocity) explicitFilters.minVelocity = parseInt(searchParams.minVelocity)
    if (searchParams.maxVelocity) explicitFilters.maxVelocity = parseInt(searchParams.maxVelocity)
  }
  
  // Check if any explicit filters are active
  const hasFilters = Object.keys(explicitFilters).length > 0
  
  // Count Premium filters
  const premiumFilterKeys = ['bulletType', 'pressureRating', 'isSubsonic', 'shortBarrelOptimized', 
                             'suppressorSafe', 'lowFlash', 'lowRecoil', 'matchGrade', 'minVelocity', 'maxVelocity']
  const premiumFiltersActive = premiumFilterKeys.filter(k => searchParams[k as keyof typeof searchParams]).length
  
  // No query = search bar handles the empty state, just return null
  if (!query) {
    return null
  }

  try {
    const [searchData, adsData] = await Promise.all([
      aiSearch({
        query,
        page,
        limit: 20,
        sortBy: sortBy as any,
        token: accessToken,
        filters: hasFilters ? explicitFilters : undefined,
      }),
      getAds('middle', searchParams.category)
    ])

    const { products, pagination, intent, searchMetadata, _meta } = searchData as AISearchResponse & { _meta?: any }
    const { ads } = adsData

    if (products.length === 0) {
      return (
        <>
          <SearchHeader 
            query={query} 
            resultCount={0}
            intent={intent}
            processingTimeMs={searchMetadata.processingTimeMs}
            vectorSearchUsed={searchMetadata.vectorSearchUsed}
            hasFilters={hasFilters}
            isPremium={isPremium}
          />
          <div className="text-center py-12 mt-6">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">No products found for "{query}"</p>
            {hasFilters ? (
              <p className="text-muted-foreground mb-6">
                Try removing some filters or adjusting your search
              </p>
            ) : (
              <p className="text-muted-foreground mb-6">Try adjusting your search or being more specific</p>
            )}
            
            {intent && intent.confidence < 0.5 && !hasFilters && (
              <div className="max-w-md mx-auto p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Tip:</strong> Try being more specific about caliber or purpose. 
                  For example: "9mm hollow point for carry" or ".308 match ammo"
                </p>
              </div>
            )}
          </div>
        </>
      )
    }

    // Mix in ads every 4 products
    const mixedResults: Array<{ type: 'product' | 'ad'; data: any }> = []
    let adIndex = 0

    products.forEach((product, index) => {
      mixedResults.push({ type: 'product', data: product })
      
      if ((index + 1) % 4 === 0 && adIndex < ads.length) {
        mixedResults.push({ type: 'ad', data: ads[adIndex] })
        adIndex++
      }
    })

    return (
      <>
        <SearchHeader
          query={query}
          resultCount={pagination.total}
          intent={intent}
          processingTimeMs={searchMetadata.processingTimeMs}
          vectorSearchUsed={searchMetadata.vectorSearchUsed}
          hasFilters={hasFilters}
          explicitFilters={explicitFilters}
          isPremium={isPremium}
          premiumFiltersActive={premiumFiltersActive}
        />

        <div className="space-y-6 mt-6">
          {/* Retention hint - contextual, after value delivered */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/30 py-2 px-4 rounded-lg">
            <Bookmark className="h-4 w-4 text-primary" />
            <span>Save items to get price drop alerts</span>
          </div>

          {/* AI Explanation Banner */}
          <AIExplanationBanner
            intent={intent}
            isPremium={isPremium}
            processingTimeMs={searchMetadata.processingTimeMs}
          />
          
          {/* Results Limited Banner */}
          {_meta?.resultsLimited && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                  <Crown className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    Showing {_meta.maxResults} of {(pagination as any).actualTotal} results
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Upgrade to Premium to see all results
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                <Link href="/pricing">
                  Upgrade
                </Link>
              </Button>
            </div>
          )}

          {/* Premium Features Used Banner */}
          {isPremium && searchMetadata.premiumFeaturesUsed && searchMetadata.premiumFeaturesUsed.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <Crown className="h-4 w-4" />
              <span>Premium features active: {searchMetadata.premiumFeaturesUsed.join(', ')}</span>
            </div>
          )}

          {/* Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {mixedResults.map((item, index) => (
              <div key={`${item.type}-${index}`}>
                {item.type === 'product' ? (
                  <ProductCard
                    product={item.data}
                    showRelevance={sortBy === 'relevance' || sortBy === 'best_value'}
                    showPremiumFeatures={isPremium}
                  />
                ) : (
                  <AdCard ad={item.data} />
                )}
              </div>
            ))}
          </div>

          {/* Post-search premium bridge - contextual, after value delivered */}
          {!isPremium && products.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">See how prices have changed</p>
                  <p className="text-xs text-muted-foreground">Historical trends and advanced filters</p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/pricing">
                  Unlock
                </Link>
              </Button>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center space-x-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                asChild
              >
                <a href={`/search?${new URLSearchParams({ 
                  ...Object.fromEntries(
                    Object.entries(searchParams).filter(([_, v]) => v !== undefined) as [string, string][]
                  ), 
                  page: (page - 1).toString() 
                })}`}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </a>
              </Button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  const pageNum = i + 1
                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      asChild
                    >
                      <a href={`/search?${new URLSearchParams({ 
                        ...Object.fromEntries(
                          Object.entries(searchParams).filter(([_, v]) => v !== undefined) as [string, string][]
                        ), 
                        page: pageNum.toString() 
                      })}`}>
                        {pageNum}
                      </a>
                    </Button>
                  )
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                asChild
              >
                <a href={`/search?${new URLSearchParams({ 
                  ...Object.fromEntries(
                    Object.entries(searchParams).filter(([_, v]) => v !== undefined) as [string, string][]
                  ), 
                  page: (page + 1).toString() 
                })}`}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </>
    )
  } catch (error) {
    console.error('Search error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return (
      <>
        <SearchHeader query={query} isPremium={isPremium} />
        <div className="text-center py-12 mt-6 space-y-2">
          <p className="text-muted-foreground font-semibold">Failed to load search results</p>
          <p className="text-sm text-muted-foreground">Reason: {message}</p>
          <p className="text-xs text-muted-foreground">
            If running locally, ensure the API is up and env vars are set (`NEXT_PUBLIC_API_URL` on web; `OPENAI_API_KEY`, `DATABASE_URL` on API).
          </p>
          <div className="flex justify-center gap-3 pt-2 text-sm">
            <a className="text-primary underline" href="/search">Try again</a>
            <a className="text-primary underline" href="/help">Help</a>
          </div>
        </div>
      </>
    )
  }
}

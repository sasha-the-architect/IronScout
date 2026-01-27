import { auth } from '@/lib/auth'
import { aiSearch, AISearchResponse, ExplicitFilters } from '@/lib/api'
import { SearchResultsGridV2 } from '@/components/results'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { SearchHeader } from './search-header'
import { createLogger } from '@/lib/logger'

const logger = createLogger('search-results')

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
  }
}

export async function SearchResults({ searchParams }: SearchResultsProps) {
  const query = searchParams.q || ''
  const page = parseInt(searchParams.page || '1')
  const sortBy = searchParams.sortBy || 'relevance'
  
  // Get session for user tier and token (server-side auth handles refresh)
  const session = await auth()
  const accessToken = session?.accessToken
  
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
  
  // Check if any explicit filters are active
  const hasFilters = Object.keys(explicitFilters).length > 0
  
  // No query = search bar handles the empty state, just return null
  if (!query) {
    return null
  }

  try {
    const searchData = await aiSearch({
      query,
      page,
      limit: 20,
      sortBy: sortBy as any,
      token: accessToken,
      filters: hasFilters ? explicitFilters : undefined,
    })

    const { products, pagination, intent, searchMetadata, _meta } = searchData as AISearchResponse & { _meta?: any }

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

    // Use products.length for display count - more accurate than pagination.total
    // which may be incorrect due to grouping or backend inconsistencies
    const displayCount = products.length > 0 ? Math.max(products.length, pagination.total) : pagination.total

    return (
      <>
        <SearchHeader
          query={query}
          resultCount={displayCount}
          intent={intent}
          processingTimeMs={searchMetadata.processingTimeMs}
          vectorSearchUsed={searchMetadata.vectorSearchUsed}
          hasFilters={hasFilters}
          explicitFilters={explicitFilters}
        />

        {/* Results Zone */}
        <div className="space-y-4">
          {/* Results Limited Banner */}
          {_meta?.resultsLimited && (
            <div className="bg-muted/40 border border-border rounded-xl p-4">
              <p className="font-medium text-foreground">
                Showing {_meta.maxResults} of {(pagination as any).actualTotal} results
              </p>
            </div>
          )}

          {/* Results Grid - v2 with multi-retailer comparison */}
          <SearchResultsGridV2 products={products} />

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

          {/* Soft closing nudge - captures hesitant users without pressure */}
          <div className="mt-10 text-center">
            <p className="text-sm font-medium text-foreground mb-1">
              Not ready to buy?
            </p>
            <p className="text-sm text-muted-foreground">
              Save items and IronScout will alert you if prices drop.
            </p>
          </div>
        </div>
      </>
    )
  } catch (error) {
    logger.error('Search error', {}, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return (
      <>
        <SearchHeader query={query} />
        <div className="text-center py-12 mt-6 space-y-2">
          <p className="text-muted-foreground font-semibold">Unable to load search results</p>
          <p className="text-sm text-muted-foreground">
            Something went wrong. Please try again in a moment.
          </p>
          <div className="flex justify-center gap-3 pt-4 text-sm">
            <a className="text-primary underline" href="/search">Try again</a>
            <a className="text-primary underline" href="/help">Help</a>
          </div>
        </div>
      </>
    )
  }
}

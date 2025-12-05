import { auth } from '@/lib/auth'
import { aiSearch, getAds, AISearchResponse, ExplicitFilters } from '@/lib/api'
import { ProductCard } from '@/components/products/product-card'
import { AdCard } from '@/components/ads/ad-card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Sparkles, Search, Crown, SlidersHorizontal } from 'lucide-react'
import { SearchHeader } from './search-header'
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
    sortBy?: 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc' | 'relevance'
    page?: string
  }
}

export async function SearchResults({ searchParams }: SearchResultsProps) {
  const query = searchParams.q || ''
  const page = parseInt(searchParams.page || '1')
  const sortBy = searchParams.sortBy || 'relevance'
  
  // Get session for user tier
  const session = await auth()
  const userId = session?.user?.id
  
  // Build explicit filters from URL params
  const explicitFilters: ExplicitFilters = {}
  if (searchParams.caliber) explicitFilters.caliber = searchParams.caliber
  if (searchParams.purpose) explicitFilters.purpose = searchParams.purpose
  if (searchParams.caseMaterial) explicitFilters.caseMaterial = searchParams.caseMaterial
  if (searchParams.minPrice) explicitFilters.minPrice = parseFloat(searchParams.minPrice)
  if (searchParams.maxPrice) explicitFilters.maxPrice = parseFloat(searchParams.maxPrice)
  if (searchParams.minGrain) explicitFilters.minGrain = parseInt(searchParams.minGrain)
  if (searchParams.maxGrain) explicitFilters.maxGrain = parseInt(searchParams.maxGrain)
  if (searchParams.inStock === 'true') explicitFilters.inStock = true
  if (searchParams.brand) explicitFilters.brand = searchParams.brand
  
  // Check if any explicit filters are active
  const hasFilters = Object.keys(explicitFilters).length > 0
  
  if (!query) {
    return (
      <div className="text-center py-16">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Search with AI</h2>
          <p className="text-muted-foreground mb-6">
            Describe what you're looking for in plain English. Our AI will find the perfect match.
          </p>
          <div className="space-y-2 text-sm text-left bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <p className="font-medium mb-2">Try searching for:</p>
            <p className="text-muted-foreground">"best 9mm for home defense"</p>
            <p className="text-muted-foreground">"cheap bulk .223 for target practice"</p>
            <p className="text-muted-foreground">"match grade 6.5 Creedmoor"</p>
            <p className="text-muted-foreground">"AR15 ammo for beginners"</p>
          </div>
        </div>
      </div>
    )
  }

  try {
    const [searchData, adsData] = await Promise.all([
      aiSearch({ 
        query, 
        page, 
        limit: 20, 
        sortBy: sortBy as any,
        userId,
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
        />
        
        <div className="space-y-6 mt-6">
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

          {/* Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {mixedResults.map((item, index) => (
              <div key={`${item.type}-${index}`}>
                {item.type === 'product' ? (
                  <ProductCard product={item.data} showRelevance={sortBy === 'relevance'} />
                ) : (
                  <AdCard ad={item.data} />
                )}
              </div>
            ))}
          </div>

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
    return (
      <>
        <SearchHeader query={query} />
        <div className="text-center py-12 mt-6">
          <p className="text-muted-foreground">Failed to load search results</p>
          <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
        </div>
      </>
    )
  }
}

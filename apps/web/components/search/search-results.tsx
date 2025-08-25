import { searchProducts, getAds } from '@/lib/api'
import { ProductCard } from '@/components/products/product-card'
import { AdCard } from '@/components/ads/ad-card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SearchResultsProps {
  searchParams: {
    q?: string
    category?: string
    minPrice?: string
    maxPrice?: string
    page?: string
  }
}

export async function SearchResults({ searchParams }: SearchResultsProps) {
  const query = searchParams.q || ''
  const page = parseInt(searchParams.page || '1')
  
  if (!query) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Enter a search term to find products</p>
      </div>
    )
  }

  try {
    const [productsData, adsData] = await Promise.all([
      searchProducts({ ...searchParams, q: query }),
      getAds('middle', searchParams.category)
    ])

    const { products, pagination } = productsData
    const { ads } = adsData

    if (products.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No products found for "{query}"</p>
          <p className="text-sm text-muted-foreground mt-2">Try adjusting your search terms or filters</p>
        </div>
      )
    }

    const mixedResults = []
    let adIndex = 0

    products.forEach((product, index) => {
      mixedResults.push({ type: 'product', data: product })
      
      if ((index + 1) % 4 === 0 && adIndex < ads.length) {
        mixedResults.push({ type: 'ad', data: ads[adIndex] })
        adIndex++
      }
    })

    return (
      <div className="space-y-6">
        {/* Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {mixedResults.map((item, index) => (
            <div key={`${item.type}-${index}`}>
              {item.type === 'product' ? (
                <ProductCard product={item.data} />
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
              <a href={`/search?${new URLSearchParams({ ...searchParams, page: (page - 1).toString() })}`}>
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
                    <a href={`/search?${new URLSearchParams({ ...searchParams, page: pageNum.toString() })}`}>
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
              <a href={`/search?${new URLSearchParams({ ...searchParams, page: (page + 1).toString() })}`}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </a>
            </Button>
          </div>
        )}
      </div>
    )
  } catch (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load search results</p>
        <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
      </div>
    )
  }
}

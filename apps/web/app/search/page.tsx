import { Suspense } from 'react'
import { SearchResults } from '@/components/search/search-results'
import { UnifiedSearch } from '@/components/search/unified-search'
import { SortSelect } from '@/components/search/sort-select'

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
    sortBy?: 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc' | 'relevance'
    page?: string
  }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams
  const query = params.q || ''

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Unified Search Interface */}
      <div className="mb-8">
        <UnifiedSearch initialQuery={query} />
      </div>

      {/* Sort & Results */}
      <div className="flex flex-col">
        {query && (
          <div className="flex justify-end mb-4">
            <SortSelect />
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

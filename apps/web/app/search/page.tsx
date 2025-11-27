import { Suspense } from 'react'
import { SearchResults } from '@/components/search/search-results'
import { SearchFilters } from '@/components/search/search-filters'
import { SearchHeader } from '@/components/search/search-header'
import { SortSelect } from '@/components/search/sort-select'

interface SearchPageProps {
  searchParams: {
    q?: string
    category?: string
    brand?: string
    minPrice?: string
    maxPrice?: string
    inStock?: string
    sortBy?: string
    page?: string
  }
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q || ''

  return (
    <div className="container mx-auto px-4 py-6">
      <SearchHeader query={query} />

      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        {/* Filters Sidebar - Hidden on mobile, shown on desktop */}
        <aside className="w-full lg:w-64 flex-shrink-0">
          <SearchFilters />
        </aside>

        {/* Main Content */}
        <div className="flex-1">
          <div className="flex justify-end mb-4">
            <SortSelect />
          </div>
          <Suspense fallback={<div className="text-center py-8">Loading results...</div>}>
            <SearchResults searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

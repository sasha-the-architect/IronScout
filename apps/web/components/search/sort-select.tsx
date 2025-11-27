'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function SortSelect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentSort = searchParams.get('sortBy') || 'relevance'

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'relevance') {
      params.delete('sortBy')
    } else {
      params.set('sortBy', value)
    }
    params.delete('page') // Reset to page 1 when sort changes
    router.push(`/search?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-sm font-medium">
        Sort by:
      </label>
      <select
        id="sort"
        value={currentSort}
        onChange={(e) => handleSortChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
      >
        <option value="relevance">Relevance</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="date_desc">Newest First</option>
        <option value="date_asc">Oldest First</option>
      </select>
    </div>
  )
}

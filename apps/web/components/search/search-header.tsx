import { formatNumber } from '@/lib/utils'

interface SearchHeaderProps {
  query: string
  resultCount?: number
}

export function SearchHeader({ query, resultCount }: SearchHeaderProps) {
  return (
    <div className="border-b pb-4">
      <h1 className="text-2xl md:text-3xl font-bold mb-2">
        {query ? `Search results for "${query}"` : 'Browse Products'}
      </h1>
      {resultCount !== undefined && (
        <p className="text-muted-foreground">
          Found {resultCount.toLocaleString()} products
        </p>
      )}
    </div>
  )
}

'use client'

import { useSearchParams } from 'next/navigation'
import { ArrowUpDown, Sparkles, DollarSign, Calendar } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSearchLoading } from './search-loading-context'

interface EnhancedSortSelectProps {
  isPremium?: boolean
}

// ADR-006: No deal scores or value judgments - removed "Best Value" sort option
const SORT_OPTIONS = [
  {
    value: 'relevance',
    label: 'Relevance',
    icon: Sparkles,
    description: 'Relevance ranking tuned for ammo',
  },
  {
    value: 'price_asc',
    label: 'Price: Low to High',
    icon: DollarSign,
    description: 'Lowest price first',
  },
  {
    value: 'price_desc',
    label: 'Price: High to Low',
    icon: DollarSign,
    description: 'Highest price first',
  },
  {
    value: 'date_desc',
    label: 'Newest First',
    icon: Calendar,
    description: 'Most recently added',
  },
  {
    value: 'date_asc',
    label: 'Oldest First',
    icon: Calendar,
    description: 'Oldest products first',
  },
]

export function EnhancedSortSelect({ isPremium: _isPremium = false }: EnhancedSortSelectProps) {
  const searchParams = useSearchParams()
  const { navigateWithLoading } = useSearchLoading()

  const currentSort = searchParams.get('sortBy') || 'relevance'

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'relevance') {
      params.delete('sortBy')
    } else {
      params.set('sortBy', value)
    }
    params.delete('page')
    navigateWithLoading(`/search?${params.toString()}`)
  }

  const currentOption = SORT_OPTIONS.find(o => o.value === currentSort)

  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
      <label htmlFor="sort" className="text-sm font-medium hidden sm:block">
        Sort:
      </label>

      <Select value={currentSort} onValueChange={handleSortChange}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue>
            <div className="flex items-center gap-2">
              {currentOption && (
                <>
                  <currentOption.icon className="h-3.5 w-3.5" />
                  <span>{currentOption.label}</span>
                </>
              )}
            </div>
          </SelectValue>
        </SelectTrigger>

        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <option.icon className="h-4 w-4 text-muted-foreground" />
                <span>{option.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Simple sort select (original version for backwards compatibility)
 */
export function SortSelect() {
  const searchParams = useSearchParams()
  const { navigateWithLoading } = useSearchLoading()

  const currentSort = searchParams.get('sortBy') || 'relevance'

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'relevance') {
      params.delete('sortBy')
    } else {
      params.set('sortBy', value)
    }
    params.delete('page')
    navigateWithLoading(`/search?${params.toString()}`)
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

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Search, TrendingUp, ArrowRight } from 'lucide-react'

const exampleQueries = [
  "9mm hollow point",
  "bulk .223 brass case",
  ".308 match grade",
  "5.56 green tip",
  "300 blackout subsonic",
]

export function Hero() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`)
    }
  }

  const handleExampleClick = (example: string) => {
    setQuery(example)
    router.push(`/search?q=${encodeURIComponent(example)}`)
  }

  return (
    <section className="relative py-16 lg:py-24 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800" />

      <div className="container mx-auto px-4 relative">
        <div className="max-w-4xl mx-auto text-center">
          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Intent-aware ammo search
            <span className="block mt-2 text-muted-foreground font-normal text-3xl md:text-4xl lg:text-5xl">
              with real price history
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-4 max-w-2xl mx-auto">
            IronScout uses AI to understand ammo listings across retailers, helping you search by intent, compare prices over time, and spot deals that stand out from recent history.
          </p>

          <p className="text-lg md:text-xl font-medium text-foreground mb-8">
            Track prices. See context. Miss fewer deals.
          </p>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto mb-6">
            <form onSubmit={handleSearch} className="relative">
              <div className="relative flex items-center">
                <div className="absolute left-4 flex items-center gap-2">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by caliber, brand, or use case..."
                  className="w-full pl-12 pr-32 py-4 text-lg border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all bg-white dark:bg-gray-800 shadow-lg"
                />
                <Button
                  type="submit"
                  size="lg"
                  className="absolute right-2 rounded-xl"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </form>
          </div>

          {/* Example Queries */}
          <div className="mb-10">
            <p className="text-sm text-muted-foreground mb-3">Try:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {exampleQueries.map((example, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(example)}
                  className="text-sm px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-gray-600 dark:text-gray-400 hover:text-blue-600"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/dashboard">
                <TrendingUp className="mr-2 h-4 w-4" />
                Start Tracking Prices
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/search">
                Explore Current Deals
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

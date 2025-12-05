'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Search, Sparkles, ArrowRight, MessageSquare } from 'lucide-react'

const exampleQueries = [
  "best 9mm for home defense",
  "cheap bulk .223 for target practice",
  "match grade .308 for long range",
  "AR15 ammo for beginners",
  "subsonic 300 blackout for suppressor",
]

export function Hero() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [placeholder, setPlaceholder] = useState(exampleQueries[0])
  const [isTyping, setIsTyping] = useState(false)

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
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200 dark:border-blue-800 rounded-full px-4 py-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                AI-Powered Search — Beyond Simple Filters
              </span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Search for Ammo Like You're
            <span className="block mt-2 pb-1 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent box-decoration-clone">
              Talking to an Expert
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Forget dropdowns and filters. Just describe what you need in plain English.
            Our AI understands caliber, purpose, platform, and finds the perfect match.
          </p>

          {/* AI Search Box */}
          <div className="max-w-2xl mx-auto mb-6">
            <form onSubmit={handleSearch} className="relative">
              <div className="relative flex items-center">
                <div className="absolute left-4 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  className="w-full pl-12 pr-32 py-4 text-lg border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all bg-white dark:bg-gray-800 shadow-lg"
                />
                <Button 
                  type="submit" 
                  size="lg" 
                  className="absolute right-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </form>
          </div>

          {/* Example Queries */}
          <div className="mb-10">
            <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {exampleQueries.map((example, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(example)}
                  className="text-sm px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-gray-600 dark:text-gray-400 hover:text-blue-600"
                >
                  "{example}"
                </button>
              ))}
            </div>
          </div>

          {/* How it's different */}
          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-10">
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-blue-600 mb-1">Natural</div>
              <p className="text-sm text-muted-foreground">Search in plain English, not filter menus</p>
            </div>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-purple-600 mb-1">Smart</div>
              <p className="text-sm text-muted-foreground">AI understands your intent and context</p>
            </div>
            <div className="text-center p-4">
              <div className="text-3xl font-bold text-green-600 mb-1">Fast</div>
              <p className="text-sm text-muted-foreground">Best matches ranked instantly</p>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <Link href="/search">
                Try AI Search Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="#comparison">See How We Compare</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

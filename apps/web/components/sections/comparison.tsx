import { Check, X, Sparkles, Search, Filter, Brain } from 'lucide-react'

const comparisonData = [
  {
    feature: 'Search Method',
    ironscout: 'Natural language AI',
    competitor: 'Dropdown filters only',
    highlight: true,
  },
  {
    feature: 'Query Example',
    ironscout: '"best 9mm for home defense"',
    competitor: 'Select: 9mm → JHP → Sort by price',
    highlight: true,
  },
  {
    feature: 'Understands Platform',
    ironscout: true,
    competitor: false,
    description: '"AR15 ammo" → finds .223/5.56',
  },
  {
    feature: 'Understands Purpose',
    ironscout: true,
    competitor: false,
    description: '"long range target" → heavier grain match ammo',
  },
  {
    feature: 'Understands Quality',
    ironscout: true,
    competitor: false,
    description: '"match grade" vs "budget plinking"',
  },
  {
    feature: 'Price Comparison',
    ironscout: true,
    competitor: true,
  },
  {
    feature: 'In-Stock Alerts',
    ironscout: true,
    competitor: true,
  },
  {
    feature: 'Price History',
    ironscout: true,
    competitor: false,
  },
  {
    feature: 'Learning & Improving',
    ironscout: true,
    competitor: false,
    description: 'AI gets smarter over time',
  },
]

export function Comparison() {
  return (
    <section id="comparison" className="py-20 lg:py-32 bg-gray-50 dark:bg-gray-900/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-4">
            <div className="flex items-center space-x-2 bg-blue-100 dark:bg-blue-900/30 rounded-full px-4 py-2">
              <Brain className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">The Difference</span>
            </div>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Not Just Another Price Aggregator
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            AmmoSeek and similar sites are great for filtering by caliber and sorting by price.
            But what if you don't know exactly what you need?
          </p>
        </div>

        {/* Visual Comparison */}
        <div className="max-w-5xl mx-auto mb-16">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Traditional Search */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border-2 border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <Filter className="h-6 w-6 text-gray-500" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Traditional Search</h3>
                  <p className="text-sm text-muted-foreground">Filter-based approach</p>
                </div>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-24 text-muted-foreground">Caliber:</div>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded px-3 py-1.5 text-gray-500">
                    Select caliber ▼
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-24 text-muted-foreground">Grain:</div>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded px-3 py-1.5 text-gray-500">
                    Select grain ▼
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-24 text-muted-foreground">Type:</div>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded px-3 py-1.5 text-gray-500">
                    Select type ▼
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-24 text-muted-foreground">Case:</div>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded px-3 py-1.5 text-gray-500">
                    Select case ▼
                  </div>
                </div>
              </div>

              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-400">
                  <strong>Problem:</strong> You need to know exactly what you want before searching.
                  New shooters or those trying something new are lost.
                </p>
              </div>
            </div>

            {/* IronScout AI Search */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border-2 border-blue-500 ring-4 ring-blue-500/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">IronScout AI Search</h3>
                  <p className="text-sm text-muted-foreground">Natural language approach</p>
                </div>
              </div>
              
              <div className="mb-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border-2 border-blue-200 dark:border-blue-800">
                  <p className="text-gray-700 dark:text-gray-300 italic">
                    "I just got an AR15 and want affordable ammo for target practice at the range"
                  </p>
                </div>
                
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  <span>AI understands:</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                    Platform: AR15 → .223/5.56
                  </span>
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                    Purpose: Target/Range
                  </span>
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                    Budget: Affordable/Bulk
                  </span>
                </div>
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-400">
                  <strong>Result:</strong> Perfect recommendations for 55gr FMJ brass-case .223,
                  sorted by price-per-round. No expertise required.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-50 dark:bg-gray-700/50 border-b">
              <div className="p-4 font-medium text-gray-500">Feature</div>
              <div className="p-4 font-bold text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                IronScout
              </div>
              <div className="p-4 font-medium text-center text-gray-500">Others</div>
            </div>
            
            {comparisonData.map((row, i) => (
              <div 
                key={i} 
                className={`grid grid-cols-3 border-b last:border-0 ${
                  row.highlight ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                }`}
              >
                <div className="p-4">
                  <div className="font-medium text-sm">{row.feature}</div>
                  {row.description && (
                    <div className="text-xs text-muted-foreground mt-1">{row.description}</div>
                  )}
                </div>
                <div className="p-4 text-center flex items-center justify-center">
                  {typeof row.ironscout === 'boolean' ? (
                    row.ironscout ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-red-400" />
                    )
                  ) : (
                    <span className="text-sm font-medium text-blue-600">{row.ironscout}</span>
                  )}
                </div>
                <div className="p-4 text-center flex items-center justify-center">
                  {typeof row.competitor === 'boolean' ? (
                    row.competitor ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-red-400" />
                    )
                  ) : (
                    <span className="text-sm text-gray-500">{row.competitor}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

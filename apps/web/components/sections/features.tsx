import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Sparkles, 
  Bell, 
  Target, 
  TrendingUp, 
  MessageSquare, 
  Zap,
  Brain,
  Search
} from 'lucide-react'

const features = [
  {
    icon: MessageSquare,
    title: 'Search in Plain English',
    description: 'Just describe what you need: "budget 9mm for practice" or "best .308 for elk hunting." No dropdowns, no guessing calibers.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Brain,
    title: 'AI Understands Context',
    description: 'Say "AR15 ammo" and we know you mean .223/5.56. Say "home defense" and we prioritize hollow points. The AI gets it.',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: Target,
    title: 'Purpose-Matched Results',
    description: 'Hunting, target practice, competition, self-defense — our AI recommends the right grain weight, bullet type, and quality level.',
    gradient: 'from-orange-500 to-red-500',
  },
  {
    icon: TrendingUp,
    title: 'Price History & Trends',
    description: 'See how prices have changed over time. Know if you\'re getting a deal or if you should wait for prices to drop.',
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    icon: Bell,
    title: 'Smart Price Alerts',
    description: 'Set your target price and get notified instantly when it drops. Never miss a deal on your favorite ammo.',
    gradient: 'from-yellow-500 to-orange-500',
  },
  {
    icon: Zap,
    title: 'Real-Time Inventory',
    description: 'Our crawlers check retailer stock continuously. Know what\'s actually available, not what was in stock yesterday.',
    gradient: 'from-indigo-500 to-purple-500',
  },
]

export function Features() {
  return (
    <section className="py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-4">
            <div className="flex items-center space-x-2 bg-purple-100 dark:bg-purple-900/30 rounded-full px-4 py-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-600">AI-Powered Features</span>
            </div>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Search Smarter, Not Harder
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            IronScout combines cutting-edge AI with real-time pricing data
            to help you find exactly what you need — even if you're not sure what that is.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 bg-white dark:bg-gray-800"
            >
              <CardHeader>
                <div className={`w-12 h-12 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-4 shadow-lg`}>
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Example Queries Section */}
        <div className="mt-20 max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h3 className="text-2xl font-bold mb-2">See It In Action</h3>
            <p className="text-muted-foreground">Real queries our AI understands perfectly</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                query: "cheap plinking ammo for my Glock 19",
                understanding: "9mm FMJ, budget-friendly, brass or steel case",
              },
              {
                query: "match grade 6.5 Creedmoor for competition",
                understanding: "140gr+ HPBT, premium brands like Hornady/Federal",
              },
              {
                query: "best home defense shotgun shells",
                understanding: "12 gauge 00 buckshot or #4 buck, reliable brands",
              },
              {
                query: "subsonic 300 blackout for my suppressor",
                understanding: "200+ grain, subsonic loads, brass case",
              },
            ].map((example, i) => (
              <div 
                key={i}
                className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start gap-3">
                  <Search className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                      "{example.query}"
                    </p>
                    <p className="text-sm text-muted-foreground">
                      → {example.understanding}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

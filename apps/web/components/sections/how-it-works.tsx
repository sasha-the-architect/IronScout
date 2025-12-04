import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Sparkles, ShoppingCart, Bell } from 'lucide-react'

const steps = [
  {
    icon: MessageSquare,
    title: 'Describe What You Need',
    description: 'Type naturally like you\'re asking a friend. "Best ammo for home defense" or "cheap bulk 9mm for the range" — whatever you need.',
    step: '01',
    color: 'bg-blue-500',
  },
  {
    icon: Sparkles,
    title: 'AI Finds Perfect Matches',
    description: 'Our AI understands caliber, purpose, platform, and budget. It searches across dozens of retailers and ranks the best options for you.',
    step: '02',
    color: 'bg-purple-500',
  },
  {
    icon: Bell,
    title: 'Track & Get Alerts',
    description: 'Found something but want a better price? Set an alert and we\'ll notify you the moment it drops to your target.',
    step: '03',
    color: 'bg-green-500',
  },
  {
    icon: ShoppingCart,
    title: 'Buy With Confidence',
    description: 'See price history, read the specs, compare retailers. Click through to buy directly from trusted vendors at the best price.',
    step: '04',
    color: 'bg-orange-500',
  },
]

export function HowItWorks() {
  return (
    <section className="py-20 lg:py-32 bg-gray-50 dark:bg-gray-900/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From question to purchase in minutes — no expertise required.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <Card className="border-0 shadow-lg h-full bg-white dark:bg-gray-800">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 ${step.color} rounded-xl flex items-center justify-center shadow-lg flex-shrink-0`}>
                        <step.icon className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-muted-foreground mb-1">
                          Step {step.step}
                        </div>
                        <CardTitle className="text-xl">{step.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base leading-relaxed">
                      {step.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {/* Visual flow arrow for desktop */}
          <div className="hidden md:flex justify-center mt-12">
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="text-sm">Natural question</span>
              <span>→</span>
              <span className="text-sm">AI understanding</span>
              <span>→</span>
              <span className="text-sm">Best matches</span>
              <span>→</span>
              <span className="text-sm font-medium text-green-600">Perfect purchase</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

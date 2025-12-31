import {
  Brain,
  Bell,
  Layers,
  TrendingUp,
  Search,
  CheckCircle2
} from 'lucide-react'

const features = [
  {
    icon: Brain,
    text: 'Search that understands ammo specs, not just keywords',
  },
  {
    icon: Layers,
    text: 'Canonically matched products across messy retailer listings',
  },
  {
    icon: TrendingUp,
    text: 'Current prices alongside historical price context',
  },
  {
    icon: Search,
    text: 'Price tracking across calibers and specific products',
  },
  {
    icon: Bell,
    text: 'Alerts when prices or availability change',
  },
]

export function Features() {
  return (
    <section className="py-20 lg:py-28">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">
            What IronScout Does
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-12">
            IronScout focuses on one thing: making ammo pricing easier to understand.
          </p>

          <div className="space-y-4 mb-10">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-4 rounded-lg bg-slate-50 dark:bg-gray-800/50"
              >
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <feature.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-lg text-foreground pt-1.5">
                  {feature.text}
                </p>
              </div>
            ))}
          </div>

          <p className="text-center text-lg font-medium text-foreground">
            No guesswork. No spreadsheets. Just clearer signals.
          </p>
        </div>
      </div>
    </section>
  )
}

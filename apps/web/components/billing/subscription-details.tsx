import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'

const features = [
  { name: 'Real-time price alerts', included: true },
  { name: 'Unlimited product tracking', included: true },
  { name: 'SMS notifications', included: true },
  { name: 'Price history charts', included: true },
  { name: 'Priority support', included: true },
  { name: 'API access', included: false },
  { name: 'White-label options', included: false }
]

export function SubscriptionDetails() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan Features</CardTitle>
        <CardDescription>
          What's included in your Premium subscription
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {features.map((feature, index) => (
            <div key={index} className="flex items-center gap-3">
              {feature.included ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <X className="h-4 w-4 text-gray-400" />
              )}
              <span className={feature.included ? '' : 'text-muted-foreground'}>
                {feature.name}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t">
          <Button variant="outline" className="w-full">
            Upgrade to Pro
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Get API access and advanced features
          </p>
        </div>

        <div className="pt-4 border-t">
          <Button variant="ghost" className="w-full text-destructive">
            Cancel Subscription
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            You can cancel anytime. No questions asked.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

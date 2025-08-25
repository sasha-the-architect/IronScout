import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Calendar, DollarSign } from 'lucide-react'

export function BillingOverview() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Current Subscription
        </CardTitle>
        <CardDescription>
          Your current plan and billing information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Premium Plan</h3>
            <p className="text-muted-foreground">Unlimited alerts and real-time notifications</p>
          </div>
          <Badge>Active</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 border rounded-lg">
            <DollarSign className="h-6 w-6 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">$9.99</div>
            <div className="text-sm text-muted-foreground">per month</div>
          </div>
          
          <div className="text-center p-4 border rounded-lg">
            <Calendar className="h-6 w-6 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">Dec 25</div>
            <div className="text-sm text-muted-foreground">Next billing</div>
          </div>
          
          <div className="text-center p-4 border rounded-lg">
            <CreditCard className="h-6 w-6 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">•••• 4242</div>
            <div className="text-sm text-muted-foreground">Payment method</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1">
            Change Plan
          </Button>
          <Button variant="outline" className="flex-1">
            Update Payment
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

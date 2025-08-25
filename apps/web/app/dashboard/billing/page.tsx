import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { BillingOverview } from '@/components/billing/billing-overview'
import { SubscriptionDetails } from '@/components/billing/subscription-details'
import { PaymentHistory } from '@/components/billing/payment-history'

export default async function BillingPage() {
  const session = await getServerSession()
  
  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription and view payment history.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <BillingOverview />
          <PaymentHistory />
        </div>
        <div className="space-y-6">
          <SubscriptionDetails />
        </div>
      </div>
    </div>
  )
}

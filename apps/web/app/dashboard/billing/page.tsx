import Link from 'next/link'

/**
 * V1: Billing page is not available.
 * Shows a static message instead of subscription management.
 */
export default function BillingPage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold mb-4">Billing</h1>
        <p className="text-muted-foreground mb-6">
          Billing and subscription management is not currently available.
          All features are free during our launch period.
        </p>
        <Link
          href="/dashboard"
          className="text-primary hover:underline"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  )
}

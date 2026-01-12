import Link from 'next/link'

/**
 * V1: Pricing page is not available.
 * Shows a static message instead of premium plans.
 */
export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-md mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Pricing</h1>
        <p className="text-muted-foreground mb-6">
          Premium plans are not currently available. All features are free during our launch period.
        </p>
        <Link
          href="/"
          className="text-primary hover:underline"
        >
          Return to home
        </Link>
      </div>
    </div>
  )
}

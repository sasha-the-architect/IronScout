import Link from 'next/link'

/**
 * V1: Pricing success page is not available.
 * Shows a static message.
 */
export default function PricingSuccessPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-md mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Page Not Available</h1>
        <p className="text-muted-foreground mb-6">
          This page is not currently available.
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

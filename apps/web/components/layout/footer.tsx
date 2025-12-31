import Link from 'next/link'
import Image from 'next/image'

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center space-x-2">
              <Image
                src="/logo-dark.svg"
                alt="IronScout"
                width={24}
                height={24}
                className="flex-shrink-0"
              />
              <span className="text-xl font-bold">IronScout.ai</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Intent-aware ammunition search and price comparison. Find the best deals with helpful context and real-time alerts.
            </p>
          </div>

          {/* Product */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/search" className="text-muted-foreground hover:text-primary">
                  Search Products
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-muted-foreground hover:text-primary">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-muted-foreground hover:text-primary">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Business */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Business</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/dealers" className="text-muted-foreground hover:text-primary">
                  For Dealers
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-12 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} IronScout.ai. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ProductImage } from './product-image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bookmark, ExternalLink, TrendingDown, Store, Package } from 'lucide-react'
import type { Product } from '@/lib/api'
import { CreateAlertDialog } from './create-alert-dialog'
import { PriceHistoryChart } from './price-history-chart'

interface ProductDetailsProps {
  product: Product
}

export function ProductDetails({ product }: ProductDetailsProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  // Guard against empty prices array to prevent crashes
  if (!product.prices || product.prices.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>No pricing information available for this product.</p>
      </div>
    )
  }

  const lowestPrice = product.prices.reduce((min, price) =>
    price.price < min.price ? price : min,
    product.prices[0]
  )

  const highestPrice = product.prices.reduce((max, price) =>
    price.price > max.price ? price : max,
    product.prices[0]
  )

  const averagePrice = product.prices.reduce((sum, price) => sum + price.price, 0) / product.prices.length

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/search" className="hover:text-foreground">Search</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      {/* Main Product Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Product Image */}
        <div className="space-y-4">
          <div className="aspect-square relative rounded-lg overflow-hidden bg-gray-100">
            <ProductImage
              imageUrl={product.imageUrl}
              caliber={product.caliber}
              brand={product.brand}
              alt={product.name}
              fill
              priority
            />
          </div>
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between gap-4 mb-2">
              <h1 className="text-3xl font-bold">{product.name}</h1>
            </div>

            {product.brand && (
              <p className="text-muted-foreground mb-2">Brand: {product.brand}</p>
            )}

            <div className="flex items-center gap-2 mb-4">
              <Badge>{product.category}</Badge>
            </div>

            {product.description && (
              <p className="text-muted-foreground">{product.description}</p>
            )}
          </div>

          {/* Price Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Lowest Price</div>
                  <div className="text-4xl font-bold text-primary">
                    ${lowestPrice.price.toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    at {lowestPrice.retailer?.name || 'Unknown retailer'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <div className="text-xs text-muted-foreground">Price Range</div>
                    <div className="text-sm font-semibold">
                      ${lowestPrice.price.toFixed(2)} - ${highestPrice.price.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Avg Price</div>
                    <div className="text-sm font-semibold">
                      ${averagePrice.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button size="lg" className="flex-1" asChild>
              <a
                href={lowestPrice.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Compare prices
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setShowSaveDialog(true)}
            >
              <Bookmark className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Store className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold">{product.prices.length}</div>
                    <div className="text-xs text-muted-foreground">Retailers</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold">
                      {product.prices.filter(p => p.inStock).length}
                    </div>
                    <div className="text-xs text-muted-foreground">In Stock</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Price Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Price Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {product.prices.map((price, index) => (
              <div
                key={price.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  index === 0 ? 'bg-primary/5 border-primary' : ''
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  {index === 0 && (
                    <Badge variant="default">Lowest Price</Badge>
                  )}

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{price.retailer?.name || 'Unknown'}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {price.inStock ? (
                        <span className="text-green-600">In Stock</span>
                      ) : (
                        <span className="text-red-600">Out of Stock</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xl font-bold">
                      ${price.price.toFixed(2)}
                    </div>
                    {index > 0 && (
                      <div className="text-xs text-muted-foreground">
                        +${(price.price - lowestPrice.price).toFixed(2)} more
                      </div>
                    )}
                  </div>

                  <Button size="sm" asChild>
                    <a
                      href={price.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Price History Chart */}
      <PriceHistoryChart productId={product.id} />

      <CreateAlertDialog
        product={product}
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
      />
    </div>
  )
}

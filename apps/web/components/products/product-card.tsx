'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { Star, ExternalLink, Bell, Crown } from 'lucide-react'
import type { Product } from '@/lib/api'
import { CreateAlertDialog } from './create-alert-dialog'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const [showAlertDialog, setShowAlertDialog] = useState(false)

  const lowestPrice = product.prices.reduce((min, price) =>
    price.price < min.price ? price : min
  )

  const isPremiumRetailer = lowestPrice.retailer.tier === 'PREMIUM'

  return (
    <>
    <Card className="group hover:shadow-lg transition-all duration-200 overflow-hidden">
      <div className="relative">
        <div className="aspect-square relative overflow-hidden bg-gray-50">
          <Image
            src={product.imageUrl || '/placeholder-product.jpg'}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200"
          />
        </div>
        
        {/* Premium Badge */}
        {isPremiumRetailer && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-yellow-500 text-yellow-900 flex items-center gap-1">
              <Crown className="h-3 w-3" />
              Premium
            </Badge>
          </div>
        )}

        {/* Quick Actions */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 p-0"
            onClick={() => setShowAlertDialog(true)}
          >
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          
          {product.brand && (
            <p className="text-xs text-muted-foreground">{product.brand}</p>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-lg font-bold text-primary">
                {formatPrice(lowestPrice.price, lowestPrice.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                at {lowestPrice.retailer.name}
              </p>
            </div>
            
            {product.prices.length > 1 && (
              <Badge variant="outline" className="text-xs">
                +{product.prices.length - 1} more
              </Badge>
            )}
          </div>

          {/* Mock Rating */}
          <div className="flex items-center space-x-1">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-3 w-3 ${
                    i < 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">(4.2)</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 space-y-2">
        <div className="flex space-x-2 w-full">
          <Button size="sm" className="flex-1" asChild>
            <a
              href={lowestPrice.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Buy Now
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setShowAlertDialog(true)}
          >
            <Bell className="h-3 w-3 mr-1" />
            Alert
          </Button>
        </div>
        
        {!lowestPrice.inStock && (
          <p className="text-xs text-destructive text-center">Out of Stock</p>
        )}
      </CardFooter>

      <CreateAlertDialog
        product={product}
        open={showAlertDialog}
        onOpenChange={setShowAlertDialog}
      />
    </>
  )
}

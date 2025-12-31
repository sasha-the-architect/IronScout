'use client'

import { useState } from 'react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { ProductImage } from './product-image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { ExternalLink, Bookmark, Crown, Package, Sparkles } from 'lucide-react'
import type { Product } from '@/lib/api'
import { CreateAlertDialog } from './create-alert-dialog'
import {
  PerformanceBadges,
  BulletTypeBadge,
  PressureRatingBadge,
  InlineVerdict
} from '@/components/premium'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ProductCardProps {
  product: Product
  showRelevance?: boolean
  showPremiumFeatures?: boolean
}

// Helper to get purpose badge variant and color
const getPurposeBadge = (purpose?: string) => {
  if (!purpose) return null

  const purposeLower = purpose.toLowerCase()
  if (purposeLower.includes('target') || purposeLower.includes('practice')) {
    return { label: purpose, className: 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300' }
  }
  if (purposeLower.includes('defense') || purposeLower.includes('defensive')) {
    return { label: purpose, className: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-300' }
  }
  if (purposeLower.includes('hunt')) {
    return { label: purpose, className: 'bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/50 dark:text-green-300' }
  }
  return { label: purpose, className: 'bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300' }
}

export function ProductCard({ product, showRelevance = false, showPremiumFeatures = false }: ProductCardProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  // Guard against empty prices array to prevent crashes
  if (!product.prices || product.prices.length === 0) {
    return null
  }

  const lowestPrice = product.prices.reduce((min, price) =>
    price.price < min.price ? price : min,
    product.prices[0]
  )

  const isPremiumRetailer = lowestPrice.retailer.tier === 'PREMIUM'
  const hasPremiumData = product.premium && showPremiumFeatures

  // Calculate price per round if roundCount is available
  const pricePerRound = product.roundCount && product.roundCount > 0
    ? lowestPrice.price / product.roundCount
    : null

  const purposeBadge = getPurposeBadge(product.purpose)

  // Premium data shortcuts
  const premium = product.premium
  const badges = premium?.premiumRanking?.badges || []
  const explanation = premium?.premiumRanking?.explanation
  const finalScore = premium?.premiumRanking?.finalScore

  return (
    <Card className="group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden border-2 border-transparent hover:border-primary/20">
      <div className="relative">
        <div className="aspect-square relative overflow-hidden bg-gradient-to-br from-muted/50 to-muted">
          <ProductImage
            imageUrl={product.imageUrl}
            caliber={product.caliber}
            brand={product.brand}
            alt={product.name}
            fill
            className="group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        </div>

        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {/* Premium Retailer Badge */}
          {isPremiumRetailer && (
            <Badge className="bg-yellow-500 text-yellow-900 flex items-center gap-1">
              <Crown className="h-3 w-3" />
              Premium
            </Badge>
          )}
          
          {/* Note: BestValueBadge removed per ADR-006 - no value judgments */}
        </div>

        {/* Bottom-left: Relevance or Premium Score */}
        <div className="absolute bottom-2 left-2 flex flex-col gap-1">
          {showRelevance && product.relevanceScore !== undefined && product.relevanceScore > 0 && !hasPremiumData && (
            <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs">
              {product.relevanceScore}% match
            </Badge>
          )}
          
          {/* Premium Score with explanation */}
          {hasPremiumData && finalScore !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs flex items-center gap-1 cursor-help">
                    <Sparkles className="h-3 w-3" />
                    {finalScore}% match
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-2">
                    <p className="font-medium text-sm">Premium AI Match Score</p>
                    {explanation && (
                      <p className="text-xs text-muted-foreground">{explanation}</p>
                    )}
                    {premium?.premiumRanking?.breakdown && (
                      <div className="text-xs space-y-1 border-t pt-2">
                        <div className="flex justify-between">
                          <span>Base relevance:</span>
                          <span>{Math.round(premium.premiumRanking.breakdown.baseRelevance)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Performance match:</span>
                          <span>{Math.round(premium.premiumRanking.breakdown.performanceMatch)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Price context:</span>
                          <span>{Math.round(premium.premiumRanking.breakdown.priceContextBonus)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Safety bonus:</span>
                          <span>{Math.round(premium.premiumRanking.breakdown.safetyBonus)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Quick Actions */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 p-0 backdrop-blur-sm bg-background/80 hover:bg-background shadow-lg"
            onClick={() => setShowSaveDialog(true)}
            aria-label="Save item"
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="space-y-2">
          {/* Performance Badges (Premium) */}
          {hasPremiumData && badges.length > 0 && (
            <PerformanceBadges 
              badges={badges} 
              size="sm" 
              maxVisible={3}
              className="mb-2"
            />
          )}

          {/* Ammo Badges */}
          <div className="flex flex-wrap gap-1.5">
            {product.caliber && (
              <Badge variant="secondary" className="text-xs font-semibold">
                {product.caliber}
              </Badge>
            )}
            
            {/* Premium: Bullet Type Badge */}
            {hasPremiumData && premium?.bulletType && (
              <BulletTypeBadge bulletType={premium.bulletType} size="sm" />
            )}
            
            {/* Premium: Pressure Rating Badge */}
            {hasPremiumData && premium?.pressureRating && (
              <PressureRatingBadge pressureRating={premium.pressureRating} size="sm" />
            )}
            
            {product.grainWeight && (
              <Badge variant="outline" className="text-xs">
                {product.grainWeight}gr
              </Badge>
            )}
            
            {/* Only show case material if no Premium badges */}
            {!hasPremiumData && product.caseMaterial && (
              <Badge variant="outline" className="text-xs">
                {product.caseMaterial}
              </Badge>
            )}
            
            {purposeBadge && (
              <Badge className={`text-xs ${purposeBadge.className}`}>
                {purposeBadge.label}
              </Badge>
            )}
          </div>

          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors leading-snug">
            {product.name}
          </h3>

          {product.brand && (
            <p className="text-xs text-muted-foreground">{product.brand}</p>
          )}

          {/* Premium: Velocity info */}
          {hasPremiumData && premium?.muzzleVelocityFps && (
            <p className="text-xs text-muted-foreground">
              {premium.muzzleVelocityFps} fps
              {premium.isSubsonic && ' (subsonic)'}
            </p>
          )}

          {/* Round Count */}
          {product.roundCount && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Package className="h-3 w-3" />
              <span>{product.roundCount} rounds</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-primary font-mono tracking-tight">
                  {formatPrice(lowestPrice.price, lowestPrice.currency)}
                </p>
                {pricePerRound !== null && (
                  <p className="text-xs text-muted-foreground">
                    ({formatPrice(pricePerRound, lowestPrice.currency)}/rd)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  at {lowestPrice.retailer.name}
                </p>
                {/* Price verdict - everyone gets the conclusion */}
                <InlineVerdict priceContext={product.priceContext} />
              </div>
            </div>

            {product.prices.length > 1 && (
              <Badge variant="outline" className="text-xs">
                +{product.prices.length - 1} more
              </Badge>
            )}
          </div>

        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 space-y-2">
        <div className="flex space-x-2 w-full">
          <Button size="sm" className="flex-1 shadow-sm hover:shadow-md transition-shadow" asChild>
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
            onClick={() => setShowSaveDialog(true)}
          >
            <Bookmark className="h-3 w-3 mr-1" />
            Save
          </Button>
        </div>

        {!lowestPrice.inStock && (
          <p className="text-xs text-destructive text-center">Out of Stock</p>
        )}
      </CardFooter>

      <CreateAlertDialog
        product={product}
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
      />
    </Card>
  )
}

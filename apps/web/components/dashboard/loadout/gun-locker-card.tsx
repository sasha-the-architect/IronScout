'use client'

import { useState, useCallback } from 'react'
import { Package, Search, ChevronDown, ChevronUp, Crosshair } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  type FirearmWithAmmo,
  type AmmoItemWithPrice,
  formatPriceRange,
  getUseCaseLabel,
} from '@/hooks/use-loadout'

// ============================================================================
// TYPES
// ============================================================================

interface GunLockerCardProps {
  firearms: FirearmWithAmmo[]
  totalAmmoItems: number
  onCompareClick: (item: AmmoItemWithPrice) => void
  onFindSimilarClick: (item: AmmoItemWithPrice) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * GunLockerCard - Full-width card showing Gun Locker firearms and ammo
 *
 * Per My Loadout mockup:
 * - Shows each firearm with its ammo preferences
 * - Each ammo item shows price range across retailers
 * - "Compare prices" for in-stock items
 * - "Find similar" for out-of-stock items
 */
export function GunLockerCard({
  firearms,
  totalAmmoItems,
  onCompareClick,
  onFindSimilarClick,
}: GunLockerCardProps) {
  // Track expanded state per firearm
  const [expandedFirearms, setExpandedFirearms] = useState<Set<string>>(
    () => new Set(firearms.slice(0, 2).map((f) => f.id)) // Expand first 2 by default
  )

  const toggleFirearm = useCallback((firearmId: string) => {
    setExpandedFirearms((prev) => {
      const next = new Set(prev)
      if (next.has(firearmId)) {
        next.delete(firearmId)
      } else {
        next.add(firearmId)
      }
      return next
    })
  }, [])

  if (firearms.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Package className="h-4 w-4" />
            Gun Locker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Crosshair className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No firearms in your Gun Locker yet
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <a href="/dashboard/gun-locker">Add your first firearm</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Package className="h-4 w-4" />
            Gun Locker
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {totalAmmoItems} {totalAmmoItems === 1 ? 'item' : 'items'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {firearms.map((firearm) => (
            <FirearmSection
              key={firearm.id}
              firearm={firearm}
              isExpanded={expandedFirearms.has(firearm.id)}
              onToggle={() => toggleFirearm(firearm.id)}
              onCompareClick={onCompareClick}
              onFindSimilarClick={onFindSimilarClick}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// FIREARM SECTION
// ============================================================================

interface FirearmSectionProps {
  firearm: FirearmWithAmmo
  isExpanded: boolean
  onToggle: () => void
  onCompareClick: (item: AmmoItemWithPrice) => void
  onFindSimilarClick: (item: AmmoItemWithPrice) => void
}

function FirearmSection({
  firearm,
  isExpanded,
  onToggle,
  onCompareClick,
  onFindSimilarClick,
}: FirearmSectionProps) {
  const displayName = firearm.nickname || firearm.caliber
  const ammoCount = firearm.ammoItems.length

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-xs font-medium">
              {firearm.caliber.slice(0, 3)}
            </div>
            <div className="text-left">
              <p className="font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                {ammoCount} {ammoCount === 1 ? 'ammo' : 'ammos'} saved
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 pl-4">
          {firearm.ammoItems.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground text-center">
              No ammo preferences saved for this firearm
            </p>
          ) : (
            firearm.ammoItems.map((item) => (
              <AmmoItemRow
                key={item.id}
                item={item}
                onCompareClick={onCompareClick}
                onFindSimilarClick={onFindSimilarClick}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ============================================================================
// AMMO ITEM ROW
// ============================================================================

interface AmmoItemRowProps {
  item: AmmoItemWithPrice
  onCompareClick: (item: AmmoItemWithPrice) => void
  onFindSimilarClick: (item: AmmoItemWithPrice) => void
}

function AmmoItemRow({ item, onCompareClick, onFindSimilarClick }: AmmoItemRowProps) {
  const priceText = item.priceRange
    ? formatPriceRange(item.priceRange, { showRetailerCount: true })
    : 'No price data'

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 p-3 rounded-lg border bg-card',
        !item.inStock && 'opacity-70'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate text-sm">{item.name}</p>
          <Badge variant="outline" className="text-xs shrink-0">
            {getUseCaseLabel(item.useCase)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {item.inStock ? (
            <span className="text-foreground font-mono">{priceText}</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">Out of stock</span>
          )}
        </p>
      </div>
      <div className="shrink-0">
        {item.inStock ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCompareClick(item)}
          >
            Compare prices
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFindSimilarClick(item)}
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            Find similar
          </Button>
        )}
      </div>
    </div>
  )
}

export default GunLockerCard

'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Bookmark,
  ExternalLink,
  Trash2,
  Bell,
  BellOff,
  ChevronDown,
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useSavedItems } from '@/hooks/use-saved-items'
import { ProductImage } from '@/components/products/product-image'
import { toast } from 'sonner'
import type { SavedItem } from '@/lib/api'
import { createLogger } from '@/lib/logger'

const logger = createLogger('components:saved-items-manager')

/**
 * Saved Items Manager - unified view for saved products (ADR-011)
 *
 * Per UX Charter and 05_alerting_and_notifications.md:
 * - Saving is the only user action
 * - Alerts are an implicit side effect with deterministic thresholds
 * - No user-defined thresholds in v1
 * - Simple pause/resume toggle for notifications
 */
export function SavedItemsManager() {
  const { items, meta, loading, error, remove, updatePrefs, refetch } = useSavedItems()

  const handleRemove = async (productId: string, name: string) => {
    if (!confirm(`Remove "${name}" from your watchlist?`)) return

    try {
      await remove(productId)
      toast.success('Item removed')
    } catch (err) {
      logger.error('Failed to remove item', {}, err)
      toast.error('Failed to remove item')
    }
  }

  const handleUpdateNotificationPref = async (
    item: SavedItem,
    field: 'notificationsEnabled' | 'priceDropEnabled' | 'backInStockEnabled',
    value: boolean
  ) => {
    try {
      await updatePrefs(item.productId, { [field]: value })

      // Show toast for master toggle only
      if (field === 'notificationsEnabled') {
        toast.success(value ? 'Notifications resumed' : 'Notifications paused')
      }
    } catch (err) {
      logger.error('Failed to update notification preference', { field }, err)
      toast.error('Failed to update notifications')
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">Loading watchlist...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-destructive">{error}</p>
          <Button onClick={refetch} className="mx-auto mt-4 block">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Saved Items is a management surface (ADR-012, UX Charter)
  // No status cards, aggregate stats, or dashboard-style metrics
  // Just: list items, allow removal, show current state per item

  return (
    <div className="space-y-6">
      {/* Items List - the only section needed */}
      <Card>
        <CardContent className="pt-6">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <Bookmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No items in your watchlist yet. Search for products and add them to track prices.
              </p>
              <Button className="mt-4" asChild>
                <a href="/search">Search Products</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <SavedItemRow
                  key={item.id}
                  item={item}
                  onUpdatePref={(field, value) => handleUpdateNotificationPref(item, field, value)}
                  onRemove={() => handleRemove(item.productId, item.name)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}

interface SavedItemRowProps {
  item: SavedItem
  onUpdatePref: (
    field: 'notificationsEnabled' | 'priceDropEnabled' | 'backInStockEnabled',
    value: boolean
  ) => void
  onRemove: () => void
}

function SavedItemRow({
  item,
  onUpdatePref,
  onRemove,
}: SavedItemRowProps) {
  return (
    <div className="border rounded-lg">
      {/* Main row */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 hover:bg-accent/50 transition-colors">
        {/* Product Image */}
        <div className="w-16 h-16 relative flex-shrink-0 rounded overflow-hidden bg-gray-100">
          <ProductImage
            imageUrl={item.imageUrl}
            caliber={item.caliber}
            brand={item.brand}
            alt={item.name}
            fill
          />
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <h3 className="font-medium line-clamp-2 flex-1">{item.name}</h3>
            {item.inStock ? (
              <Badge variant="outline" className="text-green-600 border-green-600">
                In Stock
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600 border-red-600">
                Out of Stock
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-muted-foreground">
              Price:{' '}
              <span className="font-semibold text-foreground">
                {item.price ? `$${item.price.toFixed(2)}` : 'N/A'}
              </span>
            </span>
            {item.caliber && (
              <span className="text-muted-foreground">{item.caliber}</span>
            )}
            {item.brand && (
              <span className="text-muted-foreground">{item.brand}</span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-1">
            Added {new Date(item.savedAt).toLocaleDateString()}
          </p>
        </div>

        {/* Notification Controls Popover */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                title="Notification settings"
                data-testid={`saved-item-notifications-${item.id}`}
                className={item.notificationsEnabled ? 'text-blue-600' : 'text-muted-foreground'}
              >
                {item.notificationsEnabled ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Notifications</h4>

                {/* Master toggle */}
                <div className="flex items-center justify-between">
                  <Label htmlFor={`notif-master-${item.id}`} className="text-sm">
                    All notifications
                  </Label>
                  <Switch
                    id={`notif-master-${item.id}`}
                    checked={item.notificationsEnabled}
                    onCheckedChange={(checked) => onUpdatePref('notificationsEnabled', checked)}
                    data-testid={`saved-item-notifications-toggle-${item.id}`}
                  />
                </div>

                <div className="border-t pt-3 space-y-3">
                  {/* Price drops toggle */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`notif-price-${item.id}`}
                      className={`text-sm ${!item.notificationsEnabled ? 'text-muted-foreground' : ''}`}
                    >
                      Price drops
                    </Label>
                    <Switch
                      id={`notif-price-${item.id}`}
                      checked={item.priceDropEnabled}
                      onCheckedChange={(checked) => onUpdatePref('priceDropEnabled', checked)}
                      disabled={!item.notificationsEnabled}
                    />
                  </div>

                  {/* Back in stock toggle */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`notif-stock-${item.id}`}
                      className={`text-sm ${!item.notificationsEnabled ? 'text-muted-foreground' : ''}`}
                    >
                      Back in stock
                    </Label>
                    <Switch
                      id={`notif-stock-${item.id}`}
                      checked={item.backInStockEnabled}
                      onCheckedChange={(checked) => onUpdatePref('backInStockEnabled', checked)}
                      disabled={!item.notificationsEnabled}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground pt-2">
                  {item.notificationsEnabled
                    ? 'Notifications enabled for this item'
                    : 'Turn on to receive alerts'}
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild title="View product">
            <a href={`/products/${item.productId}`}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={onRemove}
            title="Remove"
            data-testid={`saved-item-remove-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

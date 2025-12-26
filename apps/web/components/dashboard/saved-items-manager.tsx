'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Bookmark,
  ExternalLink,
  Trash2,
  Bell,
  BellOff,
  Settings2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useSavedItems } from '@/hooks/use-saved-items'
import { ProductImage } from '@/components/products/product-image'
import { toast } from 'sonner'
import type { SavedItem, UpdateSavedItemPrefs } from '@/lib/api'
import { createLogger } from '@/lib/logger'

const logger = createLogger('components:saved-items-manager')

/**
 * Saved Items Manager - unified view for saved products (ADR-011)
 *
 * Features:
 * - List all saved items with product info
 * - Toggle notifications (master switch)
 * - Expandable notification preferences per item
 * - Remove items from saved list
 */
export function SavedItemsManager() {
  const { items, meta, loading, error, remove, updatePrefs, refetch } = useSavedItems()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleRemove = async (productId: string, name: string) => {
    if (!confirm(`Remove "${name}" from saved items?`)) return

    try {
      await remove(productId)
      toast.success('Item removed')
    } catch (err) {
      logger.error('Failed to remove item', {}, err)
      toast.error('Failed to remove item')
    }
  }

  const handleToggleNotifications = async (item: SavedItem) => {
    try {
      await updatePrefs(item.productId, {
        notificationsEnabled: !item.notificationsEnabled,
      })
      toast.success(
        item.notificationsEnabled ? 'Notifications paused' : 'Notifications enabled'
      )
    } catch (err) {
      logger.error('Failed to toggle notifications', {}, err)
      toast.error('Failed to update notifications')
    }
  }

  const handleUpdatePrefs = async (productId: string, prefs: UpdateSavedItemPrefs) => {
    try {
      await updatePrefs(productId, prefs)
      toast.success('Preferences updated')
    } catch (err) {
      logger.error('Failed to update preferences', {}, err)
      toast.error('Failed to update preferences')
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">Loading saved items...</p>
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

  const activeNotifications = items.filter((i) => i.notificationsEnabled).length
  const withPriceDropAlerts = items.filter((i) => i.priceDropEnabled).length
  const withStockAlerts = items.filter((i) => i.backInStockEnabled).length

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{items.length}</div>
            <p className="text-xs text-muted-foreground">
              Saved Items
              {meta && meta.itemLimit !== -1 && (
                <span className="ml-1">/ {meta.itemLimit} max</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{activeNotifications}</div>
            <p className="text-xs text-muted-foreground">Notifications Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{withPriceDropAlerts}</div>
            <p className="text-xs text-muted-foreground">Price Drop Alerts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{withStockAlerts}</div>
            <p className="text-xs text-muted-foreground">Stock Alerts</p>
          </CardContent>
        </Card>
      </div>

      {/* Items List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Saved Items</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12">
              <Bookmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No saved items yet. Search for products and save them to track prices.
              </p>
              <Button className="mt-4" asChild>
                <a href="/dashboard/search">Search Products</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <SavedItemRow
                  key={item.id}
                  item={item}
                  isExpanded={expandedId === item.id}
                  onToggleExpand={() =>
                    setExpandedId(expandedId === item.id ? null : item.id)
                  }
                  onToggleNotifications={() => handleToggleNotifications(item)}
                  onUpdatePrefs={(prefs) => handleUpdatePrefs(item.productId, prefs)}
                  onRemove={() => handleRemove(item.productId, item.name)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade CTA for free tier */}
      {meta && !meta.canAddMore && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Saved items limit reached</p>
                <p className="text-sm text-muted-foreground">
                  Upgrade to Premium for unlimited saved items
                </p>
              </div>
              <Button asChild>
                <a href="/pricing">Upgrade</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface SavedItemRowProps {
  item: SavedItem
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleNotifications: () => void
  onUpdatePrefs: (prefs: UpdateSavedItemPrefs) => void
  onRemove: () => void
}

function SavedItemRow({
  item,
  isExpanded,
  onToggleExpand,
  onToggleNotifications,
  onUpdatePrefs,
  onRemove,
}: SavedItemRowProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
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
            Saved {new Date(item.savedAt).toLocaleDateString()}
          </p>
        </div>

        {/* Notification Status */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleNotifications}
            title={item.notificationsEnabled ? 'Notifications on' : 'Notifications off'}
            className={item.notificationsEnabled ? 'text-blue-600' : 'text-muted-foreground'}
          >
            {item.notificationsEnabled ? (
              <Bell className="h-4 w-4" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleExpand}
            title="Notification settings"
          >
            <Settings2 className="h-4 w-4 mr-1" />
            {isExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>

          <Button size="sm" variant="outline" asChild title="View product">
            <a href={`/products/${item.productId}`}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>

          <Button size="sm" variant="outline" onClick={onRemove} title="Remove">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Expanded preferences */}
      {isExpanded && (
        <div className="border-t bg-muted/30 p-4">
          <NotificationPreferences item={item} onUpdate={onUpdatePrefs} />
        </div>
      )}
    </div>
  )
}

interface NotificationPreferencesProps {
  item: SavedItem
  onUpdate: (prefs: UpdateSavedItemPrefs) => void
}

function NotificationPreferences({ item, onUpdate }: NotificationPreferencesProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">Notification Preferences</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Price Drop Alert */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <Label className="font-medium">
              Price Drop Alerts
            </Label>
            <p className="text-xs text-muted-foreground">
              Notify when price drops by {item.minDropPercent}% or ${item.minDropAmount}
            </p>
          </div>
          <Switch
            checked={item.priceDropEnabled}
            onCheckedChange={(checked) => onUpdate({ priceDropEnabled: checked })}
            disabled={!item.notificationsEnabled}
          />
        </div>

        {/* Back in Stock Alert */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <Label className="font-medium">
              Back in Stock Alerts
            </Label>
            <p className="text-xs text-muted-foreground">
              Notify when item comes back in stock (cooldown: {item.stockAlertCooldownHours}h)
            </p>
          </div>
          <Switch
            checked={item.backInStockEnabled}
            onCheckedChange={(checked) => onUpdate({ backInStockEnabled: checked })}
            disabled={!item.notificationsEnabled}
          />
        </div>
      </div>

      {!item.notificationsEnabled && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Enable notifications to configure these settings
        </p>
      )}
    </div>
  )
}

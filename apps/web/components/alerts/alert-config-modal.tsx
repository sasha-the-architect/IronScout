'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Bell, TrendingDown, Package } from 'lucide-react'

export interface AlertPreferences {
  priceDropEnabled: boolean
  backInStockEnabled: boolean
  minDropPercent: number
}

interface AlertConfigModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  onConfirm: (prefs: AlertPreferences) => void
  onCancel: () => void
  isLoading?: boolean
}

const DEFAULT_PREFS: AlertPreferences = {
  priceDropEnabled: true,
  backInStockEnabled: true,
  minDropPercent: 5,
}

/**
 * AlertConfigModal - Configure alert preferences when creating a new alert
 *
 * Allows users to customize:
 * - Price drop alerts (with threshold)
 * - Back in stock alerts
 */
export function AlertConfigModal({
  open,
  onOpenChange,
  productName,
  onConfirm,
  onCancel,
  isLoading = false,
}: AlertConfigModalProps) {
  const [prefs, setPrefs] = useState<AlertPreferences>(DEFAULT_PREFS)

  const handleConfirm = () => {
    onConfirm(prefs)
  }

  const handleCancel = () => {
    setPrefs(DEFAULT_PREFS)
    onCancel()
  }

  // Reset to defaults when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setPrefs(DEFAULT_PREFS)
    }
    onOpenChange(newOpen)
  }

  const hasAnyAlert = prefs.priceDropEnabled || prefs.backInStockEnabled

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Create Alert
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {productName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Price Drop Alert */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <TrendingDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <Label htmlFor="price-drop" className="text-sm font-medium">
                    Price Drop
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Alert when price decreases
                  </p>
                </div>
              </div>
              <Switch
                id="price-drop"
                checked={prefs.priceDropEnabled}
                onCheckedChange={(checked) =>
                  setPrefs((p) => ({ ...p, priceDropEnabled: checked }))
                }
              />
            </div>

            {/* Threshold slider - only show when price drop enabled */}
            {prefs.priceDropEnabled && (
              <div className="pl-12 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    Minimum drop
                  </Label>
                  <span className="text-sm font-medium">{prefs.minDropPercent}%</span>
                </div>
                <Slider
                  value={[prefs.minDropPercent]}
                  onValueChange={([value]) =>
                    setPrefs((p) => ({ ...p, minDropPercent: value }))
                  }
                  min={1}
                  max={25}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Only alert when price drops by at least {prefs.minDropPercent}%
                </p>
              </div>
            )}
          </div>

          {/* Back in Stock Alert */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <Label htmlFor="back-in-stock" className="text-sm font-medium">
                  Back in Stock
                </Label>
                <p className="text-xs text-muted-foreground">
                  Alert when item becomes available
                </p>
              </div>
            </div>
            <Switch
              id="back-in-stock"
              checked={prefs.backInStockEnabled}
              onCheckedChange={(checked) =>
                setPrefs((p) => ({ ...p, backInStockEnabled: checked }))
              }
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!hasAnyAlert || isLoading}
          >
            {isLoading ? 'Creating...' : 'Create Alert'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

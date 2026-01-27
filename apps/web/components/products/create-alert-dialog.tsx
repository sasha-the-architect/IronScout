'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { saveItem, AuthError, type Product } from '@/lib/api'
import { X, Bookmark, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { refreshSessionToken, showSessionExpiredToast } from '@/hooks/use-session-refresh'

interface SaveItemDialogProps {
  product: Product
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Save Item Dialog
 *
 * Per UX Charter and 05_alerting_and_notifications.md:
 * - Saving is the only user action
 * - Alerts are an implicit side effect, not a feature to configure
 * - No alert setup language in save flow
 */
export function SaveItemDialog({ product, open, onOpenChange }: SaveItemDialogProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = session?.accessToken

  // Helper to get a valid token, refreshing if needed
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (token) return token
    const refreshed = await refreshSessionToken()
    if (!refreshed) {
      showSessionExpiredToast()
      return null
    }
    return refreshed
  }, [token])

  const handleSave = async () => {
    setError(null)

    const authToken = await getValidToken()
    if (!authToken) {
      return
    }

    try {
      setLoading(true)
      const result = await saveItem(authToken, product.id)

      if (result._meta.wasExisting) {
        toast.info('Already saved', {
          description: 'This item is already in your saved items.',
          action: {
            label: 'View Saved',
            onClick: () => router.push('/dashboard/saved'),
          },
        })
      } else {
        toast.success('Item saved', {
          description: 'IronScout will watch this item for you.',
          action: {
            label: 'View Saved',
            onClick: () => router.push('/dashboard/saved'),
          },
        })
      }
      onOpenChange(false)
    } catch (err: any) {
      if (err instanceof AuthError) {
        // Try refresh once
        const newToken = await refreshSessionToken()
        if (newToken) {
          try {
            const result = await saveItem(newToken, product.id)
            if (result._meta.wasExisting) {
              toast.info('Already saved', {
                description: 'This item is already in your saved items.',
                action: {
                  label: 'View Saved',
                  onClick: () => router.push('/dashboard/saved'),
                },
              })
            } else {
              toast.success('Item saved', {
                description: 'IronScout will watch this item for you.',
                action: {
                  label: 'View Saved',
                  onClick: () => router.push('/dashboard/saved'),
                },
              })
            }
            onOpenChange(false)
            return
          } catch {
            // Retry failed
          }
        }
        showSessionExpiredToast()
        return
      }
      toast.error(err.message || 'Failed to save item')
      setError(err.message || 'Failed to save item')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const currentPrice = product.prices[0]?.price

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="relative">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
          <CardTitle>Save Item</CardTitle>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {product.name}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Current price info */}
          {currentPrice && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Current lowest price</p>
              <p className="text-2xl font-bold">${currentPrice.toFixed(2)}</p>
            </div>
          )}

          {/* Delegation language - alerts as side effect */}
          <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <Eye className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Save this item and IronScout will watch prices and availability for you.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="flex-1">
            <Bookmark className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Item'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

/**
 * @deprecated Use SaveItemDialog instead
 */
export const CreateAlertDialog = SaveItemDialog

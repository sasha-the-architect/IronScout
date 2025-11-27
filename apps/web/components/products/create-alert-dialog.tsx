'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { createAlert, type Product } from '@/lib/api'
import { X } from 'lucide-react'

interface CreateAlertDialogProps {
  product: Product
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateAlertDialog({ product, open, onOpenChange }: CreateAlertDialogProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [alertType, setAlertType] = useState<'PRICE_DROP' | 'BACK_IN_STOCK' | 'NEW_PRODUCT'>('PRICE_DROP')
  const [targetPrice, setTargetPrice] = useState(
    product.prices[0]?.price ? (product.prices[0].price * 0.9).toFixed(2) : ''
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!session?.user?.id) {
      router.push('/api/auth/signin')
      return
    }

    try {
      setLoading(true)
      await createAlert({
        userId: session.user.id,
        productId: product.id,
        targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
        alertType
      })

      setSuccess(true)
      setTimeout(() => {
        onOpenChange(false)
        setSuccess(false)
      }, 2000)
    } catch (error: any) {
      setError(error.message || 'Failed to create alert')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

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
          <CardTitle>Create Price Alert</CardTitle>
          <p className="text-sm text-muted-foreground">
            Get notified when {product.name} meets your criteria
          </p>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {success && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                Alert created successfully!
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="alert-type" className="text-sm font-medium">
                Alert Type
              </label>
              <select
                id="alert-type"
                value={alertType}
                onChange={(e) => setAlertType(e.target.value as any)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="PRICE_DROP">Price Drop</option>
                <option value="BACK_IN_STOCK">Back in Stock</option>
                <option value="NEW_PRODUCT">New Product</option>
              </select>
            </div>

            {alertType === 'PRICE_DROP' && (
              <div className="space-y-2">
                <label htmlFor="target-price" className="text-sm font-medium">
                  Target Price (Current: ${product.prices[0]?.price.toFixed(2)})
                </label>
                <Input
                  id="target-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="Enter target price"
                  required={alertType === 'PRICE_DROP'}
                />
              </div>
            )}
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
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Creating...' : 'Create Alert'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, ExternalLink, Trash2 } from 'lucide-react'
import { getUserAlerts, deleteAlert, type Alert } from '@/lib/api'

export function RecentAlerts() {
  const { data: session } = useSession()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session?.user?.id) {
      fetchAlerts()
    }
  }, [session])

  const fetchAlerts = async () => {
    const token = (session as any)?.accessToken
    if (!token) return

    try {
      setLoading(true)
      const data = await getUserAlerts(token, true)
      setAlerts(data.slice(0, 3)) // Show only 3 most recent
      setError(null)
    } catch (err) {
      setError('Failed to load alerts')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (alertId: string) => {
    const token = (session as any)?.accessToken
    if (!token) return

    try {
      await deleteAlert(alertId, token)
      setAlerts(alerts.filter(a => a.id !== alertId))
    } catch (err) {
      console.error('Failed to delete alert:', err)
    }
  }

  const getAlertStatus = (alert: Alert) => {
    if (!alert.product.currentPrice || !alert.targetPrice) return 'monitoring'
    return alert.product.currentPrice <= alert.targetPrice ? 'triggered' : 'active'
  }

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Sign in to view your alerts
          </p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Loading alerts...
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive text-center py-8">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Recent Alerts
        </CardTitle>
        <CardDescription>
          Your latest price monitoring alerts and their status
        </CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No active alerts. Search for products and create alerts to track prices.
          </p>
        ) : (
          <>
            <div className="space-y-4">
              {alerts.map((alert) => {
                const status = getAlertStatus(alert)
                return (
                  <div key={alert.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{alert.product.name}</h4>
                        <Badge variant={status === 'triggered' ? 'default' : 'secondary'}>
                          {status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Current: ${alert.product.currentPrice?.toFixed(2) || 'N/A'}
                        {alert.targetPrice && ` • Target: $${alert.targetPrice.toFixed(2)}`}
                        {alert.product.retailer && ` • ${alert.product.retailer.name}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {alert.product.inStock ? 'In stock' : 'Out of stock'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.product.retailer && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={`/products/${alert.productId}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(alert.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <Button variant="outline" className="w-full mt-4" asChild>
              <a href="/dashboard/alerts">View All Alerts</a>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

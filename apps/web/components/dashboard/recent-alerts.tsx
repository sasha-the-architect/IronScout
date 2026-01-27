'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, ExternalLink, Trash2 } from 'lucide-react'
import { getUserAlerts, deleteAlert, AuthError, type Alert } from '@/lib/api'
import { createLogger } from '@/lib/logger'
import { refreshSessionToken, showSessionExpiredToast } from '@/hooks/use-session-refresh'

const logger = createLogger('components:recent-alerts')

export function RecentAlerts() {
  const { data: session, status } = useSession()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      setLoading(false)
      return
    }
    if (token) {
      fetchAlerts()
    } else {
      // Authenticated but no token - try to get one
      getValidToken().then((t) => {
        if (t) fetchAlerts()
        else setLoading(false)
      })
    }
  }, [token, status])

  const fetchAlerts = async () => {
    const authToken = await getValidToken()
    if (!authToken) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const data = await getUserAlerts(authToken, true)
      setAlerts(data.slice(0, 3)) // Show only 3 most recent
      setError(null)
    } catch (err) {
      if (err instanceof AuthError) {
        // Try refresh once
        const newToken = await refreshSessionToken()
        if (newToken) {
          try {
            const data = await getUserAlerts(newToken, true)
            setAlerts(data.slice(0, 3))
            setError(null)
            return
          } catch {
            // Retry failed
          }
        }
        showSessionExpiredToast()
        return
      }
      setError('Failed to load alerts')
      logger.error('Failed to load alerts', {}, err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (alertId: string) => {
    const authToken = await getValidToken()
    if (!authToken) return

    try {
      await deleteAlert(alertId, authToken)
      setAlerts(alerts.filter(a => a.id !== alertId))
    } catch (err) {
      if (err instanceof AuthError) {
        showSessionExpiredToast()
        return
      }
      logger.error('Failed to delete alert', {}, err)
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

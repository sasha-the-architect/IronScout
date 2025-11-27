'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Bell, ExternalLink, Trash2, Edit2, Check, X, Filter } from 'lucide-react'
import { getUserAlerts, updateAlert, deleteAlert, type Alert } from '@/lib/api'
import Image from 'next/image'

export function AlertsManager() {
  const { data: session } = useSession()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [filteredAlerts, setFilteredAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'triggered'>('all')

  useEffect(() => {
    if (session?.user?.id) {
      fetchAlerts()
    }
  }, [session])

  useEffect(() => {
    filterAlerts()
  }, [alerts, filterStatus])

  const fetchAlerts = async () => {
    if (!session?.user?.id) return

    try {
      setLoading(true)
      const data = await getUserAlerts(session.user.id, false)
      setAlerts(data)
      setError(null)
    } catch (err) {
      setError('Failed to load alerts')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filterAlerts = () => {
    let filtered = alerts

    if (filterStatus === 'active') {
      filtered = alerts.filter(a => a.isActive && !isTriggered(a))
    } else if (filterStatus === 'triggered') {
      filtered = alerts.filter(a => isTriggered(a))
    }

    setFilteredAlerts(filtered)
  }

  const isTriggered = (alert: Alert) => {
    if (!alert.product.currentPrice || !alert.targetPrice) return false
    return alert.product.currentPrice <= alert.targetPrice
  }

  const handleDelete = async (alertId: string) => {
    if (!confirm('Are you sure you want to delete this alert?')) return

    try {
      await deleteAlert(alertId)
      setAlerts(alerts.filter(a => a.id !== alertId))
    } catch (err) {
      console.error('Failed to delete alert:', err)
      alert('Failed to delete alert')
    }
  }

  const handleToggleActive = async (alert: Alert) => {
    try {
      await updateAlert(alert.id, { isActive: !alert.isActive })
      setAlerts(alerts.map(a =>
        a.id === alert.id ? { ...a, isActive: !a.isActive } : a
      ))
    } catch (err) {
      console.error('Failed to toggle alert:', err)
      alert('Failed to update alert')
    }
  }

  const startEdit = (alert: Alert) => {
    setEditingId(alert.id)
    setEditPrice(alert.targetPrice?.toString() || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditPrice('')
  }

  const saveEdit = async (alertId: string) => {
    try {
      const newPrice = parseFloat(editPrice)
      if (isNaN(newPrice) || newPrice <= 0) {
        alert('Please enter a valid price')
        return
      }

      await updateAlert(alertId, { targetPrice: newPrice })
      setAlerts(alerts.map(a =>
        a.id === alertId ? { ...a, targetPrice: newPrice } : a
      ))
      setEditingId(null)
      setEditPrice('')
    } catch (err) {
      console.error('Failed to update alert:', err)
      alert('Failed to update alert')
    }
  }

  const getAlertStatus = (alert: Alert) => {
    if (!alert.isActive) return { label: 'Paused', variant: 'secondary' as const }
    if (isTriggered(alert)) return { label: 'Triggered', variant: 'default' as const }
    return { label: 'Active', variant: 'outline' as const }
  }

  if (!session) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">
            Please sign in to view your alerts
          </p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">Loading alerts...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-destructive">{error}</p>
          <Button onClick={fetchAlerts} className="mx-auto mt-4 block">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{alerts.length}</div>
            <p className="text-xs text-muted-foreground">Total Alerts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {alerts.filter(a => a.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {alerts.filter(isTriggered).length}
            </div>
            <p className="text-xs text-muted-foreground">Triggered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {alerts.filter(a => !a.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">Paused</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Buttons */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Button
          size="sm"
          variant={filterStatus === 'all' ? 'default' : 'outline'}
          onClick={() => setFilterStatus('all')}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={filterStatus === 'active' ? 'default' : 'outline'}
          onClick={() => setFilterStatus('active')}
        >
          Active
        </Button>
        <Button
          size="sm"
          variant={filterStatus === 'triggered' ? 'default' : 'outline'}
          onClick={() => setFilterStatus('triggered')}
        >
          Triggered
        </Button>
      </div>

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {filterStatus === 'all'
                  ? 'No alerts yet. Search for products and create alerts to track prices.'
                  : `No ${filterStatus} alerts found.`}
              </p>
              <Button className="mt-4" asChild>
                <a href="/search">Browse Products</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAlerts.map((alert) => {
                const status = getAlertStatus(alert)
                const isEditing = editingId === alert.id

                return (
                  <div
                    key={alert.id}
                    className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    {/* Product Image */}
                    {alert.product.imageUrl && (
                      <div className="w-20 h-20 relative flex-shrink-0 rounded overflow-hidden bg-gray-100">
                        <Image
                          src={alert.product.imageUrl}
                          alt={alert.product.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="font-medium line-clamp-2 flex-1">
                          {alert.product.name}
                        </h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>

                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="text-muted-foreground">
                            Current: <span className="font-semibold text-foreground">
                              ${alert.product.currentPrice?.toFixed(2) || 'N/A'}
                            </span>
                          </span>

                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Target:</span>
                              <Input
                                type="number"
                                step="0.01"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="w-24 h-7 text-sm"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => saveEdit(alert.id)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={cancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              Target: <span className="font-semibold text-foreground">
                                ${alert.targetPrice?.toFixed(2) || 'N/A'}
                              </span>
                            </span>
                          )}
                        </div>

                        {alert.product.retailer && (
                          <p className="text-muted-foreground">
                            Retailer: {alert.product.retailer.name}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Type: {alert.alertType.replace('_', ' ')} •{' '}
                          {alert.product.inStock ? 'In Stock' : 'Out of Stock'}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActive(alert)}
                        title={alert.isActive ? 'Pause alert' : 'Activate alert'}
                      >
                        {alert.isActive ? 'Pause' : 'Activate'}
                      </Button>

                      {!isEditing && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(alert)}
                          title="Edit target price"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        title="View product"
                      >
                        <a href={`/products/${alert.productId}`}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(alert.id)}
                        title="Delete alert"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

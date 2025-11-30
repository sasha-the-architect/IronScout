'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getUserAlerts, getProductPriceHistory, Alert, PriceHistory } from '@/lib/api'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingDown, TrendingUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export function TrackedProductsCharts() {
  const { data: session } = useSession()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [priceData, setPriceData] = useState<Record<string, PriceHistory>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session?.user?.id) {
      fetchData()
    }
  }, [session])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Get active alerts
      const userAlerts = await getUserAlerts(session!.user.id, true)

      // Take top 3 most recent alerts
      const topAlerts = userAlerts.slice(0, 3)
      setAlerts(topAlerts)

      // Fetch price history for each product
      const histories: Record<string, PriceHistory> = {}
      for (const alert of topAlerts) {
        try {
          const history = await getProductPriceHistory(alert.productId, 30)
          histories[alert.productId] = history
        } catch (error) {
          console.error(`Failed to fetch history for ${alert.productId}:`, error)
        }
      }
      setPriceData(histories)
    } catch (error) {
      console.error('Failed to fetch tracked products:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tracked Products Price History</CardTitle>
          <CardDescription>Price trends for your watched items</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tracked Products Price History</CardTitle>
          <CardDescription>Price trends for your watched items</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-muted-foreground mb-4">
              You're not tracking any products yet
            </p>
            <Button size="sm" asChild>
              <Link href="/search">Browse Products</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracked Products Price History</CardTitle>
        <CardDescription>Price trends for your watched items (last 30 days)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {alerts.map((alert) => {
            const history = priceData[alert.productId]

            if (!history) return null

            // Transform data for mini chart
            const chartData = history.timeline.map(point => ({
              date: new Date(point.date).toLocaleDateString(),
              price: point.price
            }))

            // Calculate trend
            const firstPrice = history.timeline[0]?.price || 0
            const lastPrice = history.timeline[history.timeline.length - 1]?.price || 0
            const priceTrend = lastPrice - firstPrice
            const trendPercentage = firstPrice > 0 ? ((priceTrend / firstPrice) * 100).toFixed(1) : '0'

            // Check if price is below target
            const isPriceBelowTarget = alert.targetPrice && history.stats.current <= alert.targetPrice

            return (
              <div key={alert.id} className="border rounded-lg p-4 space-y-3">
                {/* Product Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <Link
                      href={`/products/${alert.productId}`}
                      className="font-medium hover:underline line-clamp-2"
                    >
                      {alert.product.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-muted-foreground">{alert.product.category}</span>
                      {alert.product.brand && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-sm text-muted-foreground">{alert.product.brand}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/products/${alert.productId}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                {/* Price Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded p-2">
                    <div className="text-xs text-muted-foreground">Current</div>
                    <div className="text-sm font-bold">${history.stats.current.toFixed(2)}</div>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <div className="text-xs text-muted-foreground">Lowest</div>
                    <div className="text-sm font-bold text-green-600">${history.stats.lowest.toFixed(2)}</div>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <div className="text-xs text-muted-foreground">Target</div>
                    <div className="text-sm font-bold">
                      {alert.targetPrice ? `$${alert.targetPrice.toFixed(2)}` : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Trend Indicator */}
                {priceTrend !== 0 && (
                  <div className={`flex items-center gap-2 text-sm px-2 py-1 rounded ${
                    priceTrend < 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {priceTrend < 0 ? (
                      <TrendingDown className="h-4 w-4" />
                    ) : (
                      <TrendingUp className="h-4 w-4" />
                    )}
                    <span>
                      {priceTrend < 0 ? 'Down' : 'Up'} ${Math.abs(priceTrend).toFixed(2)} ({trendPercentage}%)
                    </span>
                  </div>
                )}

                {/* Alert Status */}
                {isPriceBelowTarget && (
                  <Badge className="bg-green-600">
                    Price Alert Triggered! Now at target price
                  </Badge>
                )}

                {/* Mini Chart */}
                <div className="h-24 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis
                        dataKey="date"
                        hide
                      />
                      <YAxis
                        domain={['dataMin - 5', 'dataMax + 5']}
                        hide
                      />
                      <Tooltip
                        formatter={(value: any) => [`$${value.toFixed(2)}`, 'Price']}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke={priceTrend < 0 ? '#10b981' : '#3b82f6'}
                        strokeWidth={2}
                        dot={false}
                      />
                      {/* Target price reference line */}
                      {alert.targetPrice && (
                        <Line
                          type="monotone"
                          dataKey={() => alert.targetPrice}
                          stroke="#f59e0b"
                          strokeWidth={1}
                          strokeDasharray="5 5"
                          dot={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })}

          {alerts.length > 0 && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/alerts">View All Alerts</Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

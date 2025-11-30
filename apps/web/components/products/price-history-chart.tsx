'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { getProductPriceHistory, PriceHistory } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingDown, TrendingUp } from 'lucide-react'

interface PriceHistoryChartProps {
  productId: string
}

const RETAILER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

export function PriceHistoryChart({ productId }: PriceHistoryChartProps) {
  const [data, setData] = useState<PriceHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    fetchPriceHistory()
  }, [productId, days])

  const fetchPriceHistory = async () => {
    try {
      setLoading(true)
      setError(null)
      const history = await getProductPriceHistory(productId, days)
      setData(history)
    } catch (err) {
      setError('Failed to load price history')
      console.error('Price history error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse text-muted-foreground">Loading price history...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {error || 'No price history available'}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Transform data for Recharts
  const chartData = data.timeline.reduce((acc, point) => {
    const dateKey = new Date(point.date).toLocaleDateString()
    const existing = acc.find(item => item.date === dateKey)

    if (existing) {
      existing[point.retailerName] = point.price
    } else {
      acc.push({
        date: dateKey,
        timestamp: new Date(point.date).getTime(),
        [point.retailerName]: point.price
      })
    }

    return acc
  }, [] as any[])

  // Sort by timestamp
  chartData.sort((a, b) => a.timestamp - b.timestamp)

  // Get unique retailers
  const retailers = Array.from(new Set(data.timeline.map(p => p.retailerName)))

  // Calculate price trend
  const firstPrice = data.timeline[0]?.price || 0
  const lastPrice = data.timeline[data.timeline.length - 1]?.price || 0
  const priceTrend = lastPrice - firstPrice
  const trendPercentage = firstPrice > 0 ? ((priceTrend / firstPrice) * 100).toFixed(1) : '0'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Price History</CardTitle>
            <CardDescription>
              Track price changes over the last {days} days
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={days === 7 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(7)}
            >
              7 Days
            </Button>
            <Button
              variant={days === 30 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(30)}
            >
              30 Days
            </Button>
            <Button
              variant={days === 90 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(90)}
            >
              90 Days
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Price Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Current</div>
            <div className="text-lg font-bold">${data.stats.current.toFixed(2)}</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Lowest</div>
            <div className="text-lg font-bold text-green-600">${data.stats.lowest.toFixed(2)}</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Highest</div>
            <div className="text-lg font-bold text-red-600">${data.stats.highest.toFixed(2)}</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Average</div>
            <div className="text-lg font-bold">${data.stats.average.toFixed(2)}</div>
          </div>
        </div>

        {/* Price Trend Indicator */}
        {priceTrend !== 0 && (
          <div className={`flex items-center gap-2 mb-4 p-3 rounded-lg ${
            priceTrend < 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {priceTrend < 0 ? (
              <TrendingDown className="h-5 w-5" />
            ) : (
              <TrendingUp className="h-5 w-5" />
            )}
            <span className="font-medium">
              {priceTrend < 0 ? 'Decreased' : 'Increased'} by ${Math.abs(priceTrend).toFixed(2)} ({trendPercentage}%) over {days} days
            </span>
          </div>
        )}

        {/* Chart */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                formatter={(value: any) => [`$${value.toFixed(2)}`, 'Price']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              {retailers.map((retailer, index) => (
                <Line
                  key={retailer}
                  type="monotone"
                  dataKey={retailer}
                  stroke={RETAILER_COLORS[index % RETAILER_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Retailer Breakdown */}
        <div className="mt-6">
          <h4 className="font-semibold mb-3">Price by Retailer</h4>
          <div className="space-y-2">
            {data.history.map((retailerHistory, index) => {
              const latestPrice = retailerHistory.prices[retailerHistory.prices.length - 1]
              const oldestPrice = retailerHistory.prices[0]
              const change = latestPrice.price - oldestPrice.price
              const changePercent = oldestPrice.price > 0
                ? ((change / oldestPrice.price) * 100).toFixed(1)
                : '0'

              return (
                <div key={retailerHistory.retailer.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: RETAILER_COLORS[index % RETAILER_COLORS.length] }}
                    />
                    <span className="font-medium">{retailerHistory.retailer.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">${latestPrice.price.toFixed(2)}</div>
                    {change !== 0 && (
                      <div className={`text-sm ${change < 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {change > 0 ? '+' : ''}${change.toFixed(2)} ({changePercent}%)
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

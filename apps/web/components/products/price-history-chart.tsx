'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingDown, TrendingUp, Minus, Crown, Lock } from 'lucide-react'
import Link from 'next/link'

interface PriceHistoryProps {
  productId: string
  isPremium: boolean
}

interface HistoryPoint {
  date: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  dataPoints: number
}

interface PriceHistoryData {
  product: {
    id: string
    name: string
  }
  history: HistoryPoint[]
  summary: {
    days: number
    dataPoints: number
    lowestPrice: number | null
    highestPrice: number | null
    currentPrice: number | null
  }
}

const CHART_COLOR = '#3b82f6'

export function PriceHistoryChart({ productId, isPremium }: PriceHistoryProps) {
  const [data, setData] = useState<PriceHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    if (isPremium) {
      fetchPriceHistory()
    } else {
      setLoading(false)
    }
  }, [productId, days, isPremium])

  const fetchPriceHistory = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_BASE_URL}/api/products/${productId}/history?days=${days}`)
      
      if (!response.ok) {
        if (response.status === 403) {
          setError('premium')
          return
        }
        throw new Error('Failed to fetch price history')
      }
      
      const history = await response.json()
      setData(history)
    } catch (err) {
      setError('Failed to load price history')
      console.error('Price history error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Show upgrade prompt for non-Premium users
  if (!isPremium) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Price History
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              <Crown className="h-3 w-3 mr-1" />
              Premium
            </Badge>
          </CardTitle>
          <CardDescription>
            Track price changes over time to find the best deals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex flex-col items-center justify-center bg-muted/20 rounded-lg border-2 border-dashed border-muted">
            <Lock className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-center mb-4">
              Price history charts are available for Premium members
            </p>
            <Button asChild className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
              <Link href="/pricing">
                <Crown className="h-4 w-4 mr-2" />
                Upgrade to Premium
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
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

  if (error === 'premium') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex flex-col items-center justify-center">
            <Crown className="h-10 w-10 text-amber-500 mb-3" />
            <p className="text-muted-foreground text-center mb-4">
              Upgrade to Premium to view price history
            </p>
            <Button asChild variant="outline">
              <Link href="/pricing">View Plans</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data || !data.history || data.history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {error || 'No price history available for this product yet'}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Transform data for Recharts
  const chartData = data.history.map(point => ({
    date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: point.avgPrice,
    min: point.minPrice,
    max: point.maxPrice
  }))

  // Calculate price trend
  const firstPrice = data.history[0]?.avgPrice || 0
  const lastPrice = data.history[data.history.length - 1]?.avgPrice || 0
  const priceTrend = lastPrice - firstPrice
  const trendPercentage = firstPrice > 0 ? ((priceTrend / firstPrice) * 100).toFixed(1) : '0'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Price History
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                <Crown className="h-3 w-3 mr-1" />
                Premium
              </Badge>
            </CardTitle>
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
              7D
            </Button>
            <Button
              variant={days === 30 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(30)}
            >
              30D
            </Button>
            <Button
              variant={days === 90 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(90)}
            >
              90D
            </Button>
            <Button
              variant={days === 365 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(365)}
            >
              1Y
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Price Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Current</div>
            <div className="text-lg font-bold">
              {data.summary.currentPrice ? `$${data.summary.currentPrice.toFixed(2)}` : 'N/A'}
            </div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Lowest</div>
            <div className="text-lg font-bold text-green-600">
              {data.summary.lowestPrice ? `$${data.summary.lowestPrice.toFixed(2)}` : 'N/A'}
            </div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Highest</div>
            <div className="text-lg font-bold text-red-600">
              {data.summary.highestPrice ? `$${data.summary.highestPrice.toFixed(2)}` : 'N/A'}
            </div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Data Points</div>
            <div className="text-lg font-bold">{data.summary.dataPoints}</div>
          </div>
        </div>

        {/* Price Trend Indicator */}
        {priceTrend !== 0 && (
          <div className={`flex items-center gap-2 mb-4 p-3 rounded-lg ${
            priceTrend < 0 
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}>
            {priceTrend < 0 ? (
              <TrendingDown className="h-5 w-5" />
            ) : priceTrend > 0 ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <Minus className="h-5 w-5" />
            )}
            <span className="font-medium">
              {priceTrend < 0 ? 'Down' : 'Up'} ${Math.abs(priceTrend).toFixed(2)} ({trendPercentage}%) over {days} days
            </span>
          </div>
        )}

        {/* Chart */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value}`}
                domain={['dataMin - 1', 'dataMax + 1']}
              />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke={CHART_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLOR }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Buy recommendation */}
        {data.summary.currentPrice && data.summary.lowestPrice && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              {data.summary.currentPrice <= data.summary.lowestPrice * 1.05 ? (
                <span className="text-green-600 font-medium">
                  ✓ Current price is near the {days}-day low — good time to buy!
                </span>
              ) : data.summary.currentPrice >= data.summary.highestPrice! * 0.95 ? (
                <span className="text-amber-600 font-medium">
                  ⚠ Current price is near the {days}-day high — consider waiting
                </span>
              ) : (
                <span>
                  Current price is in the middle range for the last {days} days
                </span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

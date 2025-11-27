'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, Bell, Eye, DollarSign } from 'lucide-react'
import { getUserAlerts } from '@/lib/api'

export function DashboardOverview() {
  const { data: session } = useSession()
  const [stats, setStats] = useState({
    activeAlerts: 0,
    triggeredAlerts: 0,
    totalProducts: 0,
    potentialSavings: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session?.user?.id) {
      fetchStats()
    }
  }, [session])

  const fetchStats = async () => {
    if (!session?.user?.id) return

    try {
      setLoading(true)
      const alerts = await getUserAlerts(session.user.id, false)

      const activeCount = alerts.filter(a => a.isActive).length
      const triggeredCount = alerts.filter(a => {
        if (!a.product.currentPrice || !a.targetPrice) return false
        return a.product.currentPrice <= a.targetPrice
      }).length

      const savings = alerts.reduce((sum, alert) => {
        if (!alert.product.currentPrice || !alert.targetPrice) return sum
        const diff = alert.targetPrice - alert.product.currentPrice
        return sum + (diff > 0 ? diff : 0)
      }, 0)

      setStats({
        activeAlerts: activeCount,
        triggeredAlerts: triggeredCount,
        totalProducts: alerts.length,
        potentialSavings: savings
      })
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: 'Active Alerts',
      value: loading ? '...' : stats.activeAlerts.toString(),
      description: 'Monitoring price changes',
      icon: Bell
    },
    {
      title: 'Deals Found',
      value: loading ? '...' : stats.triggeredAlerts.toString(),
      description: 'Price drops detected',
      icon: TrendingUp
    },
    {
      title: 'Products Tracked',
      value: loading ? '...' : stats.totalProducts.toString(),
      description: 'Items in your watchlist',
      icon: Eye
    },
    {
      title: 'Potential Savings',
      value: loading ? '...' : `$${stats.potentialSavings.toFixed(2)}`,
      description: 'Based on target prices',
      icon: DollarSign
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

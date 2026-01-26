'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, Bell, Eye, DollarSign } from 'lucide-react'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'

interface DashboardOverviewProps {
  variant?: 'grid' | 'compact'
}

export function DashboardOverview({ variant = 'grid' }: DashboardOverviewProps) {
  const { stats, loading } = useDashboardStats()

  const statCards = [
    {
      title: 'Active Alerts',
      value: loading ? '...' : stats.activeAlerts.toString(),
      description: 'Monitoring price changes',
      icon: Bell
    },
    {
      title: 'Price Drops Seen',
      value: loading ? '...' : stats.triggeredAlerts.toString(),
      description: 'Recent drops detected',
      icon: TrendingUp
    },
    {
      title: 'Products Tracked',
      value: loading ? '...' : stats.totalProducts.toString(),
      description: 'Items in your watchlist',
      icon: Eye
    },
    {
      title: 'Price Difference',
      value: loading ? '...' : `$${stats.potentialSavings.toFixed(2)}`,
      description: 'Compared to target prices',
      icon: DollarSign
    }
  ]

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-4 md:gap-6">
        {statCards.map((stat, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-semibold leading-none">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.title}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

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

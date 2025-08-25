import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, Bell, Eye, DollarSign } from 'lucide-react'

const stats = [
  {
    title: 'Active Alerts',
    value: '12',
    description: 'Monitoring price changes',
    icon: Bell,
    trend: '+2 this week'
  },
  {
    title: 'Money Saved',
    value: '$247',
    description: 'Total savings this month',
    icon: DollarSign,
    trend: '+$89 vs last month'
  },
  {
    title: 'Products Tracked',
    value: '34',
    description: 'Items in your watchlist',
    icon: Eye,
    trend: '+5 this week'
  },
  {
    title: 'Deals Found',
    value: '18',
    description: 'Price drops detected',
    icon: TrendingUp,
    trend: '+12 this week'
  }
]

export function DashboardOverview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
            <p className="text-xs text-green-600 mt-1">{stat.trend}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

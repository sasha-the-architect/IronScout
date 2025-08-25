import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, ExternalLink, Trash2 } from 'lucide-react'

const mockAlerts = [
  {
    id: '1',
    productName: 'iPhone 15 Pro Max',
    currentPrice: 1099,
    targetPrice: 999,
    retailer: 'Apple Store',
    status: 'active',
    lastChecked: '2 minutes ago'
  },
  {
    id: '2',
    productName: 'Sony WH-1000XM5 Headphones',
    currentPrice: 349,
    targetPrice: 299,
    retailer: 'Best Buy',
    status: 'triggered',
    lastChecked: '1 hour ago'
  },
  {
    id: '3',
    productName: 'MacBook Air M2',
    currentPrice: 1199,
    targetPrice: 1099,
    retailer: 'Amazon',
    status: 'active',
    lastChecked: '5 minutes ago'
  }
]

export function RecentAlerts() {
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
        <div className="space-y-4">
          {mockAlerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">{alert.productName}</h4>
                  <Badge variant={alert.status === 'triggered' ? 'default' : 'secondary'}>
                    {alert.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Current: ${alert.currentPrice} • Target: ${alert.targetPrice} • {alert.retailer}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Last checked {alert.lastChecked}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" className="w-full mt-4">
          View All Alerts
        </Button>
      </CardContent>
    </Card>
  )
}

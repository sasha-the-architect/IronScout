import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Search, Settings, Bell } from 'lucide-react'

const actions = [
  {
    title: 'Search Products',
    description: 'Compare current ammo prices',
    icon: Search,
    href: '/search'
  },
  {
    title: 'Create Alert',
    description: 'Set up a new price alert',
    icon: Plus,
    href: '/search'
  },
  {
    title: 'Saved Items',
    description: 'View and manage your saved items',
    icon: Bell,
    href: '/dashboard/saved'
  },
  {
    title: 'Settings',
    description: 'Manage your preferences',
    icon: Settings,
    href: '/dashboard/settings'
  }
]

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>
          Common tasks and shortcuts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant="ghost"
            className="w-full justify-start h-auto p-4"
            asChild
          >
            <a href={action.href}>
              <action.icon className="h-4 w-4 mr-3" />
              <div className="text-left">
                <div className="font-medium">{action.title}</div>
                <div className="text-xs text-muted-foreground">{action.description}</div>
              </div>
            </a>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}

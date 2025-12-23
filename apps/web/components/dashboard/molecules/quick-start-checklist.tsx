'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, Search, Bookmark, Bell, TrendingUp, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface ChecklistItem {
  id: string
  label: string
  description: string
  completed: boolean
  href: string
  icon: React.ElementType
}

interface QuickStartChecklistProps {
  /** Number of saved items */
  savedCount: number
  /** Number of alerts configured */
  alertCount: number
  /** Whether user has viewed trends */
  hasViewedTrends?: boolean
}

/**
 * QuickStartChecklist - Onboarding progress tracker
 *
 * Shows users exactly what to do next with animated checkmarks.
 * Each item is clickable and drives engagement.
 */
export function QuickStartChecklist({
  savedCount = 0,
  alertCount = 0,
  hasViewedTrends = false,
}: QuickStartChecklistProps) {
  const items: ChecklistItem[] = [
    {
      id: 'search',
      label: 'Search for products',
      description: 'Browse ammo by caliber or brand',
      completed: true, // Always completed if they're on dashboard
      href: '/dashboard/search',
      icon: Search,
    },
    {
      id: 'save',
      label: 'Save your first item',
      description: 'Save from search results to get alerts',
      completed: savedCount > 0,
      href: '/dashboard/search',
      icon: Bookmark,
    },
    {
      id: 'alert',
      label: 'Set a price alert',
      description: 'Get notified when prices drop',
      completed: alertCount > 0,
      href: '/dashboard/saved',
      icon: Bell,
    },
    {
      id: 'trends',
      label: 'Check market trends',
      description: 'See price history and timing',
      completed: hasViewedTrends,
      href: '/dashboard/trends',
      icon: TrendingUp,
    },
  ]

  const completedCount = items.filter((i) => i.completed).length
  const allComplete = completedCount === items.length

  // Don't show if user has completed all steps
  if (allComplete) {
    return null
  }

  // Find next incomplete step
  const nextStep = items.find((i) => !i.completed)

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Getting Started
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{items.length} complete
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${(completedCount / items.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {items.map((item) => {
          const Icon = item.icon
          const isNext = item.id === nextStep?.id

          return (
            <Link key={item.id} href={item.href}>
              <div
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg transition-all',
                  item.completed
                    ? 'opacity-60'
                    : 'hover:bg-muted/50 cursor-pointer',
                  isNext && 'bg-primary/5 border border-primary/20'
                )}
              >
                {/* Checkbox */}
                <div className="flex-shrink-0">
                  {item.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-status-buy" />
                  ) : (
                    <Circle className={cn(
                      'h-5 w-5',
                      isNext ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  )}
                </div>

                {/* Icon */}
                <div className="flex-shrink-0">
                  <Icon className={cn(
                    'h-4 w-4',
                    item.completed ? 'text-muted-foreground' : 'text-foreground'
                  )} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-medium',
                    item.completed ? 'line-through text-muted-foreground' : 'text-foreground'
                  )}>
                    {item.label}
                  </p>
                  {!item.completed && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Arrow for incomplete */}
                {!item.completed && (
                  <ChevronRight className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isNext ? 'text-primary' : 'text-muted-foreground'
                  )} />
                )}
              </div>
            </Link>
          )
        })}

        {/* Next step CTA */}
        {nextStep && (
          <div className="pt-3">
            <Link href={nextStep.href}>
              <Button className="w-full" size="sm">
                {nextStep.label}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell } from 'lucide-react'
import Link from 'next/link'

interface PremiumPromptProps {
  /** Whether user is already premium */
  isPremium?: boolean
}

/**
 * PremiumPrompt - Dashboard v3 Upgrade Prompt (ADR-012)
 *
 * A single, soft prompt at the bottom of the dashboard.
 * Premium is framed as automation and speed, not exclusive truth.
 *
 * Constraints (ADR-012):
 * - No locked data shown
 * - No blurred UI
 * - No urgency or upsell pressure
 */
export function PremiumPrompt({ isPremium = false }: PremiumPromptProps) {
  // Don't show to premium users
  if (isPremium) {
    return null
  }

  // Increased mt-8 for visual separation from Saved Items section
  // Softened copy to feel less transactional and avoid implying causality
  // ("you have nothing saved → pay us")
  return (
    <Card className="bg-muted/20 border-border/50 mt-8">
      <CardContent className="py-4 px-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 p-1.5 rounded-full bg-muted">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Get notified when prices drop on items you're watching.
              </p>
            </div>
          </div>

          <Link href="/pricing">
            <Button size="sm" variant="ghost" className="w-full sm:w-auto text-xs">
              Learn more
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

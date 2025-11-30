'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Crown, Sparkles, X } from 'lucide-react'
import { useState } from 'react'

interface UpgradeBannerProps {
  title?: string
  description?: string
  feature?: string
  dismissible?: boolean
  variant?: 'banner' | 'card' | 'inline'
}

export function UpgradeBanner({
  title = 'Upgrade to Premium',
  description = 'Unlock unlimited alerts, price history, and real-time notifications',
  feature,
  dismissible = false,
  variant = 'banner'
}: UpgradeBannerProps) {
  const { data: session } = useSession()
  const [dismissed, setDismissed] = useState(false)

  // Don't show if user is already premium or banner is dismissed
  if (session?.user?.tier === 'PREMIUM' || dismissed) {
    return null
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg">
        <Crown className="h-5 w-5 text-yellow-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-yellow-900">
            {feature ? `${feature} is a Premium feature` : title}
          </p>
          <p className="text-xs text-yellow-700">
            {description}
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/pricing">
            Upgrade
          </Link>
        </Button>
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <Card className="border-yellow-200 bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-5 w-5 text-yellow-600" />
                <h3 className="font-semibold text-yellow-900">{title}</h3>
                <Sparkles className="h-4 w-4 text-yellow-500" />
              </div>
              <p className="text-sm text-yellow-700 mb-4">{description}</p>
              <div className="flex gap-2">
                <Button size="sm" asChild>
                  <Link href="/pricing">
                    View Plans
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/pricing">
                    Learn More
                  </Link>
                </Button>
              </div>
            </div>
            {dismissible && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDismissed(true)}
                className="flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Banner variant (default)
  return (
    <div className="relative bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 text-yellow-900">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Crown className="h-5 w-5 flex-shrink-0" />
            <div>
              <span className="font-semibold">{title}</span>
              <span className="hidden sm:inline"> - {description}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              asChild
              className="bg-white text-yellow-900 hover:bg-yellow-50"
            >
              <Link href="/pricing">
                Upgrade Now
              </Link>
            </Button>
            {dismissible && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDismissed(true)}
                className="hover:bg-yellow-500/20"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

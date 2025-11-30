'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import confetti from 'canvas-confetti'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    // Celebrate with confetti!
    if (sessionId) {
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        })
        setLoading(false)
      }, 500)
    } else {
      // No session ID, redirect to pricing
      router.push('/pricing')
    }
  }, [sessionId, router])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-24">
        <div className="max-w-2xl mx-auto text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Processing your subscription...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="text-center pb-8">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <CheckCircle className="h-20 w-20 text-green-600" />
                <Sparkles className="h-6 w-6 text-yellow-500 absolute -top-2 -right-2 animate-pulse" />
              </div>
            </div>
            <CardTitle className="text-3xl text-green-900">
              Welcome to Premium!
            </CardTitle>
            <p className="text-green-700 mt-2">
              Your subscription has been activated successfully
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="bg-white rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg">What's Next?</h3>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium">Set up your first price alert</h4>
                    <p className="text-sm text-muted-foreground">
                      Find products and create unlimited real-time alerts
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium">Explore price history</h4>
                    <p className="text-sm text-muted-foreground">
                      View detailed charts and analytics for any product
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium">Track your savings</h4>
                    <p className="text-sm text-muted-foreground">
                      Monitor all your deals from your dashboard
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-2">Premium Features Unlocked:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✓ Real-time price alerts</li>
                <li>✓ Unlimited tracked products</li>
                <li>✓ Price history charts & analytics</li>
                <li>✓ Advanced filtering options</li>
                <li>✓ Priority customer support</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild className="flex-1">
                <Link href="/search">
                  Start Shopping
                </Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/dashboard">
                  Go to Dashboard
                </Link>
              </Button>
            </div>

            <div className="text-center pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                You can manage your subscription anytime from{' '}
                <Link href="/dashboard/settings" className="text-primary hover:underline">
                  Settings
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

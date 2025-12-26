'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { getUserAlerts } from '@/lib/api'
import { createLogger } from '@/lib/logger'

const logger = createLogger('hooks:dashboard-stats')

export interface DashboardStats {
  activeAlerts: number
  triggeredAlerts: number
  totalProducts: number
  potentialSavings: number
}

export interface UseDashboardStatsResult {
  stats: DashboardStats
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDashboardStats(): UseDashboardStatsResult {
  const { data: session } = useSession()
  const [stats, setStats] = useState<DashboardStats>({
    activeAlerts: 0,
    triggeredAlerts: 0,
    totalProducts: 0,
    potentialSavings: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
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
      logger.error('Failed to fetch stats', {}, err)
      setError('Failed to load dashboard stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.user?.id) {
      fetchStats()
    }
  }, [session])

  return { stats, loading, error, refetch: fetchStats }
}

'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { SparklineProps, Trend } from '@/types/dashboard'

const TREND_COLORS: Record<Trend, string> = {
  UP: 'stroke-status-wait',
  DOWN: 'stroke-status-buy',
  STABLE: 'stroke-muted-foreground',
}

/**
 * Sparkline - Minimal trend chart
 *
 * Simple SVG line chart showing price trends.
 * Color changes based on trend direction.
 */
export function Sparkline({
  data,
  trend = 'STABLE',
  width = 60,
  height = 20,
}: SparklineProps) {
  const pathData = useMemo(() => {
    if (!data || data.length < 2) return ''

    // Normalize data to 0-1 range
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1

    const normalized = data.map((v) => (v - min) / range)

    // Build SVG path
    const stepX = width / (data.length - 1)
    const padding = 2

    const points = normalized.map((y, i) => {
      const x = i * stepX
      const yPos = height - padding - y * (height - 2 * padding)
      return `${x},${yPos}`
    })

    return `M ${points.join(' L ')}`
  }, [data, width, height])

  if (!data || data.length < 2) {
    // Show placeholder bars
    return (
      <div
        className="flex items-end gap-0.5"
        style={{ width, height }}
        aria-label="No trend data available"
      >
        {[0.3, 0.5, 0.4, 0.6, 0.5, 0.4, 0.5].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-muted-foreground/30 rounded-sm"
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>
    )
  }

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      aria-label={`Price trend: ${trend.toLowerCase()}`}
      role="img"
    >
      <path
        d={pathData}
        fill="none"
        className={cn('transition-colors duration-300', TREND_COLORS[trend])}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Generate sparkline data from trend direction
 * Used when actual historical data isn't available
 */
export function generateSparklineFromTrend(
  trend: Trend,
  points: number = 7
): number[] {
  const base = 0.5
  const variance = 0.15

  return Array.from({ length: points }, (_, i) => {
    const noise = (Math.random() - 0.5) * variance * 2
    let value = base + noise

    // Add trend bias
    if (trend === 'UP') {
      value += (i / points) * 0.3
    } else if (trend === 'DOWN') {
      value -= (i / points) * 0.3
    }

    return Math.max(0.1, Math.min(0.9, value))
  })
}

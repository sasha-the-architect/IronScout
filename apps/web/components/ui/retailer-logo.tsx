'use client'

import { useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface RetailerLogoProps {
  /** Retailer name for initials fallback */
  name: string
  /** Logo URL (optional - will fallback to initials if not provided or on error) */
  logoUrl?: string | null
  /** Size of the logo (default: 32) */
  size?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Generate initials from retailer name
 * Takes first letter of first two words, or first two letters if single word
 */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '??'

  if (words.length === 1) {
    // Single word: take first two letters
    return words[0].substring(0, 2).toUpperCase()
  }

  // Multiple words: take first letter of first two words
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Generate a consistent background color based on retailer name
 * Uses a hash to ensure same retailer always gets same color
 */
function getBackgroundColor(name: string): string {
  // Color palette - muted, professional colors
  const colors = [
    'bg-slate-500',
    'bg-zinc-500',
    'bg-stone-500',
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-600',
    'bg-lime-600',
    'bg-green-600',
    'bg-emerald-600',
    'bg-teal-600',
    'bg-cyan-600',
    'bg-sky-600',
    'bg-blue-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-purple-600',
    'bg-fuchsia-600',
    'bg-pink-500',
    'bg-rose-500',
  ]

  // Simple hash based on name
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }

  const index = Math.abs(hash) % colors.length
  return colors[index]
}

/**
 * RetailerLogo - Displays retailer logo with initials fallback
 *
 * Features:
 * - Attempts to load provided logo URL
 * - Falls back to styled initials on error or missing URL
 * - Consistent color per retailer name
 * - Smooth loading transition
 */
export function RetailerLogo({
  name,
  logoUrl,
  size = 32,
  className,
}: RetailerLogoProps) {
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(!!logoUrl)

  const initials = useMemo(() => getInitials(name), [name])
  const bgColor = useMemo(() => getBackgroundColor(name), [name])

  const handleError = useCallback(() => {
    setImageError(true)
    setIsLoading(false)
  }, [])

  const handleLoad = useCallback(() => {
    setIsLoading(false)
  }, [])

  // Show initials if no URL or image failed to load
  const showInitials = !logoUrl || imageError

  // Calculate font size based on container size
  const fontSize = Math.max(10, Math.floor(size * 0.4))

  return (
    <div
      className={cn(
        'relative rounded-full overflow-hidden flex items-center justify-center flex-shrink-0',
        showInitials && bgColor,
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* Loading state */}
      {isLoading && !showInitials && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded-full" />
      )}

      {/* Initials fallback */}
      {showInitials && (
        <span
          className="font-semibold text-white select-none"
          style={{ fontSize }}
        >
          {initials}
        </span>
      )}

      {/* Image */}
      {!showInitials && logoUrl && (
        <Image
          src={logoUrl}
          alt={`${name} logo`}
          fill
          className={cn(
            'object-cover transition-opacity duration-200',
            isLoading ? 'opacity-0' : 'opacity-100'
          )}
          onError={handleError}
          onLoad={handleLoad}
          unoptimized // Allow external URLs
        />
      )}
    </div>
  )
}

/**
 * RetailerLogoSkeleton - Loading placeholder
 */
export function RetailerLogoSkeleton({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-muted animate-pulse"
      style={{ width: size, height: size }}
    />
  )
}

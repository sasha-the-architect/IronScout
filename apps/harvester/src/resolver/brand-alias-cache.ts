/**
 * Brand Alias Cache for Resolver
 * Per brand-aliases-v1 spec: Preload ACTIVE aliases into memory with periodic refresh.
 *
 * Features:
 * - In-memory cache of active aliases
 * - Periodic refresh (configurable, default 60s)
 * - Redis pub/sub for near-instant cache invalidation
 * - Fail-open on lookup errors (fall back to original brand)
 * - Metrics for observability
 */

import { PrismaClient } from '@ironscout/db'
import { BrandAliasStatus } from '@ironscout/db/generated/prisma'
import Redis from 'ioredis'
import {
  sendSlackMessage,
  slackHeader,
  slackFieldsSection,
  slackActions,
  slackButton,
  slackContext,
  SLACK_CONFIG,
} from '@ironscout/notifications'
import { BRAND_NORMALIZATION_VERSION } from './brand-normalization'
import { logger } from '../config/logger'
import { redisConnection } from '../config/redis'

const log = logger.resolver

// Cache refresh interval (ms)
const CACHE_REFRESH_INTERVAL_MS = Number(process.env.BRAND_ALIAS_CACHE_REFRESH_MS) || 60_000

// Alert threshold for cache age (s)
const CACHE_AGE_ALERT_THRESHOLD_S = 300

// High-impact alert threshold (daily applications within 24h of activation)
const HIGH_IMPACT_ALERT_THRESHOLD = Number(process.env.BRAND_ALIAS_HIGH_IMPACT_THRESHOLD) || 1000
const HIGH_IMPACT_WINDOW_MS = 24 * 60 * 60 * 1000

// Feature flag for applying aliases (default: false per spec)
const RESOLVER_BRAND_ALIASES_ENABLED =
  process.env.RESOLVER_BRAND_ALIASES_ENABLED === 'true'

// Redis pub/sub channel for cache invalidation
const BRAND_ALIAS_INVALIDATE_CHANNEL = 'brand-alias:invalidate'

interface AliasEntry {
  id: string
  aliasNorm: string
  canonicalNorm: string
}

interface CacheMetrics {
  hits: number
  misses: number
  errors: number
  lastRefreshAt: Date | null
  lastRefreshDurationMs: number
  aliasCount: number
}

class BrandAliasCache {
  private aliasMap: Map<string, AliasEntry> = new Map()
  private lastRefreshAt: Date | null = null
  private lastRefreshDurationMs = 0
  private refreshTimer: NodeJS.Timeout | null = null
  private isRefreshing = false
  private pendingInvalidation = false
  private prisma: PrismaClient | null = null
  private subscriber: Redis | null = null

  // Metrics
  private hits = 0
  private misses = 0
  private errors = 0

  // Rate limiting for subscriber error logs (prevent spam during outages)
  private subscriberErrorCount = 0
  private lastSubscriberErrorLog = 0

  /**
   * Initialize the cache with a Prisma client.
   * Must be called before using the cache.
   */
  async initialize(prisma: PrismaClient): Promise<void> {
    this.prisma = prisma
    await this.refresh()
    this.startPeriodicRefresh()
    await this.startInvalidationSubscriber()
  }

  /**
   * Start Redis pub/sub subscriber for cache invalidation.
   * When admin activates/disables an alias, we get notified and refresh immediately.
   */
  private async startInvalidationSubscriber(): Promise<void> {
    try {
      this.subscriber = new Redis({
        ...redisConnection,
        lazyConnect: true,
      })

      this.subscriber.on('error', (error) => {
        this.subscriberErrorCount++
        const now = Date.now()
        // Rate limit: log first error, then once per minute during prolonged issues
        if (this.subscriberErrorCount === 1 || now - this.lastSubscriberErrorLog > 60000) {
          this.lastSubscriberErrorLog = now
          log.error('Redis subscriber error', { errorCount: this.subscriberErrorCount }, error)
        }
      })

      this.subscriber.on('connect', () => {
        // Reset error counter on successful connection
        if (this.subscriberErrorCount > 0) {
          log.info('Redis subscriber reconnected', { previousErrors: this.subscriberErrorCount })
          this.subscriberErrorCount = 0
        }
      })

      this.subscriber.on('ready', () => {
        // Re-subscribe after reconnection
        this.subscriber?.subscribe(BRAND_ALIAS_INVALIDATE_CHANNEL).catch((error) => {
          log.error('Failed to re-subscribe after reconnect', {}, error)
        })
      })

      this.subscriber.on('message', (_channel, message) => {
        try {
          const data = JSON.parse(message)
          log.info('Received cache invalidation', { aliasId: data.aliasId, action: data.action })
          // Jitter 0-5s to prevent thundering herd across harvester instances
          const jitterMs = Math.floor(Math.random() * 5000)
          setTimeout(() => {
            this.refresh().catch((error) => {
              log.error('Failed to refresh cache after invalidation', {}, error)
            })
          }, jitterMs)
        } catch (error) {
          log.error('Failed to parse invalidation message', { message }, error)
        }
      })

      await this.subscriber.connect()
      await this.subscriber.subscribe(BRAND_ALIAS_INVALIDATE_CHANNEL)
      log.info('Subscribed to brand alias invalidation channel')
    } catch (error) {
      // Non-critical: periodic refresh is the fallback
      log.error('Failed to start invalidation subscriber, falling back to periodic refresh', {}, error)
    }
  }

  /**
   * Refresh the cache from the database.
   */
  async refresh(): Promise<void> {
    if (!this.prisma) {
      log.warn('BrandAliasCache.refresh called before initialization')
      return
    }

    if (this.isRefreshing) {
      this.pendingInvalidation = true
      log.debug('Cache refresh in progress, queued re-refresh')
      return
    }

    this.isRefreshing = true
    const startTime = Date.now()

    try {
      const aliases = await this.prisma.brand_aliases.findMany({
        where: {
          status: BrandAliasStatus.ACTIVE,
          normalizationVersion: BRAND_NORMALIZATION_VERSION,
        },
        select: {
          id: true,
          aliasNorm: true,
          canonicalNorm: true,
        },
      })

      // Build new map atomically
      const newMap = new Map<string, AliasEntry>()
      for (const alias of aliases) {
        newMap.set(alias.aliasNorm, {
          id: alias.id,
          aliasNorm: alias.aliasNorm,
          canonicalNorm: alias.canonicalNorm,
        })
      }

      // Swap maps
      this.aliasMap = newMap
      this.lastRefreshAt = new Date()
      this.lastRefreshDurationMs = Date.now() - startTime

      log.info('Brand alias cache refreshed', {
        aliasCount: aliases.length,
        durationMs: this.lastRefreshDurationMs,
      })
    } catch (error) {
      this.errors++
      log.error('Failed to refresh brand alias cache', {}, error)
      // Don't clear existing cache on error - keep serving stale data
    } finally {
      this.isRefreshing = false

      // If invalidation arrived during refresh, re-refresh to pick up changes
      if (this.pendingInvalidation) {
        this.pendingInvalidation = false
        setImmediate(() => {
          this.refresh().catch((err) => {
            log.error('Queued refresh after invalidation failed', {}, err)
          })
        })
      }
    }
  }

  /**
   * Start periodic cache refresh.
   */
  private startPeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
    }

    this.refreshTimer = setInterval(() => {
      this.refresh().catch((error) => {
        log.error('Periodic cache refresh failed', {}, error)
      })
    }, CACHE_REFRESH_INTERVAL_MS)

    // Don't keep the process alive just for cache refresh
    this.refreshTimer.unref()
  }

  /**
   * Stop periodic cache refresh and close Redis subscriber.
   */
  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }

    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe(BRAND_ALIAS_INVALIDATE_CHANNEL)
        await this.subscriber.quit()
      } catch {
        // Ignore errors on shutdown
      }
      this.subscriber = null
    }
  }

  /**
   * Look up a brand alias.
   * Returns the canonical brand if an alias exists, otherwise returns the original brand.
   *
   * Per spec: Fail-open on errors - return original brand.
   *
   * @param brandNorm - Normalized brand string to look up
   * @returns Object with resolved brand and whether alias was applied
   */
  lookup(brandNorm: string): { resolvedBrand: string; aliasApplied: boolean; aliasId?: string } {
    // Feature flag check
    if (!RESOLVER_BRAND_ALIASES_ENABLED) {
      return { resolvedBrand: brandNorm, aliasApplied: false }
    }

    try {
      const entry = this.aliasMap.get(brandNorm)

      if (entry && entry.canonicalNorm !== brandNorm) {
        this.hits++
        return {
          resolvedBrand: entry.canonicalNorm,
          aliasApplied: true,
          aliasId: entry.id,
        }
      }

      this.misses++
      return { resolvedBrand: brandNorm, aliasApplied: false }
    } catch (error) {
      this.errors++
      log.error('Error during alias lookup, failing open', { brandNorm }, error)
      // Fail open - return original brand
      return { resolvedBrand: brandNorm, aliasApplied: false }
    }
  }

  /**
   * Get cache metrics for observability.
   */
  getMetrics(): CacheMetrics {
    return {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      lastRefreshAt: this.lastRefreshAt,
      lastRefreshDurationMs: this.lastRefreshDurationMs,
      aliasCount: this.aliasMap.size,
    }
  }

  /**
   * Get cache age in seconds.
   * Returns Infinity if never refreshed.
   */
  getCacheAgeSeconds(): number {
    if (!this.lastRefreshAt) {
      return Infinity
    }
    return (Date.now() - this.lastRefreshAt.getTime()) / 1000
  }

  /**
   * Check if cache is stale (age exceeds alert threshold).
   */
  isStale(): boolean {
    return this.getCacheAgeSeconds() > CACHE_AGE_ALERT_THRESHOLD_S
  }

  /**
   * Reset metrics (for testing).
   */
  resetMetrics(): void {
    this.hits = 0
    this.misses = 0
    this.errors = 0
  }
}

// Singleton instance
export const brandAliasCache = new BrandAliasCache()

/**
 * Record a brand alias application for daily tracking.
 * This is called after a successful alias application to update the daily count.
 */
export async function recordAliasApplication(
  prisma: PrismaClient,
  aliasId: string
): Promise<void> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0) // Use UTC for consistent daily counts across regions

  try {
    const result = await prisma.brand_alias_applications_daily.upsert({
      where: {
        aliasId_date: {
          aliasId,
          date: today,
        },
      },
      update: {
        count: { increment: 1 },
      },
      create: {
        aliasId,
        date: today,
        count: 1,
      },
      select: {
        count: true,
      },
    })

    if (result.count === HIGH_IMPACT_ALERT_THRESHOLD) {
      await notifyHighImpactAlias(prisma, aliasId, result.count)
    }
  } catch (error) {
    // Non-critical - log and continue
    log.warn('Failed to record alias application', { aliasId }, error)
  }
}

async function notifyHighImpactAlias(
  prisma: PrismaClient,
  aliasId: string,
  count: number
): Promise<void> {
  if (HIGH_IMPACT_ALERT_THRESHOLD <= 0) {
    return
  }

  try {
    const alias = await prisma.brand_aliases.findUnique({
      where: { id: aliasId },
      select: {
        id: true,
        aliasName: true,
        aliasNorm: true,
        canonicalName: true,
        canonicalNorm: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!alias || alias.status !== BrandAliasStatus.ACTIVE) {
      return
    }

    const activationAt = alias.updatedAt ?? alias.createdAt
    if (!activationAt) {
      return
    }

    const now = Date.now()
    if (now - activationAt.getTime() > HIGH_IMPACT_WINDOW_MS) {
      return
    }

    log.info('High impact brand alias threshold reached', {
      aliasId: alias.id,
      aliasNorm: alias.aliasNorm,
      canonicalNorm: alias.canonicalNorm,
      count,
      threshold: HIGH_IMPACT_ALERT_THRESHOLD,
      activatedAt: activationAt.toISOString(),
    })

    const adminUrl = `${SLACK_CONFIG.adminPortalUrl}/brand-aliases/${alias.id}`
    const slackResult = await sendSlackMessage({
      text: `High impact brand alias: ${alias.aliasNorm} -> ${alias.canonicalNorm} (${count})`,
      blocks: [
        slackHeader('Brand alias high impact alert'),
        slackFieldsSection({
          'Alias': alias.aliasNorm,
          'Canonical': alias.canonicalNorm,
          'Daily count': String(count),
          'Threshold': String(HIGH_IMPACT_ALERT_THRESHOLD),
          'Activated at': activationAt.toISOString(),
        }),
        slackActions(slackButton('View alias', adminUrl, 'primary')),
        slackContext(`Alias ID: ${alias.id}`),
      ],
    })

    if (!slackResult.success) {
      log.warn('Failed to send high impact alias Slack alert', {
        aliasId: alias.id,
        error: slackResult.error,
      })
    }
  } catch (error) {
    log.warn('Failed to notify high impact alias', { aliasId }, error)
  }
}

import { Worker, Job, Queue } from 'bullmq'
import { prisma, isAlertProcessingEnabled, isEmailNotificationsEnabled } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { createRedisClient } from '../config/redis'
import { logger } from '../config/logger'
import { AlertJobData } from '../config/queues'
import { Resend } from 'resend'

const log = logger.alerter
const redis = createRedisClient()

// Tier configuration (duplicated from API for harvester independence)
const TIER_ALERT_DELAY_MS = {
  FREE: 60 * 60 * 1000, // 1 hour delay
  PREMIUM: 0, // Real-time
}

/**
 * Check if a product has any visible (eligible) dealer prices.
 *
 * ADR-005: Dealer visibility must be checked at query time.
 * Alerts must not fire from ineligible dealer inventory.
 *
 * A price is visible if:
 * - It comes from a retailer with no linked dealer (direct retailer), OR
 * - It comes from a dealer with subscriptionStatus in ['ACTIVE', 'EXPIRED']
 *
 * Dealers with SUSPENDED or CANCELLED status are hidden.
 */
async function hasVisibleDealerPrice(productId: string): Promise<boolean> {
  const visiblePrice = await prisma.price.findFirst({
    where: {
      productId,
      retailer: {
        OR: [
          // Direct retailer (no dealer linked)
          { dealer: null },
          // Dealer in visible status
          {
            dealer: {
              subscriptionStatus: {
                in: ['ACTIVE', 'EXPIRED'],
              },
            },
          },
        ],
      },
    },
    select: { id: true },
  })

  return visiblePrice !== null
}

// Initialize Resend only if API key is provided
let resend: Resend | null = null
try {
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }
} catch (error) {
  log.warn('Resend API key not configured - email notifications will be disabled')
}
const FROM_EMAIL = process.env.FROM_EMAIL || 'alerts@ironscout.ai'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Queue for delayed notifications
const delayedNotificationQueue = new Queue<{
  alertId: string
  triggerReason: string
  executionId: string
}>('delayed-notification', { connection: redisConnection })

// Rate limit constants (alerts_policy_v1)
const USER_LIMIT_6H = 1
const USER_LIMIT_24H = 3
const SIX_HOURS_SECONDS = 6 * 60 * 60
const DAY_SECONDS = 24 * 60 * 60

/**
 * Reserve a user alert slot respecting per-user caps:
 * - Max 1 per 6h
 * - Max 3 per 24h
 *
 * Returns true if a slot was reserved, false otherwise.
 */
async function reserveUserAlertSlot(userId: string): Promise<boolean> {
  const key6h = `alert-rate:user:${userId}:6h`
  const key24h = `alert-rate:user:${userId}:24h`

  const script = `
    local k6h = KEYS[1]
    local k24 = KEYS[2]
    local v6h = tonumber(redis.call("GET", k6h) or "0")
    local v24 = tonumber(redis.call("GET", k24) or "0")
    if v6h >= ${USER_LIMIT_6H} or v24 >= ${USER_LIMIT_24H} then
      return 0
    end
    v6h = redis.call("INCR", k6h)
    if v6h == 1 then redis.call("EXPIRE", k6h, ${SIX_HOURS_SECONDS}) end
    v24 = redis.call("INCR", k24)
    if v24 == 1 then redis.call("EXPIRE", k24, ${DAY_SECONDS}) end
    return 1
  `

  try {
    const result = await redis.eval(script, 2, key6h, key24h)
    return result === 1
  } catch (error) {
    log.error('Rate limit check failed - failing closed', { error })
    return false // Fail closed to avoid exceeding caps
  }
}

// Alerter worker - evaluates alerts and sends notifications
export const alerterWorker = new Worker<AlertJobData>(
  'alert',
  async (job: Job<AlertJobData>) => {
    const { executionId, productId, oldPrice, newPrice, inStock } = job.data

    // Check if alert processing is enabled via admin settings
    const alertProcessingEnabled = await isAlertProcessingEnabled()
    if (!alertProcessingEnabled) {
      log.info('Alert processing disabled via admin settings, skipping', { productId })

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'ALERT_SKIPPED_DISABLED',
          message: 'Alert processing is disabled via admin settings',
          metadata: { productId },
        },
      })

      return { success: true, skipped: 'alert_processing_disabled' }
    }

    log.info('Evaluating alerts', { productId, oldPrice, newPrice, inStock })

    try {
      // ADR-005: Check dealer visibility before evaluating alerts
      // Alerts must not fire from ineligible dealer inventory
      const hasVisiblePrice = await hasVisibleDealerPrice(productId)

      if (!hasVisiblePrice) {
        log.debug('No visible dealer prices, skipping alerts', { productId })

        await prisma.executionLog.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'ALERT_SKIPPED_NO_VISIBLE_DEALER',
            message: `Skipped alert evaluation - no visible dealer prices for product ${productId}`,
            metadata: { productId, oldPrice, newPrice, inStock },
          },
        })

        return { success: true, triggeredCount: 0, delayedCount: 0, skipped: 'no_visible_dealer' }
      }

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'ALERT_EVALUATE',
          message: `Evaluating alerts for product ${productId}`,
          metadata: { productId, oldPrice, newPrice, inStock },
        },
      })

      // Find all enabled alerts for this product with user tier info and watchlist preferences
      // ADR-011: Alert is a rule marker; all preferences/state live on WatchlistItem
      const alerts = await prisma.alert.findMany({
        where: {
          productId,
          isEnabled: true,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              tier: true, // Include tier for delay calculation
            }
          },
          product: true,
          watchlistItem: true, // ADR-011: preferences and cooldown state
        },
      })

      let triggeredCount = 0
      let delayedCount = 0

      for (const alert of alerts) {
        const watchlistItem = alert.watchlistItem
        if (!watchlistItem) {
          log.debug('Alert has no watchlistItem, skipping', { alertId: alert.id })
          continue
        }

        // ADR-011: Check if notifications are enabled on the watchlist item
        if (!watchlistItem.notificationsEnabled) {
          log.debug('Notifications disabled for watchlist item, skipping', { watchlistItemId: watchlistItem.id })
          continue
        }

        let shouldTrigger = false
        let triggerReason = ''
        const now = new Date()

        switch (alert.ruleType) {
          case 'PRICE_DROP':
            if (!watchlistItem.priceDropEnabled) {
              continue // Price drop notifications disabled for this item
            }
            if (oldPrice && newPrice && newPrice < oldPrice) {
              const dropAmount = oldPrice - newPrice
              const dropPercent = (dropAmount / oldPrice) * 100
              const minDropPercent = watchlistItem.minDropPercent || 5
              const minDropAmount = parseFloat(watchlistItem.minDropAmount?.toString() || '5')

              // ADR-011: Check thresholds from WatchlistItem
              if (dropPercent >= minDropPercent || dropAmount >= minDropAmount) {
                // Check cooldown from WatchlistItem
                if (watchlistItem.lastPriceNotifiedAt) {
                  const cooldownHours = 24 // Default cooldown for price drops
                  const cooldownThreshold = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000)
                  if (watchlistItem.lastPriceNotifiedAt > cooldownThreshold) {
                    log.debug('Price drop alert in cooldown period, skipping', { alertId: alert.id })
                    continue
                  }
                }
                shouldTrigger = true
                triggerReason = `Price dropped from $${oldPrice} to $${newPrice} (${dropPercent.toFixed(1)}% / $${dropAmount.toFixed(2)} drop)`
              }
            }
            break

          case 'BACK_IN_STOCK':
            if (!watchlistItem.backInStockEnabled) {
              continue // Back in stock notifications disabled for this item
            }
            if (inStock === true) {
              // Check cooldown from WatchlistItem
              const cooldownHours = watchlistItem.stockAlertCooldownHours || 24
              if (watchlistItem.lastStockNotifiedAt) {
                const cooldownThreshold = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000)
                if (watchlistItem.lastStockNotifiedAt > cooldownThreshold) {
                  log.debug('Back in stock alert in cooldown period, skipping', { alertId: alert.id })
                  continue
                }
              }
              shouldTrigger = true
              triggerReason = 'Product is back in stock'
            }
            break
        }

        if (shouldTrigger) {
          // Enforce per-user caps (1 per 6h, 3 per day)
          const canSend = await reserveUserAlertSlot(alert.userId)
          if (!canSend) {
            log.info('Alert suppressed due to per-user caps', { userId: alert.userId, alertId: alert.id })

            await prisma.executionLog.create({
              data: {
                executionId,
                level: 'INFO',
                event: 'ALERT_SUPPRESSED_RATE_LIMIT',
                message: `Suppressed alert for user ${alert.userId} (caps reached)`,
                metadata: {
                  alertId: alert.id,
                  userId: alert.userId,
                  productId: alert.productId,
                  ruleType: alert.ruleType,
                },
              },
            })

            continue
          }

          // Get user tier and calculate delay
          const userTier = (alert.user.tier || 'FREE') as keyof typeof TIER_ALERT_DELAY_MS
          const delayMs = TIER_ALERT_DELAY_MS[userTier] || TIER_ALERT_DELAY_MS.FREE

          if (delayMs > 0) {
            // Queue delayed notification for FREE users
            await delayedNotificationQueue.add(
              'send-notification',
              {
                alertId: alert.id,
                triggerReason,
                executionId,
              },
              {
                delay: delayMs,
                jobId: `alert-${alert.id}-${Date.now()}`, // Unique job ID
              }
            )

            log.info('Queued delayed notification', { email: alert.user.email, delayMinutes: delayMs / 60000, userTier })

            await prisma.executionLog.create({
              data: {
                executionId,
                level: 'INFO',
                event: 'ALERT_DELAYED',
                message: `Alert queued with ${delayMs / 60000} minute delay for ${alert.user.email} (${userTier} tier)`,
                metadata: {
                  alertId: alert.id,
                  userId: alert.userId,
                  userTier,
                  delayMinutes: delayMs / 60000,
                  reason: triggerReason,
                },
              },
            })

            delayedCount++
          } else {
            // Send immediately for PREMIUM users
            await sendNotification(alert, triggerReason)

            await prisma.executionLog.create({
              data: {
                executionId,
                level: 'INFO',
                event: 'ALERT_NOTIFY',
                message: `Alert triggered immediately for PREMIUM user ${alert.user.email}: ${triggerReason}`,
                metadata: {
                  alertId: alert.id,
                  userId: alert.userId,
                  productId: alert.productId,
                  userTier,
                  reason: triggerReason,
                },
              },
            })

            triggeredCount++
          }

          // ADR-011: Update lastNotified timestamp on WatchlistItem, not Alert
          const updateData: Record<string, Date> = {}
          if (alert.ruleType === 'PRICE_DROP') {
            updateData.lastPriceNotifiedAt = now
          } else if (alert.ruleType === 'BACK_IN_STOCK') {
            updateData.lastStockNotifiedAt = now
          }

          await prisma.watchlistItem.update({
            where: { id: watchlistItem.id },
            data: updateData,
          })
        }
      }

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'ALERT_EVALUATE_OK',
          message: `Evaluated alerts: ${triggeredCount} sent immediately, ${delayedCount} delayed`,
          metadata: { triggeredCount, delayedCount },
        },
      })

      return { success: true, triggeredCount, delayedCount }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'ALERT_EVALUATE_FAIL',
          message: `Alert evaluation failed: ${errorMessage}`,
          metadata: { productId },
        },
      })

      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
)

// Worker for processing delayed notifications
export const delayedNotificationWorker = new Worker<{
  alertId: string
  triggerReason: string
  executionId: string
}>(
  'delayed-notification',
  async (job) => {
    const { alertId, triggerReason, executionId } = job.data

    log.info('Processing delayed notification', { alertId })

    try {
      // Fetch the alert with user, product, and watchlist info
      const alert = await prisma.alert.findUnique({
        where: { id: alertId },
        include: {
          user: true,
          product: true,
          watchlistItem: true,
        },
      })

      if (!alert) {
        log.warn('Alert not found, skipping', { alertId })
        return { success: false, reason: 'Alert not found' }
      }

      // ADR-011: Check if alert is still enabled
      if (!alert.isEnabled) {
        log.debug('Alert no longer enabled, skipping', { alertId })
        return { success: false, reason: 'Alert no longer enabled' }
      }

      // ADR-011: Check if notifications are still enabled on watchlist item
      if (alert.watchlistItem && !alert.watchlistItem.notificationsEnabled) {
        log.debug('Notifications disabled for watchlist item, skipping', { alertId })
        return { success: false, reason: 'Notifications disabled' }
      }

      // Send the notification
      await sendNotification(alert, triggerReason)

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'ALERT_DELAYED_SENT',
          message: `Delayed alert notification sent to ${alert.user.email}`,
          metadata: {
            alertId: alert.id,
            userId: alert.userId,
            productId: alert.productId,
            reason: triggerReason,
          },
        },
      })

      return { success: true }
    } catch (error) {
      const err = error as Error
      log.error('Failed to process delayed notification', { alertId, error: err.message })
      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
)

// Send notification to user
// ADR-011: Uses ruleType instead of alertType
async function sendNotification(alert: any, reason: string) {
  // Check if email notifications are enabled via admin settings
  const emailEnabled = await isEmailNotificationsEnabled()
  if (!emailEnabled) {
    log.info('Email notifications disabled via admin settings, skipping', {
      alertId: alert.id,
      email: alert.user.email,
    })
    return
  }

  log.info('Sending notification', {
    email: alert.user.email,
    productName: alert.product.name,
    ruleType: alert.ruleType,
    userTier: alert.user.tier,
    reason,
  })

  try {
    // Get the latest price for the product from a visible dealer
    // ADR-005: Only show prices from eligible dealers
    const latestPrice = await prisma.price.findFirst({
      where: {
        productId: alert.productId,
        retailer: {
          OR: [
            { dealer: null },
            { dealer: { subscriptionStatus: { in: ['ACTIVE', 'EXPIRED'] } } },
          ],
        },
      },
      include: { retailer: true },
      orderBy: { createdAt: 'desc' }
    })

    if (!latestPrice) {
      log.warn('No price found for product', { productId: alert.productId })
      return
    }

    const currentPrice = parseFloat(latestPrice.price.toString())
    const productUrl = `${FRONTEND_URL}/products/${alert.productId}`

    if (alert.ruleType === 'PRICE_DROP') {
      const html = generatePriceDropEmailHTML({
        userName: alert.user.name || 'there',
        productName: alert.product.name,
        productUrl,
        productImageUrl: alert.product.imageUrl,
        currentPrice,
        retailerName: latestPrice.retailer.name,
        retailerUrl: latestPrice.url,
        userTier: alert.user.tier,
      })

      if (resend) {
        await resend.emails.send({
          from: `IronScout.ai Alerts <${FROM_EMAIL}>`,
          to: [alert.user.email],
          subject: `🎉 Price Drop Alert: ${alert.product.name}`,
          html
        })
        log.info('Price drop email sent', { email: alert.user.email })
      } else {
        log.debug('Email sending disabled (no RESEND_API_KEY)', { email: alert.user.email, type: 'price_drop' })
      }
    } else if (alert.ruleType === 'BACK_IN_STOCK') {
      const html = generateBackInStockEmailHTML({
        userName: alert.user.name || 'there',
        productName: alert.product.name,
        productUrl,
        productImageUrl: alert.product.imageUrl,
        currentPrice,
        retailerName: latestPrice.retailer.name,
        retailerUrl: latestPrice.url,
        userTier: alert.user.tier,
      })

      if (resend) {
        await resend.emails.send({
          from: `IronScout.ai Alerts <${FROM_EMAIL}>`,
          to: [alert.user.email],
          subject: `✨ Back in Stock: ${alert.product.name}`,
          html
        })
        log.info('Back in stock email sent', { email: alert.user.email })
      } else {
        log.debug('Email sending disabled (no RESEND_API_KEY)', { email: alert.user.email, type: 'back_in_stock' })
      }
    }
  } catch (error) {
    const err = error as Error
    log.error('Failed to send email', { error: err.message })
    // Don't throw - we don't want email failures to stop alert processing
  }
}

function generatePriceDropEmailHTML(data: {
  userName: string
  productName: string
  productUrl: string
  productImageUrl?: string
  currentPrice: number
  retailerName: string
  retailerUrl: string
  userTier: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Price Update</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: #1f2937; padding: 24px 32px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Price update for ${data.productName}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    ${data.productImageUrl ? `
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                      <tr>
                        <td align="center">
                          <img src="${data.productImageUrl}" alt="${data.productName}" style="max-width: 280px; height: auto; border-radius: 8px; border: 1px solid #e5e5e5;" />
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 18px; font-weight: 600;">${data.productName}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #10b981;">
                          <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Current price at ${data.retailerName}</p>
                          <p style="margin: 0; color: #111827; font-size: 28px; font-weight: 700;">${data.currentPrice.toFixed(2)}</p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
                      This item is now priced at ${data.currentPrice.toFixed(2)} at ${data.retailerName}. Use the link below to view it.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 16px 0;">
                          <a href="${data.retailerUrl}" style="display: inline-block; padding: 14px 28px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">View at ${data.retailerName}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 32px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5;">
                    <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 13px; text-align: center;">This alert is based on your saved item.</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      <a href="${FRONTEND_URL}/dashboard/alerts" style="color: #4b5563; text-decoration: none;">Manage alerts</a> |
                      <a href="${FRONTEND_URL}/dashboard/settings" style="color: #4b5563; text-decoration: none;">Notification settings</a>
                    </p>
                    <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">© ${new Date().getFullYear()} IronScout.ai</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

function generateBackInStockEmailHTML(data: {
  userName: string
  productName: string
  productUrl: string
  productImageUrl?: string
  currentPrice: number
  retailerName: string
  retailerUrl: string
  userTier: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Back in Stock Notice</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: #1f2937; padding: 24px 32px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Back in stock: ${data.productName}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    ${data.productImageUrl ? `
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                      <tr>
                        <td align="center">
                          <img src="${data.productImageUrl}" alt="${data.productName}" style="max-width: 280px; height: auto; border-radius: 8px; border: 1px solid #e5e5e5;" />
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 18px; font-weight: 600;">${data.productName}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #10b981;">
                          <p style="margin: 0; color: #6b7280; font-size: 14px;">Now available at ${data.retailerName}</p>
                          <p style="margin: 8px 0 0 0; color: #111827; font-size: 18px; font-weight: 600;">${data.currentPrice.toFixed(2)}</p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
                      This saved item is back in stock. Use the link below if you want to view it.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 16px 0;">
                          <a href="${data.retailerUrl}" style="display: inline-block; padding: 14px 28px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">View at ${data.retailerName}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 32px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5;">
                    <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 13px; text-align: center;">This alert is based on your saved item.</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      <a href="${FRONTEND_URL}/dashboard/alerts" style="color: #4b5563; text-decoration: none;">Manage alerts</a> |
                      <a href="${FRONTEND_URL}/dashboard/settings" style="color: #4b5563; text-decoration: none;">Notification settings</a>
                    </p>
                    <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">© ${new Date().getFullYear()} IronScout.ai</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

alerterWorker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id })
})

alerterWorker.on('failed', (job, err) => {
  log.error('Job failed', { jobId: job?.id, error: err.message })
})

delayedNotificationWorker.on('completed', (job) => {
  log.info('Delayed notification sent', { jobId: job.id })
})

delayedNotificationWorker.on('failed', (job, err) => {
  log.error('Delayed notification failed', { jobId: job?.id, error: err.message })
})

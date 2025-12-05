import { Worker, Job, Queue } from 'bullmq'
import { prisma } from '@ironscout/db'
import { redisConnection } from '../config/redis'
import { AlertJobData } from '../config/queues'
import { Resend } from 'resend'

// Tier configuration (duplicated from API for harvester independence)
const TIER_ALERT_DELAY_MS = {
  FREE: 60 * 60 * 1000, // 1 hour delay
  PREMIUM: 0, // Real-time
}

// Initialize Resend only if API key is provided
let resend: Resend | null = null
try {
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }
} catch (error) {
  console.warn('[Alerter] Resend API key not configured - email notifications will be disabled')
}
const FROM_EMAIL = process.env.FROM_EMAIL || 'alerts@ironscout.ai'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Queue for delayed notifications
const delayedNotificationQueue = new Queue<{
  alertId: string
  triggerReason: string
  executionId: string
}>('delayed-notification', { connection: redisConnection })

// Alerter worker - evaluates alerts and sends notifications
export const alerterWorker = new Worker<AlertJobData>(
  'alert',
  async (job: Job<AlertJobData>) => {
    const { executionId, productId, oldPrice, newPrice, inStock } = job.data

    console.log(`[Alerter] Evaluating alerts for product ${productId}`)

    try {
      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'ALERT_EVALUATE',
          message: `Evaluating alerts for product ${productId}`,
          metadata: { productId, oldPrice, newPrice, inStock },
        },
      })

      // Find all active alerts for this product with user tier info
      const alerts = await prisma.alert.findMany({
        where: {
          productId,
          isActive: true,
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
        },
      })

      let triggeredCount = 0
      let delayedCount = 0

      for (const alert of alerts) {
        let shouldTrigger = false
        let triggerReason = ''

        switch (alert.alertType) {
          case 'PRICE_DROP':
            if (oldPrice && newPrice && newPrice < oldPrice) {
              // Check if price dropped below target (if specified)
              if (alert.targetPrice) {
                const target = parseFloat(alert.targetPrice.toString())
                if (newPrice <= target) {
                  shouldTrigger = true
                  triggerReason = `Price dropped to $${newPrice} (target: $${target})`
                }
              } else {
                // Any price drop
                shouldTrigger = true
                triggerReason = `Price dropped from $${oldPrice} to $${newPrice}`
              }
            }
            break

          case 'BACK_IN_STOCK':
            if (inStock === true) {
              shouldTrigger = true
              triggerReason = 'Product is back in stock'
            }
            break

          case 'NEW_PRODUCT':
            // This would be triggered differently, when a new product is first added
            // For now, skip this type in price update evaluations
            break
        }

        if (shouldTrigger) {
          // Check cooldown period - don't trigger same alert within 24 hours
          const cooldownHours = 24
          const now = new Date()
          const cooldownThreshold = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000)

          if (alert.lastTriggered && alert.lastTriggered > cooldownThreshold) {
            console.log(`[Alerter] Alert ${alert.id} in cooldown period, skipping`)
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

            console.log(`[Alerter] Queued delayed notification for FREE user ${alert.user.email} (delay: ${delayMs / 60000} minutes)`)

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

          // Update lastTriggered timestamp
          await prisma.alert.update({
            where: { id: alert.id },
            data: {
              lastTriggered: now,
              // Deactivate BACK_IN_STOCK alerts after triggering (one-time alerts)
              isActive: alert.alertType === 'BACK_IN_STOCK' ? false : true,
            },
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

    console.log(`[Alerter] Processing delayed notification for alert ${alertId}`)

    try {
      // Fetch the alert with user and product info
      const alert = await prisma.alert.findUnique({
        where: { id: alertId },
        include: {
          user: true,
          product: true,
        },
      })

      if (!alert) {
        console.log(`[Alerter] Alert ${alertId} not found, skipping`)
        return { success: false, reason: 'Alert not found' }
      }

      // Check if alert is still active (user might have disabled it)
      if (!alert.isActive) {
        console.log(`[Alerter] Alert ${alertId} is no longer active, skipping`)
        return { success: false, reason: 'Alert no longer active' }
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
      console.error(`[Alerter] Failed to process delayed notification:`, error)
      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
)

// Send notification to user
async function sendNotification(alert: any, reason: string) {
  console.log(`[Alerter] NOTIFICATION:`)
  console.log(`  To: ${alert.user.email}`)
  console.log(`  Product: ${alert.product.name}`)
  console.log(`  Reason: ${reason}`)
  console.log(`  Alert Type: ${alert.alertType}`)
  console.log(`  User Tier: ${alert.user.tier}`)

  try {
    // Get the latest price for the product
    const latestPrice = await prisma.price.findFirst({
      where: { productId: alert.productId },
      include: { retailer: true },
      orderBy: { createdAt: 'desc' }
    })

    if (!latestPrice) {
      console.log(`[Alerter] No price found for product ${alert.productId}`)
      return
    }

    const currentPrice = parseFloat(latestPrice.price.toString())
    const productUrl = `${FRONTEND_URL}/products/${alert.productId}`

    if (alert.alertType === 'PRICE_DROP') {
      const targetPrice = alert.targetPrice ? parseFloat(alert.targetPrice.toString()) : 0
      const savings = targetPrice > 0 ? targetPrice - currentPrice : 0

      const html = generatePriceDropEmailHTML({
        userName: alert.user.name || 'there',
        productName: alert.product.name,
        productUrl,
        productImageUrl: alert.product.imageUrl,
        currentPrice,
        targetPrice,
        savings,
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
        console.log(`[Alerter] Price drop email sent to ${alert.user.email}`)
      } else {
        console.log(`[Alerter] Email sending disabled (no RESEND_API_KEY) - would send price drop alert to ${alert.user.email}`)
      }
    } else if (alert.alertType === 'BACK_IN_STOCK') {
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
        console.log(`[Alerter] Back in stock email sent to ${alert.user.email}`)
      } else {
        console.log(`[Alerter] Email sending disabled (no RESEND_API_KEY) - would send back-in-stock alert to ${alert.user.email}`)
      }
    }
  } catch (error) {
    console.error(`[Alerter] Failed to send email:`, error)
    // Don't throw - we don't want email failures to stop alert processing
  }
}

function generatePriceDropEmailHTML(data: {
  userName: string
  productName: string
  productUrl: string
  productImageUrl?: string
  currentPrice: number
  targetPrice: number
  savings: number
  retailerName: string
  retailerUrl: string
  userTier: string
}): string {
  const delayNotice = data.userTier === 'FREE' 
    ? `<p style="margin: 20px 0 0 0; padding: 15px; background-color: #fef3c7; border-radius: 8px; font-size: 13px; color: #92400e;">
        💡 <strong>Free account:</strong> This alert was delayed by 1 hour. 
        <a href="${FRONTEND_URL}/pricing" style="color: #d97706; text-decoration: underline;">Upgrade to Premium</a> for real-time alerts!
       </p>`
    : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Price Drop Alert</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🎉 Price Drop Alert!</h1>
                    <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Great news, ${data.userName}!</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    ${data.productImageUrl ? `
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td align="center">
                          <img src="${data.productImageUrl}" alt="${data.productName}" style="max-width: 300px; height: auto; border-radius: 8px; border: 1px solid #e5e5e5;" />
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">${data.productName}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #10b981;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td>
                                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Current Price</p>
                                <p style="margin: 0; color: #10b981; font-size: 32px; font-weight: 700;">$${data.currentPrice.toFixed(2)}</p>
                              </td>
                              <td align="right">
                                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; text-align: right;">You Save</p>
                                <p style="margin: 0; color: #10b981; font-size: 24px; font-weight: 700; text-align: right;">$${data.savings.toFixed(2)}</p>
                                <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px; text-align: right;">Target: $${data.targetPrice.toFixed(2)}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      The price dropped to <strong>$${data.currentPrice.toFixed(2)}</strong> at <strong>${data.retailerName}</strong>, which is below your target price of $${data.targetPrice.toFixed(2)}!
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${data.retailerUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600;">Buy Now at ${data.retailerName}</a>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                      <tr>
                        <td align="center">
                          <a href="${data.productUrl}" style="color: #667eea; text-decoration: none; font-size: 14px;">View product details →</a>
                        </td>
                      </tr>
                    </table>
                    ${delayNotice}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5;">
                    <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px; text-align: center;">This alert was triggered by your IronScout.ai price tracking</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      <a href="${FRONTEND_URL}/dashboard/alerts" style="color: #667eea; text-decoration: none;">Manage your alerts</a> |
                      <a href="${FRONTEND_URL}/dashboard/settings" style="color: #667eea; text-decoration: none;">Notification settings</a>
                    </p>
                    <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">© ${new Date().getFullYear()} IronScout.ai. All rights reserved.</p>
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
  const delayNotice = data.userTier === 'FREE' 
    ? `<p style="margin: 20px 0 0 0; padding: 15px; background-color: #fef3c7; border-radius: 8px; font-size: 13px; color: #92400e;">
        💡 <strong>Free account:</strong> This alert was delayed by 1 hour. 
        <a href="${FRONTEND_URL}/pricing" style="color: #d97706; text-decoration: underline;">Upgrade to Premium</a> for real-time alerts!
       </p>`
    : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Back in Stock Alert</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">✨ Back in Stock!</h1>
                    <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Hurry, ${data.userName}!</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    ${data.productImageUrl ? `
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td align="center">
                          <img src="${data.productImageUrl}" alt="${data.productName}" style="max-width: 300px; height: auto; border-radius: 8px; border: 1px solid #e5e5e5;" />
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">${data.productName}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 20px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                          <p style="margin: 0; color: #92400e; font-size: 16px; font-weight: 600;">⚡ This item is now available!</p>
                          <p style="margin: 10px 0 0 0; color: #78350f; font-size: 14px;">Price: <strong style="font-size: 20px;">$${data.currentPrice.toFixed(2)}</strong> at ${data.retailerName}</p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Good news! The product you've been waiting for is back in stock at <strong>${data.retailerName}</strong>. Get it before it sells out again!
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${data.retailerUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600;">Shop Now at ${data.retailerName}</a>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                      <tr>
                        <td align="center">
                          <a href="${data.productUrl}" style="color: #f5576c; text-decoration: none; font-size: 14px;">View product details →</a>
                        </td>
                      </tr>
                    </table>
                    ${delayNotice}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5;">
                    <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px; text-align: center;">This alert was triggered by your IronScout.ai stock tracking</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      <a href="${FRONTEND_URL}/dashboard/alerts" style="color: #f5576c; text-decoration: none;">Manage your alerts</a> |
                      <a href="${FRONTEND_URL}/dashboard/settings" style="color: #f5576c; text-decoration: none;">Notification settings</a>
                    </p>
                    <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">© ${new Date().getFullYear()} IronScout.ai. All rights reserved.</p>
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
  console.log(`[Alerter] Job ${job.id} completed`)
})

alerterWorker.on('failed', (job, err) => {
  console.error(`[Alerter] Job ${job?.id} failed:`, err.message)
})

delayedNotificationWorker.on('completed', (job) => {
  console.log(`[Alerter] Delayed notification ${job.id} sent`)
})

delayedNotificationWorker.on('failed', (job, err) => {
  console.error(`[Alerter] Delayed notification ${job?.id} failed:`, err.message)
})

import { Resend } from 'resend'
import { loggers } from '../config/logger'

const log = loggers.email
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || 'alerts@ironscout.ai'

interface PriceDropEmailData {
  userName: string
  productName: string
  productUrl: string
  productImageUrl?: string
  currentPrice: number
  targetPrice: number
  savings: number
  retailerName: string
  retailerUrl: string
}

interface BackInStockEmailData {
  userName: string
  productName: string
  productUrl: string
  productImageUrl?: string
  currentPrice: number
  retailerName: string
  retailerUrl: string
}

interface AccountDeletionEmailData {
  userName: string
  scheduledFor: Date
  cancelUrl: string
}

export async function sendPriceDropEmail(
  to: string,
  data: PriceDropEmailData
): Promise<void> {
  const html = generatePriceDropEmailHTML(data)

  try {
    await resend.emails.send({
      from: `IronScout.ai Alerts <${FROM_EMAIL}>`,
      to: [to],
      subject: `🎉 Price Drop Alert: ${data.productName}`,
      html
    })
    log.info('Price drop email sent', { productName: data.productName })
  } catch (error) {
    log.error('Failed to send price drop email', { error: (error as Error)?.message })
    throw error
  }
}

export async function sendBackInStockEmail(
  to: string,
  data: BackInStockEmailData
): Promise<void> {
  const html = generateBackInStockEmailHTML(data)

  try {
    await resend.emails.send({
      from: `IronScout.ai Alerts <${FROM_EMAIL}>`,
      to: [to],
      subject: `✨ Back in Stock: ${data.productName}`,
      html
    })
    log.info('Back in stock email sent', { productName: data.productName })
  } catch (error) {
    log.error('Failed to send back in stock email', { error: (error as Error)?.message })
    throw error
  }
}

function generatePriceDropEmailHTML(data: PriceDropEmailData): string {
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
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                      🎉 Price Drop Alert!
                    </h1>
                    <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">
                      Great news, ${data.userName}!
                    </p>
                  </td>
                </tr>

                <!-- Content -->
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

                    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">
                      ${data.productName}
                    </h2>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #10b981;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td>
                                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                                  Current Price
                                </p>
                                <p style="margin: 0; color: #10b981; font-size: 32px; font-weight: 700;">
                                  $${data.currentPrice.toFixed(2)}
                                </p>
                              </td>
                              <td align="right">
                                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; text-align: right;">
                                  You Save
                                </p>
                                <p style="margin: 0; color: #10b981; font-size: 24px; font-weight: 700; text-align: right;">
                                  $${data.savings.toFixed(2)}
                                </p>
                                <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px; text-align: right;">
                                  Target: $${data.targetPrice.toFixed(2)}
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      The price dropped to <strong>$${data.currentPrice.toFixed(2)}</strong> at <strong>${data.retailerName}</strong>, which is below your target price of $${data.targetPrice.toFixed(2)}!
                    </p>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${data.retailerUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                            Buy Now at ${data.retailerName}
                          </a>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                      <tr>
                        <td align="center">
                          <a href="${data.productUrl}" style="color: #667eea; text-decoration: none; font-size: 14px;">
                            View product details →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5;">
                    <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px; text-align: center;">
                      This alert was triggered by your IronScout.ai price tracking
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      <a href="${process.env.FRONTEND_URL}/dashboard/alerts" style="color: #667eea; text-decoration: none;">Manage your alerts</a> |
                      <a href="${process.env.FRONTEND_URL}/dashboard/settings" style="color: #667eea; text-decoration: none;">Notification settings</a>
                    </p>
                    <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">
                      © ${new Date().getFullYear()} IronScout.ai. All rights reserved.
                    </p>
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

function generateBackInStockEmailHTML(data: BackInStockEmailData): string {
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
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                      ✨ Back in Stock!
                    </h1>
                    <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">
                      Hurry, ${data.userName}!
                    </p>
                  </td>
                </tr>

                <!-- Content -->
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

                    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">
                      ${data.productName}
                    </h2>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 20px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                          <p style="margin: 0; color: #92400e; font-size: 16px; font-weight: 600;">
                            ⚡ This item is now available!
                          </p>
                          <p style="margin: 10px 0 0 0; color: #78350f; font-size: 14px;">
                            Price: <strong style="font-size: 20px;">${data.currentPrice.toFixed(2)}</strong> at ${data.retailerName}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Good news! The product you've been waiting for is back in stock at <strong>${data.retailerName}</strong>. Get it before it sells out again!
                    </p>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${data.retailerUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 12px rgba(240, 147, 251, 0.4);">
                            Shop Now at ${data.retailerName}
                          </a>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                      <tr>
                        <td align="center">
                          <a href="${data.productUrl}" style="color: #f5576c; text-decoration: none; font-size: 14px;">
                            View product details →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5;">
                    <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px; text-align: center;">
                      This alert was triggered by your IronScout.ai stock tracking
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      <a href="${process.env.FRONTEND_URL}/dashboard/alerts" style="color: #f5576c; text-decoration: none;">Manage your alerts</a> |
                      <a href="${process.env.FRONTEND_URL}/dashboard/settings" style="color: #f5576c; text-decoration: none;">Notification settings</a>
                    </p>
                    <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">
                      © ${new Date().getFullYear()} IronScout.ai. All rights reserved.
                    </p>
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

export async function sendAccountDeletionEmail(
  to: string,
  data: AccountDeletionEmailData
): Promise<void> {
  const html = generateAccountDeletionEmailHTML(data)

  try {
    await resend.emails.send({
      from: `IronScout.ai <${FROM_EMAIL}>`,
      to: [to],
      subject: 'Account Deletion Request Received',
      html
    })
    log.info('Account deletion email sent')
  } catch (error) {
    log.error('Failed to send account deletion email', { error: (error as Error)?.message })
    throw error
  }
}

function generateAccountDeletionEmailHTML(data: AccountDeletionEmailData): string {
  const formattedDate = data.scheduledFor.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Deletion Request</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background-color: #dc2626; padding: 30px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                      Account Deletion Request
                    </h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <p style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 16px; line-height: 1.6;">
                      Hi ${data.userName},
                    </p>

                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      We received your request to delete your IronScout.ai account. Your account will be permanently deleted on:
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 20px; background-color: #fef2f2; border-radius: 8px; border-left: 4px solid #dc2626; text-align: center;">
                          <p style="margin: 0; color: #991b1b; font-size: 20px; font-weight: 600;">
                            ${formattedDate}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 18px; font-weight: 600;">
                      What happens next?
                    </h3>

                    <ul style="margin: 0 0 25px 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.8;">
                      <li>You have been signed out of all devices</li>
                      <li>Your account is inaccessible during the 14-day waiting period</li>
                      <li>After ${formattedDate}, your data will be permanently deleted</li>
                      <li>This action cannot be undone after the waiting period</li>
                    </ul>

                    <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 18px; font-weight: 600;">
                      Changed your mind?
                    </h3>

                    <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
                      If you didn't request this deletion or want to keep your account, you can cancel the deletion by signing back in within the next 14 days.
                    </p>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 10px 0 20px 0;">
                          <a href="${data.cancelUrl}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                            Cancel Deletion
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5;">
                    <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 13px; text-align: center;">
                      If you didn't request this deletion, please contact us immediately.
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      <a href="mailto:support@ironscout.ai" style="color: #667eea; text-decoration: none;">support@ironscout.ai</a>
                    </p>
                    <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">
                      © ${new Date().getFullYear()} IronScout.ai. All rights reserved.
                    </p>
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

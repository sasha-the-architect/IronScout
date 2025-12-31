/**
 * Test script for email sending functionality
 *
 * Usage:
 *   npx tsx test-email.ts
 *
 * Environment variables:
 *   RESEND_API_KEY - Required for sending emails
 *   FROM_EMAIL - Sender email address (default: alerts@ironscout.ai)
 *   LOG_FORMAT - Set to 'pretty' for colored output (default in dev)
 */

// Load environment variables first, before any other imports
import 'dotenv/config'

import { Resend } from 'resend'
import { createLogger } from '@ironscout/logger'

const log = createLogger('harvester:test-email')

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || 'alerts@ironscout.ai'

// IMPORTANT: Replace with your actual test email
const TEST_EMAIL = 'your-email@example.com'

async function sendPriceDropTestEmail() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Test Price Drop Alert</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Price Drop Alert!</h1>
                    <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Great news!</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">Test Product Name</h2>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #10b981;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td>
                                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Current Price</p>
                                <p style="margin: 0; color: #10b981; font-size: 32px; font-weight: 700;">$99.99</p>
                              </td>
                              <td align="right">
                                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; text-align: right;">You Save</p>
                                <p style="margin: 0; color: #10b981; font-size: 24px; font-weight: 700; text-align: right;">$50.00</p>
                                <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px; text-align: right;">Target: $149.99</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      This is a <strong>test email</strong> from IronScout.ai. Your alert system is working correctly!
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="http://localhost:3000" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600;">View Dashboard</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e5e5e5;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">This is a test email from IronScout.ai</p>
                    <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">© ${new Date().getFullYear()} IronScout.ai</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `

  log.info('Sending test email', { to: TEST_EMAIL, from: FROM_EMAIL })

  try {
    const result = await resend.emails.send({
      from: `IronScout.ai Alerts <${FROM_EMAIL}>`,
      to: [TEST_EMAIL],
      subject: 'Test: Price Drop Alert',
      html
    })

    log.info('Email sent successfully', { result })
  } catch (error) {
    log.error('Failed to send email', {
      troubleshooting: [
        'Check that RESEND_API_KEY is set in .env',
        'Update TEST_EMAIL constant to your email',
        'Verify domain in Resend dashboard for production',
        'For testing, use the email you signed up with on Resend',
      ],
    }, error)
  }
}

// Run the test
log.info('Testing IronScout.ai Email System')
sendPriceDropTestEmail()

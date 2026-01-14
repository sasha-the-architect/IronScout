import { test, expect } from '@playwright/test'

/**
 * Smoke Tests
 *
 * Basic E2E tests to verify the app is running and critical paths work.
 * These run on every PR and deployment.
 *
 * These tests catch:
 * - Build failures (pages won't load)
 * - Next.js runtime errors (async searchParams, etc.)
 * - Missing dependencies/exports
 * - Route configuration issues
 */

test.describe('Web App Smoke Tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/IronScout/i)
  })

  test('health check endpoint responds', async ({ request }) => {
    const response = await request.get('http://localhost:8000/health')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.status).toBe('ok')
  })

  test('search page is accessible', async ({ page }) => {
    await page.goto('/search')
    // Should show search interface (not error page)
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.locator('body')).not.toContainText('Error')
  })

  test('search page with query params renders', async ({ page }) => {
    // Tests that async searchParams works correctly (Next.js 16 breaking change)
    await page.goto('/search?q=9mm&page=1')
    await expect(page.locator('body')).not.toContainText('searchParams is a Promise')
    await expect(page.locator('body')).not.toContainText('must be unwrapped')
  })

  test('auth signin page loads', async ({ page }) => {
    await page.goto('/auth/signin')
    // Should show sign in page or redirect, not crash
    await expect(page.locator('body')).not.toContainText('Error')
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('product page with dynamic params loads', async ({ page }) => {
    // Tests dynamic route params handling
    await page.goto('/products/test-product-id')
    // May show "not found" but should not crash
    await expect(page.locator('body')).not.toContainText('Error')
    await expect(page.locator('body')).not.toContainText('500')
  })
})

test.describe('Admin App Smoke Tests', () => {
  const adminBaseUrl = 'http://localhost:3002'

  test('admin login page loads', async ({ page }) => {
    await page.goto(`${adminBaseUrl}/auth/signin`)
    // Should show login page, not crash
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page.locator('body')).not.toContainText('Error')
  })

  test('admin auth error page renders with query params', async ({ page }) => {
    // Tests async searchParams fix (Next.js 16 breaking change)
    await page.goto(`${adminBaseUrl}/auth/error?error=AccessDenied`)
    await expect(page.locator('body')).toContainText('Authentication Error')
    await expect(page.locator('body')).not.toContainText('searchParams is a Promise')
  })

  test('admin protected route redirects to login', async ({ page }) => {
    await page.goto(`${adminBaseUrl}/merchants`)
    // Should redirect to login, not crash
    const url = page.url()
    expect(url).toMatch(/auth|signin|login/i)
  })
})

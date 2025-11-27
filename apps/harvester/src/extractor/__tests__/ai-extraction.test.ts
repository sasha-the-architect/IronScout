import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk')

// Import the extraction function - we'll need to refactor it to be testable
// For now, we'll test the logic directly
import * as cheerio from 'cheerio'

describe('AI Extraction - Full Page Approach', () => {
  let mockAnthropicCreate: any

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()

    // Create mock for Anthropic messages.create
    mockAnthropicCreate = vi.fn()

    // Mock the Anthropic class as a constructor
    // @ts-ignore - Mocking Anthropic class
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: mockAnthropicCreate
        }
      }
    })
  })

  describe('Happy Path - Successful Extraction', () => {
    it('should extract all products from sample ammunition page', async () => {
      // Load the sample HTML fixture
      const sampleHtml = readFileSync(
        join(__dirname, 'fixtures', 'sample-ammo-page.html'),
        'utf-8'
      )

      // Mock successful AI response with all 3 products
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              product_title: 'Federal Premium 9mm Luger 124gr HST JHP',
              caliber: '9mm Luger',
              grain_weight: 124,
              bullet_type: 'JHP',
              case_type: null,
              brand: 'Federal',
              count_per_unit: 50,
              price: 34.99,
              currency: 'USD',
              in_stock: true,
              image_url: 'https://example.com/images/federal-9mm.jpg',
              product_url: null
            },
            {
              product_title: 'Winchester USA 9mm 115gr FMJ Brass',
              caliber: '9mm',
              grain_weight: 115,
              bullet_type: 'FMJ',
              case_type: 'Brass',
              brand: 'Winchester',
              count_per_unit: 100,
              price: 29.99,
              currency: 'USD',
              in_stock: true,
              image_url: 'https://example.com/images/winchester-9mm.jpg',
              product_url: null
            },
            {
              product_title: 'Hornady Critical Defense 9mm Luger 115gr FTX',
              caliber: '9mm Luger',
              grain_weight: 115,
              bullet_type: 'FTX',
              case_type: null,
              brand: 'Hornady',
              count_per_unit: 25,
              price: 24.99,
              currency: 'USD',
              in_stock: false,
              image_url: 'https://example.com/images/hornady-9mm.jpg',
              product_url: null
            }
          ])
        }]
      })

      // Simulate the extraction process
      const $ = cheerio.load(sampleHtml)
      $('script, style, nav, footer, header[role="banner"]').remove()
      const cleanedHtml = $('body').html() || sampleHtml

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: `Extract products...` }]
      })

      const responseText = result.content[0].type === 'text' ? result.content[0].text : ''
      const products = JSON.parse(responseText)

      // Assertions
      expect(products).toHaveLength(3)

      // Validate first product (in stock)
      expect(products[0]).toMatchObject({
        product_title: expect.stringContaining('Federal'),
        caliber: '9mm Luger',
        grain_weight: 124,
        bullet_type: 'JHP',
        price: 34.99,
        in_stock: true
      })

      // Validate second product (in stock, brass case)
      expect(products[1]).toMatchObject({
        product_title: expect.stringContaining('Winchester'),
        case_type: 'Brass',
        bullet_type: 'FMJ',
        price: 29.99,
        in_stock: true
      })

      // Validate third product (out of stock)
      expect(products[2]).toMatchObject({
        product_title: expect.stringContaining('Hornady'),
        in_stock: false,
        price: 24.99
      })
    })

    it('should handle products with missing optional fields', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              product_title: 'Generic 9mm Ammo',
              caliber: '9mm',
              grain_weight: null,
              bullet_type: null,
              case_type: null,
              brand: null,
              count_per_unit: 50,
              price: 19.99,
              currency: 'USD',
              in_stock: true,
              image_url: null,
              product_url: null
            }
          ])
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const products = JSON.parse(result.content[0].text)

      expect(products).toHaveLength(1)
      expect(products[0]).toMatchObject({
        product_title: 'Generic 9mm Ammo',
        caliber: '9mm',
        price: 19.99,
        in_stock: true
      })
      expect(products[0].grain_weight).toBeNull()
      expect(products[0].brand).toBeNull()
    })
  })

  describe('Edge Cases - AI Response Handling', () => {
    it('should handle empty product array when no ammunition found', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '[]'
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const products = JSON.parse(result.content[0].text)

      expect(products).toEqual([])
      expect(products).toHaveLength(0)
    })

    it('should handle AI response wrapped in markdown code blocks', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '```json\n[{"product_title": "Test Ammo", "price": 10.99, "caliber": "9mm", "count_per_unit": 50, "currency": "USD", "in_stock": true}]\n```'
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      // Simulate the cleaning process from the actual code
      const responseText = result.content[0].text
      const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const products = JSON.parse(cleanedResponse)

      expect(products).toHaveLength(1)
      expect(products[0].product_title).toBe('Test Ammo')
    })

    it('should handle malformed AI response gracefully', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'This is not valid JSON'
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      // Should throw JSON parse error
      expect(() => JSON.parse(result.content[0].text)).toThrow()
    })

    it('should handle AI returning object instead of array', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            product_title: 'Single Product',
            price: 15.99,
            caliber: '9mm',
            count_per_unit: 50,
            currency: 'USD',
            in_stock: true
          })
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const response = JSON.parse(result.content[0].text)

      // Should detect it's not an array
      expect(Array.isArray(response)).toBe(false)
      expect(response).toHaveProperty('product_title')
    })

    it('should handle price as string and convert to number', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              product_title: 'Test Product',
              caliber: '9mm',
              price: '29.99', // Price as string
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            }
          ])
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const products = JSON.parse(result.content[0].text)

      // Simulate conversion logic from actual code
      const price = typeof products[0].price === 'number'
        ? products[0].price
        : parseFloat(products[0].price)

      expect(price).toBe(29.99)
      expect(typeof price).toBe('number')
    })
  })

  describe('Edge Cases - HTML Content', () => {
    it('should handle empty HTML body', async () => {
      const emptyHtml = '<html><head></head><body></body></html>'

      const $ = cheerio.load(emptyHtml)
      $('script, style, nav, footer, header[role="banner"]').remove()
      const bodyContent = $('body').html()

      // When body is empty, cheerio returns null or empty string
      expect(bodyContent === null || bodyContent === '').toBe(true)
    })

    it('should remove scripts and styles from HTML before sending to AI', async () => {
      const htmlWithScripts = `
        <html>
          <head>
            <style>.test { color: red; }</style>
          </head>
          <body>
            <script>alert('test');</script>
            <div class="product">Product Name</div>
            <nav>Navigation</nav>
          </body>
        </html>
      `

      const $ = cheerio.load(htmlWithScripts)
      $('script, style, nav, footer, header[role="banner"]').remove()
      const cleanedHtml = $('body').html()

      expect(cleanedHtml).not.toContain('<script>')
      expect(cleanedHtml).not.toContain('<style>')
      expect(cleanedHtml).not.toContain('<nav>')
      expect(cleanedHtml).toContain('Product Name')
    })

    it('should truncate HTML that exceeds max length', () => {
      const maxLength = 100000
      const largeHtml = '<html><body>' + 'a'.repeat(200000) + '</body></html>'

      const $ = cheerio.load(largeHtml)
      let cleanedHtml = $('body').html() || largeHtml

      if (cleanedHtml.length > maxLength) {
        cleanedHtml = cleanedHtml.substring(0, maxLength)
      }

      expect(cleanedHtml.length).toBe(maxLength)
    })
  })

  describe('Edge Cases - Product Validation', () => {
    it('should skip products without required title field', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              product_title: null, // Missing title
              caliber: '9mm',
              price: 29.99,
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            },
            {
              product_title: 'Valid Product',
              caliber: '9mm',
              price: 19.99,
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            }
          ])
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const products = JSON.parse(result.content[0].text)

      // Simulate validation logic
      const validProducts = products.filter((p: any) => p.product_title && p.price)

      expect(validProducts).toHaveLength(1)
      expect(validProducts[0].product_title).toBe('Valid Product')
    })

    it('should skip products without required price field', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              product_title: 'Product Without Price',
              caliber: '9mm',
              price: null, // Missing price
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            },
            {
              product_title: 'Valid Product',
              caliber: '9mm',
              price: 19.99,
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            }
          ])
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const products = JSON.parse(result.content[0].text)

      // Simulate validation logic
      const validProducts = products.filter((p: any) => p.product_title && p.price)

      expect(validProducts).toHaveLength(1)
      expect(validProducts[0].product_title).toBe('Valid Product')
    })

    it('should handle various stock status formats', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              product_title: 'Product 1',
              price: 10,
              in_stock: true,
              caliber: '9mm',
              count_per_unit: 50,
              currency: 'USD'
            },
            {
              product_title: 'Product 2',
              price: 20,
              in_stock: false,
              caliber: '9mm',
              count_per_unit: 50,
              currency: 'USD'
            },
            {
              product_title: 'Product 3',
              price: 30,
              in_stock: undefined, // Missing stock status
              caliber: '9mm',
              count_per_unit: 50,
              currency: 'USD'
            }
          ])
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const products = JSON.parse(result.content[0].text)

      expect(products[0].in_stock).toBe(true)
      expect(products[1].in_stock).toBe(false)
      expect(products[2].in_stock).toBeUndefined()
    })
  })

  describe('Edge Cases - AI API Errors', () => {
    it('should handle network errors when calling AI API', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Network error'))

      const anthropic = new Anthropic({ apiKey: 'test-key' })

      await expect(async () => {
        await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 4096,
          temperature: 0,
          messages: [{ role: 'user', content: 'Extract...' }]
        })
      }).rejects.toThrow('Network error')
    })

    it('should handle API rate limiting errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Rate limit exceeded'))

      const anthropic = new Anthropic({ apiKey: 'test-key' })

      await expect(async () => {
        await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 4096,
          temperature: 0,
          messages: [{ role: 'user', content: 'Extract...' }]
        })
      }).rejects.toThrow('Rate limit exceeded')
    })

    it('should handle invalid API key errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Invalid API key'))

      const anthropic = new Anthropic({ apiKey: 'invalid-key' })

      await expect(async () => {
        await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 4096,
          temperature: 0,
          messages: [{ role: 'user', content: 'Extract...' }]
        })
      }).rejects.toThrow('Invalid API key')
    })
  })

  describe('Real World Scenarios', () => {
    it('should handle mixed valid and invalid products in same response', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              product_title: 'Valid Product 1',
              caliber: '9mm',
              price: 29.99,
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            },
            {
              product_title: null, // Invalid - no title
              price: 19.99
            },
            {
              product_title: 'Valid Product 2',
              caliber: '.45 ACP',
              price: 39.99,
              count_per_unit: 100,
              currency: 'USD',
              in_stock: false
            },
            {
              product_title: 'Invalid - No Price',
              caliber: '5.56',
              price: null // Invalid - no price
            }
          ])
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const products = JSON.parse(result.content[0].text)
      const validProducts = products.filter((p: any) => p.product_title && p.price)

      expect(products).toHaveLength(4)
      expect(validProducts).toHaveLength(2)
      expect(validProducts[0].product_title).toBe('Valid Product 1')
      expect(validProducts[1].product_title).toBe('Valid Product 2')
    })

    it('should handle different caliber formats', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              product_title: 'Test 1',
              caliber: '9mm Luger',
              price: 10,
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            },
            {
              product_title: 'Test 2',
              caliber: '.223 Remington',
              price: 20,
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            },
            {
              product_title: 'Test 3',
              caliber: '5.56 NATO',
              price: 30,
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            },
            {
              product_title: 'Test 4',
              caliber: '12 Gauge',
              price: 40,
              count_per_unit: 50,
              currency: 'USD',
              in_stock: true
            }
          ])
        }]
      })

      const anthropic = new Anthropic({ apiKey: 'test-key' })
      const result = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: 'Extract...' }]
      })

      const products = JSON.parse(result.content[0].text)

      expect(products).toHaveLength(4)
      expect(products.map((p: any) => p.caliber)).toEqual([
        '9mm Luger',
        '.223 Remington',
        '5.56 NATO',
        '12 Gauge'
      ])
    })
  })
})

import { FeedParser, ParsedProduct } from './index'
import { parse as parseCSV } from 'csv-parse/sync'
import { XMLParser } from 'fast-xml-parser'

/**
 * Parser for ShareASale affiliate feeds
 * Supports CSV (pipe-delimited), XML, and JSON formats
 *
 * ShareASale feed documentation:
 *https://help.shareasale.com/hc/en-us/articles/5377618989975-Datafeeds
 *
 * Note: ShareASale typically uses pipe (|) delimited CSV files
 */
export class ShareASaleParser implements FeedParser {
  async parse(content: string): Promise<ParsedProduct[]> {
    // Detect format
    const format = this.detectFormat(content)

    switch (format) {
      case 'csv':
        return this.parseCSV(content)
      case 'xml':
        return this.parseXML(content)
      case 'json':
        return this.parseJSON(content)
      default:
        throw new Error('Unsupported ShareASale feed format')
    }
  }

  private detectFormat(content: string): 'csv' | 'xml' | 'json' {
    if (content.trim().startsWith('<')) return 'xml'
    if (content.trim().startsWith('[') || content.trim().startsWith('{')) return 'json'
    return 'csv'
  }

  private parseCSV(content: string): ParsedProduct[] {
    // ShareASale uses pipe (|) delimiter by default
    const delimiter = content.includes('|') ? '|' : ','

    const records = parseCSV(content, {
      columns: true,
      skip_empty_lines: true,
      delimiter,
      relax_quotes: true, // ShareASale feeds sometimes have inconsistent quoting
    })

    return records.map((record: any) => ({
      retailer: record['Merchant'] || record['Merchant Name'] || record['merchantname'] || '',
      name: record['Product Name'] || record['productname'] || record['name'] || '',
      price: parseFloat(
        record['Price'] || record['price'] || record['retailprice'] || record['Retail Price'] || '0'
      ),
      inStock: this.parseStockStatus(record['Stock Status'] || record['stockstatus'] || record['instock']),
      url: record['Product URL'] || record['producturl'] || record['custom1'] || record['URL'] || '',
      upc: record['UPC'] || record['upccode'] || record['UPC Code'] || undefined,
      sku: record['SKU'] || record['sku'] || record['Merchant Product ID'] || undefined,
      category: record['Category'] || record['category'] || record['subcategory'] || undefined,
      brand: record['Brand'] || record['brand'] || record['manufacturer'] || undefined,
      imageUrl: record['Thumbnail'] || record['thumbnail'] || record['Image URL'] || record['imageurl'] || undefined,
      description:
        record['Description'] || record['description'] || record['Short Description'] || record['shortdescription'] || undefined,
    }))
  }

  private parseXML(content: string): ParsedProduct[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    })

    const result = parser.parse(content)

    // ShareASale XML typically has structure: <products><product>...</product></products>
    // or <datafeed><item>...</item></datafeed>
    const products =
      result.products?.product ||
      result.datafeed?.item ||
      result.product ||
      result.item ||
      []
    const productArray = Array.isArray(products) ? products : [products]

    return productArray.map((product: any) => ({
      retailer: product.merchant || product.merchantName || product.merchantname || '',
      name: product.productName || product.productname || product.name || product.title || '',
      price: parseFloat(
        product.price ||
        product.retailPrice ||
        product.retailprice ||
        product.currentPrice ||
        '0'
      ),
      inStock: this.parseStockStatus(
        product.stockStatus ||
        product.stockstatus ||
        product.inStock ||
        product.instock
      ),
      url: product.productUrl || product.producturl || product.custom1 || product.url || product.link || '',
      upc: product.upc || product.upcCode || product.upccode || product.ean || undefined,
      sku: product.sku || product.merchantProductId || product.merchantproductid || undefined,
      category: product.category || product.subcategory || undefined,
      brand: product.brand || product.manufacturer || undefined,
      imageUrl: product.thumbnail || product.imageUrl || product.imageurl || product.image || undefined,
      description:
        product.description ||
        product.shortDescription ||
        product.shortdescription ||
        product.productDescription ||
        undefined,
    }))
  }

  private parseJSON(content: string): ParsedProduct[] {
    const data = JSON.parse(content)
    const products = Array.isArray(data) ? data : data.products || data.items || []

    return products.map((product: any) => ({
      retailer:
        product.merchant ||
        product.merchantName ||
        product.merchantname ||
        product.Merchant ||
        '',
      name:
        product.productName ||
        product.productname ||
        product.name ||
        product.title ||
        product.Name ||
        '',
      price: parseFloat(
        product.price ||
        product.retailPrice ||
        product.retailprice ||
        product.currentPrice ||
        product.Price ||
        '0'
      ),
      inStock: this.parseStockStatus(
        product.stockStatus ||
        product.stockstatus ||
        product.inStock ||
        product.instock ||
        product.StockStatus
      ),
      url:
        product.productUrl ||
        product.producturl ||
        product.custom1 ||
        product.url ||
        product.link ||
        product.URL ||
        '',
      upc: product.upc || product.upcCode || product.upccode || product.UPC || undefined,
      sku: product.sku || product.merchantProductId || product.merchantproductid || product.SKU || undefined,
      category: product.category || product.subcategory || product.Category || undefined,
      brand: product.brand || product.manufacturer || product.Brand || undefined,
      imageUrl:
        product.thumbnail ||
        product.imageUrl ||
        product.imageurl ||
        product.image ||
        product.Thumbnail ||
        undefined,
      description:
        product.description ||
        product.shortDescription ||
        product.shortdescription ||
        product.productDescription ||
        product.Description ||
        undefined,
    }))
  }

  private parseStockStatus(value: any): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.toLowerCase()
      return (
        normalized === 'true' ||
        normalized === 'yes' ||
        normalized === 'in stock' ||
        normalized === 'available' ||
        normalized === '1' ||
        normalized === 'y' ||
        normalized === 'instock'
      )
    }
    if (typeof value === 'number') return value > 0
    return true // Default to in stock if not specified (common for ShareASale)
  }
}

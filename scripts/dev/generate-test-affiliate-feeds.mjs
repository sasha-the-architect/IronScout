#!/usr/bin/env node
/**
 * Generate realistic affiliate feed fixtures with known outcomes.
 *
 * This script overwrites CSVs in context/examples/test_affiliate_feeds and
 * writes expectations to expectations.json.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const FEED_DIR = resolve(ROOT, 'context/examples/test_affiliate_feeds')

const FILES = readdirSync(FEED_DIR).filter((name) => name.endsWith('.csv'))
const DEFAULT_ROW_COUNTS = {
  'impact_large_messy.csv': 20000,
}

const BRANDS = [
  'Federal',
  'Winchester',
  'Hornady',
  'Remington',
  'Sig Sauer',
  'Speer',
  'PMC',
  'Fiocchi',
  'CCI',
]
const HANDGUN_CALIBERS = ['9mm', '9mm', '9mm', '.45 ACP', '.45 ACP', '.40 S&W', '.380 ACP']
const RIFLE_CALIBERS = ['.223 Remington', '.223 Remington', '5.56 NATO', '5.56 NATO', '.308 Winchester']
const SHOTGUN_CALIBERS = ['12 Gauge', '12 Gauge', '20 Gauge']
const HANDGUN_GRAINS = [90, 115, 124, 147, 165, 180, 230]
const RIFLE_GRAINS = [55, 62, 69, 77, 150, 168]
const SHOTGUN_SHOT_SIZES = ['#7.5', '#8', '#4 Buck', '00 Buck']
const SHOTGUN_LOADS = ['Buckshot', 'Birdshot', 'Slug']
const HANDGUN_ROUNDS = [20, 50, 100, 200]
const RIFLE_ROUNDS = [20, 50, 100, 200]
const SHOTGUN_ROUNDS = [5, 10, 25]
const HANDGUN_STYLES = ['FMJ', 'JHP']
const RIFLE_STYLES = ['FMJ', 'BTHP', 'M193', 'M855']
const STOCK_STATUSES = ['In Stock', 'In Stock', 'In Stock', 'Limited', 'Out of Stock']

function mulberry32(seed) {
  let t = seed >>> 0
  return function () {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)]
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function readHeader(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const headerLine = content.split(/\r?\n/)[0]
  return headerLine.replace(/^"|"$/g, '').split('","').map((h) => h.trim())
}

function countRows(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
  return Math.max(lines.length - 1, 0)
}

function buildUrl(domain, name, id) {
  const slug = slugify(name)
  return `https://${domain}/item/${slug}-${id}`
}

function pickType(rng) {
  const roll = rng()
  if (roll < 0.45) return 'HANDGUN'
  if (roll < 0.85) return 'RIFLE'
  return 'SHOTGUN'
}

function makeBaseProduct(rng, id, domain) {
  const brand = pick(rng, BRANDS)
  const type = pickType(rng)
  let caliber = ''
  let grain = null
  let rounds = 0
  let style = ''
  let shotSize = null
  let loadType = null

  if (type === 'SHOTGUN') {
    caliber = pick(rng, SHOTGUN_CALIBERS)
    rounds = pick(rng, SHOTGUN_ROUNDS)
    loadType = pick(rng, SHOTGUN_LOADS)
    shotSize = loadType === 'Slug' ? null : pick(rng, SHOTGUN_SHOT_SIZES)
    style = loadType
  } else if (type === 'RIFLE') {
    caliber = pick(rng, RIFLE_CALIBERS)
    grain = pick(rng, RIFLE_GRAINS)
    rounds = pick(rng, RIFLE_ROUNDS)
    style = pick(rng, RIFLE_STYLES)
  } else {
    caliber = pick(rng, HANDGUN_CALIBERS)
    grain = pick(rng, HANDGUN_GRAINS)
    rounds = pick(rng, HANDGUN_ROUNDS)
    style = pick(rng, HANDGUN_STYLES)
  }

  const nameParts = [brand, caliber]
  if (grain) nameParts.push(`${grain}gr`)
  if (shotSize) nameParts.push(shotSize)
  if (style) nameParts.push(style)
  const name = `${nameParts.join(' ')} - ${rounds} Round Box`
  const url = buildUrl(domain, name, id)
  const grainFactor = grain ? (grain / 230) * 10 : 0
  const basePrice = 10 + (rounds / 20) * 6 + grainFactor
  const price = Math.max(8, basePrice + rng() * 12).toFixed(2)
  const originalPrice = (Number(price) + 2 + rng() * 12).toFixed(2)

  return {
    brand,
    type,
    caliber,
    grain,
    rounds,
    style,
    shotSize,
    loadType,
    name,
    url,
    price,
    originalPrice,
    currency: 'USD',
    inStock: pick(rng, STOCK_STATUSES),
  }
}

function normalizeHeader(header) {
  return header.trim().toLowerCase()
}

function assignValue(row, header, value) {
  if (value === undefined) return
  row[header] = value
}

function buildRow(headers, product, identity, opts) {
  const row = Object.fromEntries(headers.map((h) => [h, '']))
  const jsonAttrs = JSON.stringify({
    caliber: product.caliber,
    grain: product.grain ?? undefined,
    rounds: product.rounds,
    loadType: product.loadType ?? undefined,
    shotSize: product.shotSize ?? undefined,
  })
  const descriptionParts = [`${product.brand} ${product.caliber}`]
  if (product.grain) descriptionParts.push(`${product.grain}gr`)
  if (product.shotSize) descriptionParts.push(product.shotSize)
  if (product.style) descriptionParts.push(product.style)
  const description = `${descriptionParts.join(' ')}. ${product.rounds} rounds per box.`

  for (const header of headers) {
    const key = normalizeHeader(header)

    if (key === 'name' || key === 'product name' || key === 'productname' || key === 'title') {
      assignValue(row, header, product.name)
    } else if (key === 'description') {
      assignValue(row, header, description)
    } else if (key === 'url' || key === 'product url' || key === 'producturl' || key === 'link') {
      assignValue(row, header, product.url)
    } else if (key === 'imageurl' || key === 'image url' || key === 'image') {
      assignValue(row, header, `${product.url}/image.jpg`)
    } else if (key === 'currentprice' || key === 'current price' || key === 'saleprice' || key === 'sale price') {
      assignValue(row, header, product.price)
    } else if (key === 'price' || key === 'listprice' || key === 'list price') {
      assignValue(row, header, product.originalPrice)
    } else if (key === 'originalprice' || key === 'original price' || key === 'msrp') {
      assignValue(row, header, product.originalPrice)
    } else if (key === 'currency' || key === 'currencycode') {
      assignValue(row, header, product.currency)
    } else if (key === 'stockavailability' || key === 'stock availability' || key === 'availability') {
      assignValue(row, header, product.inStock)
    } else if (key === 'instock' || key === 'in stock') {
      assignValue(row, header, product.inStock === 'In Stock' ? 'true' : 'false')
    } else if (key === 'manufacturer' || key === 'brand') {
      assignValue(row, header, product.brand)
    } else if (key === 'category' || key === 'product type') {
      assignValue(row, header, product.caliber.includes('Gauge') ? 'Shotgun Shells' : 'Ammunition')
    } else if (key === 'subcategory') {
      assignValue(row, header, product.style)
    } else if (key === 'attributes') {
      assignValue(row, header, jsonAttrs)
    } else if (key === 'catalogitemid' || key === 'itemid' || key === 'item_id' || key === 'catalogitemid') {
      assignValue(row, header, identity.impactItemId)
    } else if (key === 'sku' || key === 'merchantsku' || key === 'productsku' || key === 'unique merchantsku' || key === 'uniquemerchantsku') {
      assignValue(row, header, identity.sku)
    } else if (key === 'gtin' || key === 'upc' || key === 'ean' || key === 'isbn') {
      assignValue(row, header, identity.gtin)
    }
  }

  if (opts.missingName) {
    for (const header of headers) {
      if (normalizeHeader(header) === 'name' || normalizeHeader(header) === 'product name' || normalizeHeader(header) === 'productname' || normalizeHeader(header) === 'title') {
        row[header] = ''
      }
    }
  }

  if (opts.missingUrl) {
    for (const header of headers) {
      if (normalizeHeader(header) === 'url' || normalizeHeader(header) === 'product url' || normalizeHeader(header) === 'producturl' || normalizeHeader(header) === 'link') {
        row[header] = ''
      }
    }
  }

  if (opts.invalidUrl) {
    for (const header of headers) {
      if (normalizeHeader(header) === 'url' || normalizeHeader(header) === 'product url' || normalizeHeader(header) === 'producturl' || normalizeHeader(header) === 'link') {
        row[header] = 'not-a-url'
      }
    }
  }

  if (opts.invalidPrice) {
    for (const header of headers) {
      if (
        normalizeHeader(header) === 'currentprice' ||
        normalizeHeader(header) === 'current price' ||
        normalizeHeader(header) === 'saleprice' ||
        normalizeHeader(header) === 'sale price' ||
        normalizeHeader(header) === 'price'
      ) {
        row[header] = '0'
      }
    }
  }

  if (opts.missingCaliber) {
    for (const header of headers) {
      if (normalizeHeader(header) === 'attributes') {
        row[header] = JSON.stringify({ grain: product.grain, rounds: product.rounds })
      }
      if (normalizeHeader(header) === 'name' || normalizeHeader(header) === 'product name' || normalizeHeader(header) === 'productname' || normalizeHeader(header) === 'title') {
        row[header] = `${product.brand} ${product.style} - ${product.rounds} Round Box`
      }
      if (normalizeHeader(header) === 'url' || normalizeHeader(header) === 'product url' || normalizeHeader(header) === 'producturl' || normalizeHeader(header) === 'link') {
        row[header] = buildUrl(opts.domain, `${product.brand}-${product.style}-${product.rounds}rd`, opts.id)
      }
      if (normalizeHeader(header) === 'description') {
        row[header] = `${product.brand} ${product.style}. ${product.rounds} rounds per box.`
      }
    }
  }

  if (opts.missingUpc) {
    for (const header of headers) {
      if (['gtin', 'upc', 'ean', 'isbn'].includes(normalizeHeader(header))) {
        row[header] = ''
      }
    }
  }

  if (opts.urlHashFallback) {
    for (const header of headers) {
      if (['catalogitemid', 'itemid', 'item_id', 'catalogitemid'].includes(normalizeHeader(header))) {
        row[header] = ''
      }
      if (['sku', 'merchantsku', 'productsku', 'unique merchantsku', 'uniquemerchantsku'].includes(normalizeHeader(header))) {
        row[header] = ''
      }
    }
  }

  return row
}

function buildConfig(file, total) {
  const isEdge = file.includes('edge_cases')
  const isQuarantine = file.includes('quarantine')
  const isLarge = total > 10000
  const isMedium = total > 1000 && total <= 10000
  const isTiny = total <= 30

  if (isEdge) {
    if (isTiny) {
      return { fail: 2, quarantine: 2, review: 1, urlHash: 1, dup: 1 }
    }
    return {
      fail: Math.min(50, Math.max(10, Math.floor(total * 0.05))),
      quarantine: Math.min(80, Math.max(20, Math.floor(total * 0.08))),
      review: Math.min(80, Math.max(20, Math.floor(total * 0.08))),
      urlHash: Math.min(60, Math.max(15, Math.floor(total * 0.06))),
      dup: Math.min(40, Math.max(10, Math.floor(total * 0.04))),
    }
  }

  if (isQuarantine) {
    if (isTiny) {
      return { fail: 1, quarantine: 4, review: 1, urlHash: 1, dup: 0 }
    }
    return {
      fail: Math.floor(total * 0.01),
      quarantine: Math.floor(total * 0.25),
      review: Math.floor(total * 0.03),
      urlHash: Math.floor(total * 0.02),
      dup: Math.floor(total * 0.02),
    }
  }

  if (isLarge) {
    return {
      fail: Math.floor(total * 0.003),
      quarantine: Math.floor(total * 0.01),
      review: Math.floor(total * 0.02),
      urlHash: Math.floor(total * 0.005),
      dup: Math.floor(total * 0.003),
    }
  }

  if (isMedium) {
    return {
      fail: Math.floor(total * 0.005),
      quarantine: Math.floor(total * 0.015),
      review: Math.floor(total * 0.02),
      urlHash: Math.floor(total * 0.01),
      dup: Math.floor(total * 0.005),
    }
  }

  return {
    fail: Math.floor(total * 0.01),
    quarantine: Math.floor(total * 0.02),
    review: Math.floor(total * 0.02),
    urlHash: Math.floor(total * 0.01),
    dup: Math.floor(total * 0.01),
  }
}

function clampConfig(total, cfg) {
  const keys = ['fail', 'quarantine', 'review', 'urlHash', 'dup']
  const sum = keys.reduce((acc, key) => acc + cfg[key], 0)
  if (sum <= total) return cfg

  const ratio = total / sum
  const scaled = {}
  let scaledSum = 0
  for (const key of keys) {
    scaled[key] = Math.max(0, Math.floor(cfg[key] * ratio))
    scaledSum += scaled[key]
  }

  let remaining = total - scaledSum
  for (const key of keys) {
    if (remaining <= 0) break
    scaled[key] += 1
    remaining -= 1
  }

  return scaled
}

function generateFile(fileName) {
  const filePath = resolve(FEED_DIR, fileName)
  const headers = readHeader(filePath)
  const detectedRows = countRows(filePath)
  const totalRows = detectedRows > 0 ? detectedRows : (DEFAULT_ROW_COUNTS[fileName] || 0)
  const cfg = clampConfig(totalRows, buildConfig(fileName, totalRows))

  const seed = Array.from(fileName).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const rng = mulberry32(seed)

  const domain = fileName.replace('.csv', '').replace(/^test_feed_/, '').replace(/_/g, '-')

  const rowTypes = []
  for (let i = 0; i < cfg.fail; i++) rowTypes.push('fail')
  for (let i = 0; i < cfg.quarantine; i++) rowTypes.push('quarantine')
  for (let i = 0; i < cfg.review; i++) rowTypes.push('review')
  for (let i = 0; i < cfg.urlHash; i++) rowTypes.push('urlhash')
  for (let i = 0; i < cfg.dup; i++) rowTypes.push('dup')
  while (rowTypes.length < totalRows) rowTypes.push('normal')

  for (let i = rowTypes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[rowTypes[i], rowTypes[j]] = [rowTypes[j], rowTypes[i]]
  }

  const rows = []
  const identities = []
  let failMissingName = 0
  let failMissingUrl = 0
  let failInvalidUrl = 0
  let failInvalidPrice = 0

  for (let i = 0; i < totalRows; i++) {
    const rowType = rowTypes[i]
    const product = makeBaseProduct(rng, i + 1, `${domain}.example.com`)
    const identity = {
      impactItemId: `CID${String(100000 + i).padStart(7, '0')}`,
      sku: `SKU-${String(200000 + i).padStart(7, '0')}`,
      gtin: String(100000000000 + i).slice(0, 12),
    }

    const opts = {
      missingName: false,
      missingUrl: false,
      invalidUrl: false,
      invalidPrice: false,
      missingCaliber: false,
      missingUpc: false,
      urlHashFallback: false,
      id: i + 1,
      domain: `${domain}.example.com`,
    }

    if (rowType === 'fail') {
      const failType = i % 4
      if (failType === 0) {
        opts.missingName = true
        failMissingName++
      } else if (failType === 1) {
        opts.missingUrl = true
        failMissingUrl++
      } else if (failType === 2) {
        opts.invalidUrl = true
        failInvalidUrl++
      } else {
        opts.invalidPrice = true
        failInvalidPrice++
      }
    }

    if (rowType === 'quarantine') {
      opts.missingCaliber = true
    }

    if (rowType === 'review') {
      opts.missingUpc = true
    }

    if (rowType === 'urlhash') {
      opts.urlHashFallback = true
    }

    if (rowType === 'dup' && identities.length > 0) {
      const prev = identities[Math.floor(rng() * identities.length)]
      identity.impactItemId = prev.impactItemId
      identity.sku = prev.sku
      identity.gtin = prev.gtin
    }

    // Add tracking parameters to a small slice of URLs to test normalization.
    if (rng() < 0.015) {
      product.url = `${product.url}?utm_source=impactradius&clickid=${Math.floor(rng() * 1e8)}`
    }

    identities.push(identity)
    rows.push(buildRow(headers, product, identity, opts))
  }

  const csvLines = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const value = row[h] ?? ''
          const escaped = String(value).replace(/"/g, '""')
          return `"${escaped}"`
        })
        .join(',')
    ),
  ]

  writeFileSync(filePath, csvLines.join('\n'))

  const rejected = cfg.fail
  const parsed = totalRows - rejected
  const quarantine = cfg.quarantine
  const needsResolver = cfg.review
  const urlHashFallback = cfg.urlHash
  const duplicateIdentity = cfg.dup

  return {
    file: fileName,
    totalRows,
    parsedRows: parsed,
    rejectedRows: rejected,
    rejectedBreakdown: {
      missingName: failMissingName,
      missingUrl: failMissingUrl,
      invalidUrl: failInvalidUrl,
      invalidPrice: failInvalidPrice,
    },
    quarantinedRows: quarantine,
    needsResolverRows: needsResolver,
    urlHashFallbackRows: urlHashFallback,
    duplicateIdentityRows: duplicateIdentity,
  }
}

function main() {
  const expectations = FILES.map(generateFile)
  const outputPath = resolve(FEED_DIR, 'expectations.json')
  writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), expectations }, null, 2))
  console.log(`Updated ${expectations.length} files. Expectations written to ${outputPath}`)
}

main()

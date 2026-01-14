#!/usr/bin/env node
/**
 * Generate a delta affiliate feed from an existing CSV.
 *
 * Usage:
 *   node scripts/dev/generate-affiliate-delta.mjs --file test_feed_ammo_depot.csv --seed 42
 */

import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve, extname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const FEED_DIR = resolve(ROOT, 'context/examples/test_affiliate_feeds')

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('-')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    }
  }
  return args
}

function mulberry32(seed) {
  let t = seed >>> 0
  return function () {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function clampMoney(value) {
  const rounded = Math.round(value * 100) / 100
  return rounded.toFixed(2)
}

function normalizeHeader(header) {
  return header.trim().toLowerCase()
}

function readCsv(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }
  const headers = lines[0].replace(/^"|"$/g, '').split('","')
  const rows = lines.slice(1).map((line) => {
    const values = line.replace(/^"|"$/g, '').split('","')
    const row = {}
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? ''
    })
    return row
  })
  return { headers, rows }
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      headers
        .map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ]
  writeFileSync(filePath, lines.join('\n'))
}

function updatePrice(row, headers, delta) {
  for (const header of headers) {
    const key = normalizeHeader(header)
    if (['currentprice', 'current price', 'saleprice', 'sale price'].includes(key)) {
      const raw = Number(String(row[header]).replace(/[^0-9.-]/g, ''))
      if (!Number.isFinite(raw)) continue
      row[header] = clampMoney(raw + delta)
      return true
    }
  }
  return false
}

function updateStock(row, headers, inStockValue) {
  for (const header of headers) {
    const key = normalizeHeader(header)
    if (key === 'stockavailability' || key === 'stock availability' || key === 'availability') {
      row[header] = inStockValue ? 'In Stock' : 'Out of Stock'
      return true
    }
    if (key === 'instock' || key === 'in stock') {
      row[header] = inStockValue ? 'true' : 'false'
      return true
    }
  }
  return false
}

function main() {
  const args = parseArgs(process.argv)
  const file = args.file
  if (!file) {
    console.error('Missing --file argument')
    process.exit(1)
  }

  const seed = Number(args.seed ?? 1)
  const rng = mulberry32(seed)

  const inputPath = resolve(FEED_DIR, file)
  const { headers, rows } = readCsv(inputPath)
  if (rows.length === 0) {
    console.error('No rows found in file')
    process.exit(1)
  }

  const total = rows.length
  const priceDropCount = Math.floor(total * 0.05)
  const priceIncreaseCount = Math.floor(total * 0.03)
  const backInStockCount = Math.floor(total * 0.02)
  const outOfStockCount = Math.floor(total * 0.02)

  const indices = rows.map((_, idx) => idx)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  let cursor = 0
  const priceDropIdx = indices.slice(cursor, cursor + priceDropCount)
  cursor += priceDropCount
  const priceIncreaseIdx = indices.slice(cursor, cursor + priceIncreaseCount)
  cursor += priceIncreaseCount
  const backInStockIdx = indices.slice(cursor, cursor + backInStockCount)
  cursor += backInStockCount
  const outOfStockIdx = indices.slice(cursor, cursor + outOfStockCount)

  for (const idx of priceDropIdx) {
    updatePrice(rows[idx], headers, -2 - rng() * 10)
  }

  for (const idx of priceIncreaseIdx) {
    updatePrice(rows[idx], headers, 2 + rng() * 12)
  }

  for (const idx of backInStockIdx) {
    updateStock(rows[idx], headers, true)
  }

  for (const idx of outOfStockIdx) {
    updateStock(rows[idx], headers, false)
  }

  const deltaPath = resolve(
    FEED_DIR,
    `${basename(file, extname(file))}.delta.csv`
  )
  writeCsv(deltaPath, headers, rows)

  const summary = {
    file,
    deltaFile: basename(deltaPath),
    totalRows: total,
    priceDrops: priceDropCount,
    priceIncreases: priceIncreaseCount,
    backInStock: backInStockCount,
    outOfStock: outOfStockCount,
    seed,
  }

  const summaryPath = resolve(
    FEED_DIR,
    `${basename(file, extname(file))}.delta.json`
  )
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

  console.log(`Wrote ${deltaPath}`)
  console.log(`Wrote ${summaryPath}`)
}

main()

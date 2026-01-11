import { parse as parseCSV } from 'csv-parse/sync'
import * as fs from 'fs'
import * as path from 'path'
import { parseAttributes, parseUrlSignals } from '../affiliate/signal-extraction'
import { extractGrainWeight, extractRoundCount, normalizeCaliberString } from '../normalizer/ammo-utils'

type SignalSource = 'ATTRIBUTES' | 'URL' | 'TITLE' | 'COLUMN' | 'MISSING'

interface FieldPick<T> {
  value?: T
  source: SignalSource
}

interface RawRow {
  [key: string]: string | undefined
}

const DEFAULT_INPUT = path.join('context', 'examples', 'test_affiliate_feeds')

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function collectCsvFiles(targetPath: string): string[] {
  if (!fs.existsSync(targetPath)) return []
  const stat = fs.statSync(targetPath)
  if (stat.isFile()) return targetPath.endsWith('.csv') ? [targetPath] : []

  const files: string[] = []
  const entries = fs.readdirSync(targetPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectCsvFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.csv')) {
      files.push(fullPath)
    }
  }
  return files
}

function escapeCsv(value: string | number | undefined): string {
  if (value === undefined || value === null) return ''
  const stringValue = String(value)
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

function getValue(record: RawRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== '') {
      return String(record[key])
    }
    const lowerKey = key.toLowerCase()
    for (const recordKey of Object.keys(record)) {
      if (recordKey.toLowerCase() === lowerKey && record[recordKey] !== undefined && record[recordKey] !== '') {
        return String(record[recordKey])
      }
    }
  }
  return undefined
}

function pickField<T>(attributeValue?: T, urlValue?: T, titleValue?: T): FieldPick<T> {
  if (attributeValue !== undefined) return { value: attributeValue, source: 'ATTRIBUTES' }
  if (urlValue !== undefined) return { value: urlValue, source: 'URL' }
  if (titleValue !== undefined) return { value: titleValue, source: 'TITLE' }
  return { source: 'MISSING' }
}

function parseRows(content: string): RawRow[] {
  return parseCSV(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ',',
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as RawRow[]
}

function run(): void {
  const inputArg = getArg('--input') ?? DEFAULT_INPUT
  const outputArg = getArg('--output')
  const outputPath = outputArg ?? path.join('context', 'examples', 'validation', 'affiliate-parse-report.csv')

  const files = collectCsvFiles(inputArg)
  if (files.length === 0) {
    console.error(`No CSV files found at ${inputArg}`)
    process.exit(1)
  }

  const rows: string[] = []
  rows.push([
    'feedFile',
    'rowNumber',
    'name',
    'url',
    'brand',
    'brandSource',
    'caliber',
    'caliberSource',
    'grainWeight',
    'grainSource',
    'roundCount',
    'roundSource',
    'missingFields',
  ].join(','))

  const stats = {
    totalRows: 0,
    brand: { filled: 0, bySource: { ATTRIBUTES: 0, URL: 0, TITLE: 0, COLUMN: 0, MISSING: 0 } },
    caliber: { filled: 0, bySource: { ATTRIBUTES: 0, URL: 0, TITLE: 0, COLUMN: 0, MISSING: 0 } },
    grain: { filled: 0, bySource: { ATTRIBUTES: 0, URL: 0, TITLE: 0, COLUMN: 0, MISSING: 0 } },
    round: { filled: 0, bySource: { ATTRIBUTES: 0, URL: 0, TITLE: 0, COLUMN: 0, MISSING: 0 } },
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const rawRecords = parseRows(content)

    rawRecords.forEach((record, index) => {
      const name = getValue(record, 'Name', 'ProductName', 'Product Name', 'title', 'Title') ?? ''
      const url = getValue(record, 'Url', 'URL', 'ProductURL', 'Product URL', 'Link', 'url', 'link') ?? ''
      const brand = getValue(record, 'Manufacturer', 'Brand', 'brand', 'manufacturer') ?? ''
      const attributesRaw = getValue(record, 'Attributes', 'attributes')

      const attributeSignals = parseAttributes(attributesRaw)
      const urlSignals = url ? parseUrlSignals(url) : {}
      const titleSignals = {
        caliber: normalizeCaliberString(name) ?? undefined,
        grainWeight: extractGrainWeight(name) ?? undefined,
        roundCount: extractRoundCount(name) ?? undefined,
      }

      const caliberPick = pickField(attributeSignals.caliber, urlSignals.caliber, titleSignals.caliber)
      const grainPick = pickField(attributeSignals.grainWeight, urlSignals.grainWeight, titleSignals.grainWeight)
      const roundPick = pickField(attributeSignals.roundCount, urlSignals.roundCount, titleSignals.roundCount)
      const brandPick: FieldPick<string> = brand ? { value: brand, source: 'COLUMN' } : { source: 'MISSING' }

      const missingFields: string[] = []
      if (!brandPick.value) missingFields.push('brand')
      if (!caliberPick.value) missingFields.push('caliber')
      if (!grainPick.value) missingFields.push('grainWeight')
      if (!roundPick.value) missingFields.push('roundCount')

      stats.totalRows += 1
      stats.brand.bySource[brandPick.source] += 1
      stats.caliber.bySource[caliberPick.source] += 1
      stats.grain.bySource[grainPick.source] += 1
      stats.round.bySource[roundPick.source] += 1
      if (brandPick.value !== undefined) stats.brand.filled += 1
      if (caliberPick.value !== undefined) stats.caliber.filled += 1
      if (grainPick.value !== undefined) stats.grain.filled += 1
      if (roundPick.value !== undefined) stats.round.filled += 1

      rows.push([
        escapeCsv(path.relative(process.cwd(), file)),
        escapeCsv(index + 1),
        escapeCsv(name),
        escapeCsv(url),
        escapeCsv(brandPick.value),
        escapeCsv(brandPick.source),
        escapeCsv(caliberPick.value),
        escapeCsv(caliberPick.source),
        escapeCsv(grainPick.value),
        escapeCsv(grainPick.source),
        escapeCsv(roundPick.value),
        escapeCsv(roundPick.source),
        escapeCsv(missingFields.join('|')),
      ].join(','))
    })
  }

  const outputDir = path.dirname(outputPath)
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, rows.join('\n'), 'utf-8')

  const pct = (count: number) => (stats.totalRows > 0 ? ((count / stats.totalRows) * 100).toFixed(1) : '0.0')

  console.log('Affiliate parse report generated:')
  console.log(`- Output: ${outputPath}`)
  console.log(`- Rows: ${stats.totalRows}`)
  console.log(`- Brand coverage: ${pct(stats.brand.filled)}%`)
  console.log(`- Caliber coverage: ${pct(stats.caliber.filled)}%`)
  console.log(`- Grain coverage: ${pct(stats.grain.filled)}%`)
  console.log(`- Round count coverage: ${pct(stats.round.filled)}%`)
  console.log('- Source breakdown:')
  console.log(`  - Brand: COLUMN ${stats.brand.bySource.COLUMN}, MISSING ${stats.brand.bySource.MISSING}`)
  console.log(`  - Caliber: ATTR ${stats.caliber.bySource.ATTRIBUTES}, URL ${stats.caliber.bySource.URL}, TITLE ${stats.caliber.bySource.TITLE}, MISSING ${stats.caliber.bySource.MISSING}`)
  console.log(`  - Grain: ATTR ${stats.grain.bySource.ATTRIBUTES}, URL ${stats.grain.bySource.URL}, TITLE ${stats.grain.bySource.TITLE}, MISSING ${stats.grain.bySource.MISSING}`)
  console.log(`  - Round: ATTR ${stats.round.bySource.ATTRIBUTES}, URL ${stats.round.bySource.URL}, TITLE ${stats.round.bySource.TITLE}, MISSING ${stats.round.bySource.MISSING}`)
}

run()

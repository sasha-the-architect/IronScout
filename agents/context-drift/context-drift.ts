/**
 * Context Watcher: monitors commits for context drift.
 *
 * Context lives under /context. The legacy /docs folder is gone.
 *
 * Policy (WARN-ONLY MODE):
 * - Owned code changed without updating owning context → WARN or BLOCK based on severity.
 * - Orphan code (no owner in context/index.json) → WARN ONLY. Never blocks.
 * - --fail-on-drift exits non-zero ONLY when blocking severity is triggered.
 *
 * Context ownership is defined in: context/index.json
 *
 * Waivers (commit trailers):
 *   Context-Ack: <contextId>
 *   Context-Reason: <free text>
 *
 * Usage:
 *   pnpm tsx agents/context-watcher/context-watcher.ts
 *
 * Options:
 *   --ack
 *   --no-slack
 *   --fail-on-drift
 *   --rev <rev>
 */

import { execSync } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import https from 'https'

type Severity = 'warn' | 'block'
type Hit = { reason: string; files: string[] }

interface ContextIndex {
  version: number
  pages: ContextPage[]
  exclusions?: string[]
}

interface ContextPage {
  id: string
  path: string
  severity?: Severity
  owns: {
    paths?: string[]
    regex?: string[]
  }
}

interface CompiledPage extends ContextPage {
  _pathMatchers: RegExp[]
  _regexMatchers: RegExp[]
}

interface ContextWatcherState {
  lastHead?: string
  contentHash?: string
  acknowledged: boolean
  rev?: string
}

const CONTEXT_ROOT = 'context'
const CONTEXT_INDEX = path.join(CONTEXT_ROOT, 'index.json')
const STATE_FILE = '.context-watcher-state.json'
const STATE_FILES = [STATE_FILE]

// ---------- helpers ----------
function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string) {
  console.log(`[${new Date().toISOString()}] [${level}] ${msg}`)
}

function fileExists(rel: string): boolean {
  try {
    fs.accessSync(path.join(process.cwd(), rel))
    return true
  } catch {
    return false
  }
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function isContextFile(file: string): boolean {
  return file.startsWith(`${CONTEXT_ROOT}/`)
}

// ---------- git ----------
function getCommit(rev: string) {
  const message = run(`git log -1 --pretty=%B ${rev}`)
  const files = run(`git log -1 --name-only --pretty=format: ${rev}`)
    .split('\n')
    .filter(Boolean)
  return { message, files }
}

function computeContentHash(message: string, files: string[]) {
  const meaningful = files.filter((f) => !STATE_FILES.includes(f))
  return createHash('sha256')
    .update([message.trim(), ...meaningful.sort()].join('\n'))
    .digest('hex')
    .slice(0, 16)
}

// ---------- trailers ----------
function parseContextAck(message: string) {
  const ackIds = new Set<string>()
  let reason: string | undefined

  for (const line of message.split('\n')) {
    const ack = /^(Context-Ack|Docs-Ack):\s*(.+)$/i.exec(line)
    if (ack) ackIds.add(ack[2].trim())

    const rsn = /^(Context-Reason|Docs-Reason):\s*(.+)$/i.exec(line)
    if (rsn) reason = rsn[2].trim()
  }

  return { ackIds, reason }
}

// ---------- context index ----------
function loadIndex(): { pages: CompiledPage[]; exclusions: RegExp[] } {
  const abs = path.join(process.cwd(), CONTEXT_INDEX)
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing ${CONTEXT_INDEX}`)
  }

  const idx = JSON.parse(fs.readFileSync(abs, 'utf-8')) as ContextIndex
  const pages: CompiledPage[] = idx.pages.map((p) => {
    if (!fileExists(p.path)) throw new Error(`Missing context file: ${p.path}`)
    return {
      ...p,
      _pathMatchers: (p.owns.paths ?? []).map(globToRegExp),
      _regexMatchers: (p.owns.regex ?? []).map((r) => new RegExp(r)),
    }
  })

  const exclusions = (idx.exclusions ?? []).map(globToRegExp)
  return { pages, exclusions }
}

function ownersForFile(file: string, pages: CompiledPage[]) {
  return pages.filter(
    (p) => p._pathMatchers.some((re) => re.test(file)) || p._regexMatchers.some((re) => re.test(file))
  )
}

// ---------- state ----------
function readState(p: string): ContextWatcherState {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return { acknowledged: true }
  }
}

function writeState(p: string, s: ContextWatcherState) {
  fs.writeFileSync(p, JSON.stringify(s, null, 2))
}

// ---------- slack ----------
function sendSlack(webhook: string, lines: string[]) {
  const payload = JSON.stringify({ text: lines.join('\n') })
  const url = new URL(webhook)

  const req = https.request(
    {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    },
    () => {}
  )

  req.write(payload)
  req.end()
}

// ---------- main ----------
function main() {
  const args = process.argv.slice(2)
  const ackOnly = args.includes('--ack')
  const failOnDrift = args.includes('--fail-on-drift')
  const noSlack = args.includes('--no-slack')
  const rev = args.includes('--rev') ? args[args.indexOf('--rev') + 1] : 'HEAD'

  const statePath = path.join(process.cwd(), STATE_FILE)
  const state = readState(statePath)

  const head = run(`git rev-parse ${rev}`)
  const { message, files } = getCommit(rev)
  const contentHash = computeContentHash(message, files)

  if (ackOnly) {
    writeState(statePath, { lastHead: head, contentHash, acknowledged: true, rev })
    log('INFO', 'Context acknowledged')
    return
  }

  const { pages, exclusions } = loadIndex()
  const changedContext = new Set(files.filter(isContextFile))
  const { ackIds, reason } = parseContextAck(message)

  const enforceFiles = files.filter(
    (f) => !isContextFile(f) && !STATE_FILES.includes(f) && !exclusions.some((re) => re.test(f))
  )

  const requiredPaths = new Set<string>()
  const requiredIds = new Set<string>()
  const orphanFiles: string[] = []
  let hasBlockingOwner = false

  for (const file of enforceFiles) {
    const owners = ownersForFile(file, pages)
    if (!owners.length) {
      orphanFiles.push(file)
      continue
    }

    for (const o of owners) {
      requiredPaths.add(o.path)
      requiredIds.add(o.id)
      if ((o.severity ?? 'warn') === 'block') hasBlockingOwner = true
    }
  }

  const requiredTouched = [...requiredPaths].some((p) => changedContext.has(p))
  const waived = [...requiredIds].every((id) => ackIds.has(id))
  const drift = requiredIds.size > 0 && !requiredTouched && !waived

  if (!drift && orphanFiles.length === 0) {
    log('INFO', 'Context check: clean')
    writeState(statePath, { lastHead: head, contentHash, acknowledged: true, rev })
    return
  }

  log('WARN', 'Context check: drift detected')
  console.log('\nCommit message:\n' + message.trim() + '\n')

  if (requiredPaths.size) {
    console.log('Required context:')
    for (const p of [...requiredPaths].sort()) console.log(` - ${p}`)
    console.log('')
  }

  if (orphanFiles.length) {
    console.log('Orphan changes (warning only):')
    orphanFiles.forEach((f) => console.log(` - ${f}`))
    console.log('')
  }

  if (ackIds.size) {
    console.log(`Context-Ack: ${[...ackIds].join(', ')}`)
    if (reason) console.log(`Context-Reason: ${reason}`)
    console.log('')
  }

  writeState(statePath, { lastHead: head, contentHash, acknowledged: false, rev })

  const webhook =
    process.env.CONTEXT_WATCHER_SLACK_WEBHOOK || process.env.DOC_WATCHER_SLACK_WEBHOOK

  if (webhook && !noSlack) {
    const lines = [
      `Context drift warning on ${head}`,
      '',
      ...[...requiredPaths].map((p) => `Required: ${p}`),
      ...orphanFiles.map((f) => `Orphan: ${f}`),
    ]
    sendSlack(webhook, lines)
  }

  if (failOnDrift && hasBlockingOwner && drift) {
    log('ERROR', 'Blocking context drift detected')
    process.exit(1)
  }
}

main()

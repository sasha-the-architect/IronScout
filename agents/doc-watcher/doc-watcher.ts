/**
 * Doc Watcher: analyzes the latest commit to flag potential documentation drift.
 *
 * How it works:
 * - Reads the latest commit message and diff (file list + hunks).
 * - Applies heuristics to detect changes that commonly require docs updates
 *   (business logic, product offerings/tiers, API contract, schema, auth/roles,
 *    env/config, feature gating, search/ranking, alerts, notifications, queues,
 *    deployment/infra, data lifecycle/visibility, metrics/monitoring, seeds/fixtures).
 * - Outputs a concise report with candidate docs to review.
 *
 * Usage:
 *   pnpm tsx agents/doc-watcher/doc-watcher.ts
 *   pnpm exec tsx agents/doc-watcher/doc-watcher.ts
 *
 * Note: This script only reports; it does not auto-edit docs.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import https from 'https'

type HeuristicHit = { reason: string; files: string[] }

const DOC_MAP = {
  arch: [
    'docs/architecture/overview.md',
    'docs/architecture/ai-search.md',
    'docs/architecture/database.md',
  ],
  apps: {
    api: 'docs/apps/api.md',
    web: 'docs/apps/web.md',
    harvester: 'docs/apps/harvester.md',
    admin: 'docs/apps/admin.md',
    dealer: 'docs/apps/dealer.md',
  },
  product: [
    'docs/product/consumer-tiers.md',
    'docs/product/offerings.md',
    'docs/product/subscription-management.md',
  ],
  deployment: [
    'docs/deployment/environments.md',
    'docs/deployment/render.md',
    'docs/deployment/stripe.md',
    'docs/deployment/email.md',
  ],
  guides: ['docs/guides/feed-troubleshooting.md'],
}

const patterns = {
  schema: [/schema\.prisma/, /migration/i],
  apiRoutes: [/apps\/api\/src\/routes\//, /app\/api\//],
  aiSearch: [/ai-search/, /premium-ranking/, /best-value-score/, /intent-parser/],
  tiers: [/config\/tiers\.ts/, /subscription/i, /tier/i, /plan/i, /pricing/i],
  productDocs: [/docs\/product\//, /consumer-tiers\.md/, /offerings\.md/, /subscription-management\.md/],
  archDocs: [/docs\/architecture\//],
  appDocs: [/docs\/apps\//],
  deployment: [/render\.ya?ml/, /docs\/deployment\//, /env/i, /NEXTAUTH/, /STRIPE/, /OPENAI/, /RESEND/],
  auth: [/auth/i, /admin/i, /impersonat/i, /role/i, /permissions?/i, /X-User-Id/i],
  alerts: [/alert/i, /alerter/i, /notification/i, /resend/i, /email/i],
  queues: [/queue/i, /bullmq/i, /worker/i, /scheduler/i, /cron/i],
  searchRanking: [/rank/i, /score/i, /embedding/i, /vector/i, /pgvector/i, /index/i],
  dataLifecycle: [/retention/i, /visibility/i, /hidden/i, /expired/i, /grace/i, /sku/i],
  deploymentInfra: [/render/i, /Dockerfile/i, /compose/i, /health/i, /port/i],
  metrics: [/metric/i, /telemetry/i, /dashboard/i, /monitor/i, /alerting/i],
  seeds: [/seed/i, /fixtures?/i, /demo/i],
}

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

function getLatestCommit(): { message: string; files: string[] } {
  const message = run('git log -1 --pretty=%B')
  const files = run('git log -1 --name-only --pretty=format:').split('\n').filter(Boolean)
  return { message, files }
}

function hitsAny(path: string, pats: RegExp[]): boolean {
  return pats.some((re) => re.test(path))
}

function analyze(files: string[], message: string): { hits: HeuristicHit[]; docs: Set<string> } {
  const hits: HeuristicHit[] = []
  const docs = new Set<string>()

  const addHit = (reason: string, matchFiles: string[], docCandidates: string[]) => {
    hits.push({ reason, files: matchFiles })
    docCandidates.forEach((d) => docs.add(d))
  }

  const m = message.toLowerCase()
  const msgMentions = {
    tier: /tier|plan|pricing|premium|free|subscription|founding/.test(m),
    api: /api|route|endpoint/.test(m),
    schema: /schema|prisma|model|enum/.test(m),
    search: /search|ranking|score|filter|intent|embedding|vector/.test(m),
    alert: /alert|notification|email|resend/.test(m),
    deploy: /render|deploy|env|config|stripe|openai|resend/.test(m),
    auth: /auth|admin|impersonat|role|permission/.test(m),
  }

  const hitFiles = (label: string, pats: RegExp[], docCandidates: string[]) => {
    const match = files.filter((f) => hitsAny(f, pats))
    if (match.length) addHit(label, match, docCandidates)
  }

  // Schema / DB
  hitFiles('Schema/DB change', patterns.schema, [DOC_MAP.arch[2]])

  // API routes / contracts
  hitFiles('API routes/contracts', patterns.apiRoutes, [DOC_MAP.apps.api])

  // AI search / ranking / filters
  hitFiles('AI search/ranking change', patterns.aiSearch, [DOC_MAP.arch[1], DOC_MAP.apps.api, DOC_MAP.apps.web])

  // Tiers / pricing / subscription
  hitFiles('Tier/pricing/subscription change', patterns.tiers, [
    DOC_MAP.product[0],
    DOC_MAP.product[1],
    DOC_MAP.product[2],
    DOC_MAP.apps.api,
    DOC_MAP.apps.web,
  ])

  // Product docs touched directly
  hitFiles('Product doc touched', patterns.productDocs, DOC_MAP.product)

  // Architecture docs touched directly
  hitFiles('Architecture doc touched', patterns.archDocs, DOC_MAP.arch)

  // App docs touched directly
  hitFiles('App doc touched', patterns.appDocs, [
    DOC_MAP.apps.api,
    DOC_MAP.apps.web,
    DOC_MAP.apps.harvester,
    DOC_MAP.apps.admin,
    DOC_MAP.apps.dealer,
  ])

  // Deployment / env / config
  hitFiles('Deployment/env/config change', patterns.deployment, DOC_MAP.deployment)

  // Auth/roles/impersonation
  hitFiles('Auth/roles/impersonation change', patterns.auth, [DOC_MAP.apps.web, DOC_MAP.apps.admin, DOC_MAP.apps.dealer])

  // Alerts/notifications/email
  hitFiles('Alerts/notifications change', patterns.alerts, [DOC_MAP.deployment[3], DOC_MAP.apps.harvester, DOC_MAP.apps.api])

  // Queues/workers/schedules
  hitFiles('Queues/workers/schedules change', patterns.queues, [DOC_MAP.apps.harvester, DOC_MAP.arch[0]])

  // Search/ranking/indexing
  hitFiles('Search/ranking/indexing change', patterns.searchRanking, [DOC_MAP.arch[1], DOC_MAP.arch[2], DOC_MAP.apps.api])

  // Data lifecycle/visibility
  hitFiles('Data lifecycle/visibility change', patterns.dataLifecycle, [DOC_MAP.product[2], DOC_MAP.apps.dealer, DOC_MAP.apps.admin])

  // Deployment/infra
  hitFiles('Deployment/infra change', patterns.deploymentInfra, DOC_MAP.deployment)

  // Metrics/monitoring
  hitFiles('Metrics/monitoring change', patterns.metrics, [DOC_MAP.arch[0]])

  // Seeds/fixtures
  hitFiles('Seeds/fixtures change', patterns.seeds, DOC_MAP.guides)

  // Message-only hints
  if (msgMentions.tier) {
    addHit('Commit message mentions tier/plan/pricing', ['<message>'], [
      DOC_MAP.product[0],
      DOC_MAP.product[1],
      DOC_MAP.product[2],
    ])
  }
  if (msgMentions.api) {
    addHit('Commit message mentions API/route/endpoint', ['<message>'], [DOC_MAP.apps.api])
  }
  if (msgMentions.schema) {
    addHit('Commit message mentions schema/model/enum', ['<message>'], [DOC_MAP.arch[2]])
  }
  if (msgMentions.search) {
    addHit('Commit message mentions search/ranking/filters', ['<message>'], [DOC_MAP.arch[1], DOC_MAP.apps.api])
  }
  if (msgMentions.alert) {
    addHit('Commit message mentions alerts/notifications/email', ['<message>'], [
      DOC_MAP.deployment[3],
      DOC_MAP.apps.harvester,
      DOC_MAP.apps.api,
    ])
  }
  if (msgMentions.deploy) {
    addHit('Commit message mentions deploy/env/config/Stripe/OpenAI/Resend', ['<message>'], DOC_MAP.deployment)
  }
  if (msgMentions.auth) {
    addHit('Commit message mentions auth/roles/admin/impersonation', ['<message>'], [
      DOC_MAP.apps.web,
      DOC_MAP.apps.admin,
      DOC_MAP.apps.dealer,
    ])
  }

  return { hits, docs }
}

function main() {
  try {
    const args = process.argv.slice(2)
    const ackOnly = args.includes('--ack')
    const noSlack = args.includes('--no-slack')
    const failOnDrift = args.includes('--fail-on-drift')

    const head = run('git rev-parse HEAD')
    const statePath = path.join(process.cwd(), '.doc-watcher-state.json')
    const state = readState(statePath)

    if (ackOnly) {
      writeState(statePath, { lastHead: head, acknowledged: true })
      console.log(`[doc-watcher] Acknowledged HEAD ${head}.`)
      return
    }

    const { message, files } = getLatestCommit()
    const { hits, docs } = analyze(files, message)

    if (!hits.length) {
      console.log('Docs check: no obvious documentation impact detected.')
      // Mark current head as acknowledged to avoid stale reminders
      writeState(statePath, { lastHead: head, acknowledged: true })
      return
    }

    console.log('Docs check: potential documentation updates needed.')
    console.log('')
    console.log('Commit message:')
    console.log(message.trim())
    console.log('')
    console.log('Heuristic triggers:')
    hits.forEach((h, idx) => {
      console.log(` ${idx + 1}. ${h.reason}`)
      console.log(`    Files: ${h.files.join(', ')}`)
    })
    console.log('')
    if (docs.size) {
      console.log('Candidate docs to review/update:')
      Array.from(docs).sort().forEach((d) => console.log(` - ${d}`))
    } else {
      console.log('Candidate docs to review/update: (none suggested)')
    }
    console.log('')
    console.log('Next: review the commit diff for these areas; if clear, update the corresponding doc(s).')

    // Mark this head as needing acknowledgement
    writeState(statePath, { lastHead: head, acknowledged: false })

    const webhook = process.env.DOC_WATCHER_SLACK_WEBHOOK
    const alreadySent = state.lastHead === head && state.acknowledged === false
    if (webhook && !noSlack && !alreadySent) {
      sendSlack(webhook, head, hits, docs)
    }
    console.log('To acknowledge after updating docs, run: pnpm doc:watch --ack')

    if (failOnDrift) {
      console.error('[doc-watcher] Doc drift detected and not acknowledged. Blocking (use pnpm doc:watch --ack after updating docs).')
      process.exit(1)
    }
  } catch (err) {
    console.error('Doc watcher failed:', err)
    process.exit(1)
  }
}

main()

// ---------------- helpers ----------------

function readState(statePath: string): { lastHead?: string; acknowledged: boolean } {
  try {
    const txt = fs.readFileSync(statePath, 'utf-8')
    const parsed = JSON.parse(txt)
    return { lastHead: parsed.lastHead, acknowledged: !!parsed.acknowledged }
  } catch {
    return { acknowledged: true }
  }
}

function writeState(statePath: string, state: { lastHead?: string; acknowledged: boolean }) {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
  } catch (err) {
    console.warn('[doc-watcher] Unable to write state file:', err)
  }
}

function sendSlack(webhook: string, head: string, hits: HeuristicHit[], docs: Set<string>) {
  try {
    const textLines = [
      `:memo: Doc watcher detected potential doc drift on HEAD ${head}`,
      '',
      ...hits.map((h, idx) => `${idx + 1}. ${h.reason} (files: ${h.files.join(', ')})`),
    ]
    if (docs.size) {
      textLines.push('', 'Candidate docs:', ...Array.from(docs).sort().map((d) => `- ${d}`))
    }
    textLines.push('', 'Acknowledge after updating docs: `pnpm doc:watch --ack`')

    const payload = JSON.stringify({ text: textLines.join('\n') })
    const url = new URL(webhook)
    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300) {
          console.warn(`[doc-watcher] Slack webhook responded with ${res.statusCode}`)
        }
      }
    )
    req.on('error', (err) => console.warn('[doc-watcher] Slack webhook error:', err.message))
    req.write(payload)
    req.end()
  } catch (err) {
    console.warn('[doc-watcher] Failed to send Slack notification:', err)
  }
}

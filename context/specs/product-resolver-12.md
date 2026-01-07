Spec: Product Resolver v1.2
Goal

Incrementally and deterministically link each source_products row to exactly one canonical products row so prices from multiple retailers can be grouped. Maintain near-real-time behavior. Preserve immutable price facts. Make identity decisions auditable, replayable, and safe under evolution.

0) Implementation Prerequisites (Normative, Blocking)

The resolver MUST NOT be implemented or deployed until the following schema, enum, and queue contracts exist. These are required system contracts.

0.0 Data Model Architecture (Normative)

Source of truth

prices stores immutable facts keyed by sourceProductId only.

product_links is the identity mapping source of truth.

All product grouping MUST happen by joining: prices.sourceProductId → product_links.productId → products.

Query path (correctness)

Consumer search and price aggregation MUST join through product_links:

```sql
SELECT p.*, pr.*
FROM products p
JOIN product_links pl ON pl."productId" = p.id
JOIN prices pr ON pr."sourceProductId" = pl."sourceProductId"
WHERE pl.status IN ('MATCHED', 'CREATED')
  AND ...
```

This is the canonical query path. All other paths are optimizations.

prices.productId policy

prices.productId is a nullable denormalized column.

It is NOT required for correctness.

It MUST NOT be trusted over product_links.

If populated, treat as a cache for query performance only.

Stale values are acceptable; JOIN through product_links for authoritative grouping.

When to denormalize (future, not v1)

Add prices.productId denormalization only if ALL are true:

Search query performance is unacceptable with JOINs after indexing.

Async backfill pipeline exists to maintain consistency.

Relink events trigger productId refresh.

Even with denormalization, correctness path remains: JOIN through product_links.

Required indexes for JOIN performance

prices: INDEX(sourceProductId, createdAt DESC)

product_links: UNIQUE(sourceProductId), INDEX(productId), INDEX(status)

products: INDEX(id) (PK)

Optional: Materialized view price_facts for high-QPS search.

0.1 Required tables
product_links (control plane, system of truth)

Purpose: stores all identity decisions.

Required fields:

sourceProductId (UNIQUE)

productId (nullable)

matchType (enum)

status (enum)

reasonCode (enum, nullable)

confidence (float)

resolverVersion (string)

evidence (json)

resolvedAt

updatedAt

Required constraints:

productId IS NULL when status IN (UNMATCHED, ERROR)

productId IS NOT NULL when status IN (MATCHED, CREATED)

UNIQUE(sourceProductId)

product_aliases (merge / split backstop)

Purpose: represent canonical product merges without rewriting history.

Required fields:

fromProductId

toProductId

reason

createdAt

Required behavior:

Resolver MUST resolve any candidate productId through alias mapping to the active product before persisting links.

Products MUST NOT be deleted.

products (canonical catalog additions)

Required fields:

canonicalKey (UNIQUE, immutable)

upcNorm (nullable, indexed, immutable)

brandNorm

caliberNorm

specs (json)

Required behavior:

canonicalKey and upcNorm MUST NOT change after creation.

specs may only be additive.

source_trust_config

Purpose: define identifier trust eligibility per source.

Required fields:

sourceId

upcTrusted (boolean)

version (int)

updatedAt

Required behavior:

Resolver MUST snapshot version into link evidence.

source_products (additions)

Required fields:

normalizedHash

Required behavior:

Resolver MUST compare current normalizedHash against prior resolution input to determine re-resolve eligibility.

0.2 Required enums (normative)

ProductLinkMatchType

UPC

FINGERPRINT

MANUAL

NONE

ERROR

ProductLinkStatus

MATCHED

CREATED

UNMATCHED

ERROR

ProductLinkReasonCode

INSUFFICIENT_DATA

INVALID_UPC

UPC_NOT_TRUSTED

AMBIGUOUS_FINGERPRINT

CONFLICTING_IDENTIFIERS

MANUAL_LOCKED

RELINK_BLOCKED_HYSTERESIS

SYSTEM_ERROR

NORMALIZATION_FAILED

0.3 Required queue and job contract

Queue: product_resolve

Job: RESOLVE_SOURCE_PRODUCT

Payload:

{
  sourceProductId,
  trigger: INGEST | RECONCILE | MANUAL,
  resolverVersion
}


JobId:

RESOLVE_SOURCE_PRODUCT:<sourceProductId>


Retry policy:

System errors only

Debounce:

10–30 seconds per sourceProductId

1) Inputs and outputs
Input

sourceProductId

Resolver loads:

source_products

existing product_links

candidate products

normalization dictionaries

source_trust_config

Output

Upserted product_links row

Optional canonical product creation

2) Determinism and versioning

Resolver MUST be a pure function of:

normalized input

resolverVersion

dictionary version

trust config version

product_links.evidence MUST include:

dictionaryVersion

trustConfigVersion

inputNormalized

inputHash

rulesFired

candidates (top scored candidates when fingerprinting)

3) Resolver algorithm (summary)
Normalization

Deterministic, non-throwing. Record failures in evidence.

Match priority

UPC (trusted only, confidence = 0.95)

Fingerprint (scored, deterministic)

UNMATCHED

Ambiguity rule

Fingerprint is ambiguous if:

bestScore ∈ [0.55, 0.70)

OR (bestScore − secondBestScore) < 0.03

→ UNMATCHED + AMBIGUOUS_FINGERPRINT

Conflict rule

Conflicts on immutable identifiers (UPC, brand, caliber, packCount) block linking.

→ UNMATCHED + CONFLICTING_IDENTIFIERS

Product upsert

Create if canonicalKey absent → CREATED

Else reuse → MATCHED

Handle canonicalKey races safely

Link persistence + hysteresis

MANUAL is never overridden

Relink only if:

stronger matchType

OR confidence improves by ≥ 0.10

Record previous decision in evidence

4) Error handling
System errors

Throw and retry

Final failure → ERROR + SYSTEM_ERROR

Data errors

Do not throw

Return UNMATCHED with reasonCode

5) Observability

Required metrics:

match_rate by matchType

unmatched_rate by reasonCode

relink_rate

manual_override_rate

resolver_version_distribution

time_to_resolve p50/p95

queue_lag_seconds

DLQ depth

SLO:

95% of touched listings reach MATCHED | CREATED | UNMATCHED within 60s.

6) Backstop reconciliation

Re-enqueue resolver when:

no link exists

status = ERROR

resolverVersion outdated

source_products.normalizedHash differs from prior inputHash

Appendix A: Operations Runbook (Normative)

This appendix defines mandatory operational procedures for the Product Resolver.
The resolver MUST NOT be operated in production without these procedures documented and accessible to on-call engineers.

A1) Ownership and on-call responsibility

The Product Resolver MUST have a named owning team.

That team MUST provide a primary on-call rotation.

Resolver incidents MUST page the owning team directly.

Ownership MUST include responsibility for:

schema correctness

queue health

DLQ remediation

alias integrity

manual override governance

A2) Required operational dashboards

The following dashboards MUST exist and be visible to on-call staff.

Resolver health dashboard

Must include, at minimum:

time_to_resolve p50 and p95

queue_lag_seconds

DLQ depth

resolver.system_error_rate

match_rate by matchType

unmatched_rate by reasonCode

relink_rate

manual_override_rate

candidate_overflow_rate

evidence_truncation_rate

Database health dashboard

Must include:

query latency for:

candidate lookup

product_links upsert

products canonicalKey select/create

alias resolution

DB errors grouped by:

deadlock

timeout

serialization

constraint violations

Dashboards MUST be updated in near-real time (<60s delay).

A3) Incident severity definitions
PAGE (P0)

Immediate user impact or irreversible data risk.

Examples:

queue lag > SLO for sustained period

DLQ accumulation without recovery

resolver crash loop

evidence write failures

alias traversal failures

WARN (P1)

Degradation or precursor to P0.

Examples:

elevated relink rate

candidate overflow spikes

manual override spikes

growing DLQ but below paging threshold

A4) First-response triage procedure (mandatory)

Within the first 10 minutes of any resolver incident, on-call MUST:

Check queue health

queue_lag_seconds

worker throughput

worker crash rate

Check DB health

slow queries

connection saturation

lock contention

Classify error shape

system errors vs data errors

retryable vs deterministic

Apply one mitigation lever only

pause reconciliation

throttle enqueue

reduce worker concurrency

increase worker concurrency if DB healthy

Multiple levers MUST NOT be applied simultaneously.

A5) Queue lag incident procedure

Symptoms

queue_lag_seconds exceeds thresholds

p95 time_to_resolve increases

ingest backlog grows

Immediate mitigations

Pause reconciliation enqueue

Rate-limit new enqueue from bulk ingest

Verify candidate query bounds are active

Scale workers only if DB capacity allows

Exit criteria

queue lag < 60s for 30 consecutive minutes

DLQ no longer growing

A6) DLQ management and re-drive

DLQ policy

Jobs enter DLQ after max retries.

DLQ depth MUST trend toward zero.

Daily DLQ procedure

Export DLQ entries.

Classify root cause:

infra

code defect

data anomaly

Apply fix.

Re-drive in controlled batches.

Re-drive limits

Max 1000 jobs per minute.

Abort if queue lag exceeds WARN threshold.

DLQ MUST NOT be treated as “acceptable backlog.”

A7) Alias integrity incidents

Symptoms

long-running jobs

repeated SYSTEM_ERROR related to alias resolution

high alias traversal latency

Procedure

Identify cycles or deep chains.

Break cycles immediately.

Flatten chains to terminal productId.

Re-drive affected sourceProductIds.

Alias cycles are data corruption events and MUST be treated as P0.

A8) Duplicate canonical product remediation

Symptoms

prices split across equivalent products

unexpected product proliferation

Procedure

Identify duplicates by canonicalKey or UPC.

Select winner product.

Create alias loser → winner.

Re-drive affected links.

Direct deletion of products is forbidden.

A9) Manual override incidents

Symptoms

spike in MANUAL links

resolver unable to correct links

Procedure

Freeze MANUAL writes if abuse suspected.

Identify actor and scope.

Roll back only if provenance exists.

Re-enable after controls verified.

A10) Reconciliation storm control

Symptoms

queue lag spike after resolverVersion bump

Procedure

Pause reconciliation.

Rate-limit to defined cap.

Prioritize ERROR and no-link cases.

Resume gradually.

A11) Required operational switches

The system MUST support:

pause reconciliation enqueue

reduce worker concurrency

disable fingerprint path

cap candidate retrieval

emergency alias traversal disable (last resort)

Each switch MUST be documented with:

when to use

expected side effects

rollback steps

Appendix B: Observability Build Contract (Normative)

This appendix defines how metrics are computed and emitted.
Metrics without defined semantics are invalid.

B1) Metric emission requirements

Metrics MUST be emitted by resolver workers.

Metrics backend MUST support counters, gauges, histograms.

All metrics MUST include bounded labels only:

source_kind: SourceKind enum (DIRECT, AFFILIATE_FEED, OTHER, UNKNOWN)

status: ProductLinkStatus enum (MATCHED, CREATED, UNMATCHED, ERROR)

reason_code: ProductLinkReasonCode enum (bounded, only for ERROR status)

High-cardinality labels (sourceProductId, productId, sourceId) MUST be avoided.

B2) Resolver health metrics (v1 Implementation)

Implementation: apps/harvester/src/resolver/metrics.ts

resolver_requests_total (Counter)

Increment at job start.

Labels: source_kind

resolver_decisions_total (Counter)

Increment exactly once per completed job.

Labels: source_kind, status

Status values: MATCHED, CREATED, UNMATCHED, ERROR

Derived metrics via helpers:
- match_rate = (MATCHED + CREATED) / total
- failure_rate = ERROR / total
- unmatched_rate by reasonCode

resolver_failure_total (Counter)

Increment for ERROR status only.

Labels: source_kind, reason_code

reason_code from ProductLinkReasonCode enum.

resolver_latency_ms (Histogram)

Time from job start to successful write.

Excludes queue waiting time.

Buckets: 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000ms

Labels: none (or source_kind if needed)

B3) Future metrics (v2+)

The following metrics are defined in the spec but deferred to future implementation:

resolver_queue_lag_seconds (Gauge) - queue depth monitoring

resolver_dlq_depth (Gauge) - dead letter queue depth

resolver_relinks_total (Counter) - relink tracking

resolver_manual_overrides_total (Counter) - manual override tracking

resolver_candidate_overflow_total (Counter) - overflow tracking

resolver_evidence_truncated_total (Counter) - evidence truncation tracking

B4) Writer price variance metrics

Implementation: apps/harvester/src/writer/metrics.ts

Price variance checking belongs in the writer, not the resolver.
The resolver operates on identity matching; price safety is a writer concern.

writer_prices_written_total (Counter)

Total prices written to database.

Labels: source_kind

writer_price_variance_exceeded_total (Counter)

Prices exceeding variance threshold (default: 30%).

Labels: source_kind, variance_bucket, action

variance_bucket: 0-10%, 10-25%, 25-50%, 50-100%, >100%

action: ACCEPTED, QUARANTINED, CLAMPED

writer_price_delta_pct (Histogram)

Price change percentage distribution.

Buckets: 10, 25, 50, 100, 200, 500%

B5) Database metrics (Future)

These metrics are defined but not yet implemented:

resolver_db_query_ms (Histogram)

Label queryName: candidate_lookup, product_links_upsert, products_select_or_create, alias_resolution

resolver_db_errors_total (Counter)

Label errorClass: deadlock, timeout, serialization, constraint, other

Appendix C: Alert Definitions (Normative)

Alerts MUST be defined using the metrics above.

C1) PAGE (P0) alerts

Queue lag

p95 queue lag > 900s for 10 minutes

DLQ depth

DLQ depth > 500 for 10 minutes

System error rate

system errors / decisions > 1% for 10 minutes

Evidence write failure

repeated DB constraint errors indicating oversized rows

Worker crash loop

restart rate or CPU saturation sustained

These alerts MUST page on-call.

C2) WARN (P1) alerts

Queue lag

p95 > 300s for 10 minutes

DLQ depth

100 for 10 minutes

Relink spike

daily relink rate > 1%

Candidate overflow spike

overflow rate > 3× baseline

Manual override spike

MANUAL writes +100/day or abnormal slope

WARN alerts MUST notify but not page.

C3) Alert hygiene requirements

Alerts MUST include runbook links.

Alerts MUST identify resolverVersion and sourceId scope.

Alerts MUST be reviewed quarterly.
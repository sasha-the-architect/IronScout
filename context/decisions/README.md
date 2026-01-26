# Architectural Decision Records (ADRs)

This folder contains **Architectural Decision Records** for IronScout.

ADRs capture **why a decision was made**, not just what the system looks like today.  
They exist to prevent re-litigating settled questions as the product evolves.

If a question has already been decided and documented here, it should not be reopened without a new ADR.

---

## What Belongs in an ADR

An ADR is required when a decision:

- Has long-term architectural impact
- Introduces constraints that are hard to reverse
- Trades off correctness, trust, or operability
- Changes how multiple systems interact
- Resolves ambiguity that would otherwise resurface

Examples:
- Why tier enforcement is server-side only
- Why ingestion scheduling is singleton in v1
- Why AI explanations are assistive and optional
- Why dealers do not receive pricing recommendations

If the decision affects trust boundaries, it **must** be documented.

---

## What Does *Not* Belong in an ADR

Do not write ADRs for:
- Temporary implementation details
- Bugs or fixes
- Minor refactors
- Obvious defaults with no meaningful tradeoff

ADRs are not change logs.

---

## ADR Lifecycle

1. **Proposed**
   - Decision under consideration
   - Alternatives evaluated
   - Tradeoffs documented

2. **Accepted**
   - Decision is final
   - System is built to this constraint

3. **Superseded**
   - A newer ADR replaces this one
   - Original ADR remains immutable

ADRs are never edited after acceptance.  
They are only superseded.

---

## ADR Rules and Governance

### Authority
- **Accepted ADRs are binding.**
- Accepted ADRs override all internal documents, including specifications, UX charters, examples, and reference material.
- Public-facing promises override ADRs. If a conflict exists, the ADR must be updated or superseded.

### Lifecycle States
Each ADR must declare exactly one state:

- **Proposed** – Draft. Not authoritative.
- **Accepted** – Binding decision. Highest internal authority.
- **Rejected** – Considered and explicitly declined.
- **Superseded** – Replaced by a newer ADR.
- **Deprecated** – No longer applicable but not directly replaced.

Only **Accepted** ADRs are authoritative.

### Supersession Rules
- Supersession must be explicit.
- A superseding ADR must include `Supersedes: ADR-XXX`.
- Partial supersession must be clearly scoped.
- Multiple ADRs may be superseded by a single ADR.
- Superseded ADRs remain for historical context but have no authority.

### Numbering
- ADRs use strictly sequential, unique integers.
- Numbers are immutable once assigned.
- Suffixes (e.g. `011A`) are not allowed.
- Abandoned numbers are not reused.
- Renumbering existing ADRs is forbidden.

### Required ADR Structure
Every ADR must include the following sections:

- **Context** – The problem being addressed.
- **Decision** – The binding decision.
- **Rationale** – Why this decision was made.
- **Consequences** – Tradeoffs and downstream impact.
- **Supersedes** – ADRs replaced, if any.
- **Affected Documents** – Specs, UX, or systems impacted.

### Decision vs Plan
- ADRs capture **decisions**, not implementation plans.
- Roadmaps, phases, and execution plans belong elsewhere unless they impose binding constraints.
- If a plan creates a constraint, that constraint must be captured as a decision.

### Conflict Resolution
- If an ADR conflicts with any other internal document, **the ADR wins**.
- Conflicts with public promises require an ADR update or a superseding ADR.

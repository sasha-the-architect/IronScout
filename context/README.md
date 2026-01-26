# Context README

This folder contains the authoritative context for the IronScout system.  
It is designed to be consumed by humans and LLMs. Structure and precedence are explicit.

## What IronScout Is
IronScout is a research-first system. It provides structured intelligence, not recommendations, verdicts, or purchase advice. The system surfaces facts, comparisons, and tradeoffs while preserving user agency.

## How to Read This Context
Not all documents are equal. Authority is determined by document type and status, not filename order alone.

When documents conflict, **precedence rules apply**. Lower-precedence documents must yield without interpretation.

## Document Precedence (Highest → Lowest)

1. **`00_public_promises.md`**  
   External ceiling. Public commitments. Nothing may violate these.

2. **`02_v1_scope_and_cut_list.md`**  
   **`03_release_criteria.md`**  
   Shipping gates. Define what must and must not ship.

3. **Accepted ADRs (`context/decisions/`)**  
   Binding internal decisions. Override all non-public documents.

4. **`06_ux_charter.md`**  
   UX principles and constraints, unless explicitly superseded by an Accepted ADR.

5. **`apps/`**  
   Application-level behavior and product logic.

6. **`architecture/`**  
   System mechanics, implementation details, and infrastructure design.

7. **`reference/`**  
   Contracts, schemas, market context, and supporting material. Informational only.

8. **`examples/`**  
   Illustrative, non-authoritative examples. Do not infer requirements.

9. **`archive/`**  
   Historical material. No authority. Use only if explicitly requested.

## Decisions (ADRs)
Architectural Decision Records live in `context/decisions/`.

- Only **Accepted** ADRs are authoritative.
- ADRs override specs, UX docs, examples, and reference material.
- Public promises override ADRs.
- Superseded ADRs are retained for history only.

See `context/decisions/README.md` for full ADR rules and governance.

## Canonical vs Non-Canonical
- Canonical: public promises, scope, release criteria, accepted ADRs.
- Non-canonical: reference, examples, archive.

If a document is not explicitly canonical, assume it is advisory.

## Conflict Handling
If two documents disagree:
- Follow the precedence ladder.
- Do not average or merge intent.
- Call out the conflict explicitly if surfaced.

## Usage Guidance for LLMs
- Prefer higher-precedence documents.
- Ignore archive unless explicitly instructed.
- Treat examples as illustrative only.
- Ask for clarification if canonical sources conflict.

This README is the authority map.  
All other documents derive meaning from it.
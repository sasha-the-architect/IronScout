# Review Queue UI v1

## Goal

Define admin review-queue UI behaviors needed for correct, low-risk linking.

## Non-Goals

- Resolver scoring changes (harvester-side).
- Bulk review actions.

## Quick Link CTA Label

The quick-link action must identify the target product clearly and avoid opaque
fingerprint keys.

**Label format:**
- `Link to {ProductName} : {UPC|UPC unknown}`

**Overflow behavior:**
- If product name is too long, truncate with ellipsis and show a tooltip with
  the full name.

**Fallbacks:**
- If product name is missing, display `Unknown product`.
- If UPC is missing, display `UPC unknown`.

## Match Candidate UPC Label

Each match candidate card must show a UPC label under the title:
- `UPC: <value>` when present
- `UPC: unknown` when missing

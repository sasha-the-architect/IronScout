# Search Results Migration Guide (Updated)

Status: Updated to reflect current implementation.

**From:** v1 single-retailer cards
**To:** Search Results UX Spec (v2 summary model)

---

## Summary of Changes

### Philosophy Shift

| v1 | v2 (current) |
|----|-----|
| Single-retailer focus per card | Multi-retailer summary per card |
| "Best price" highlighting | No visual hierarchy by price |
| Navigate to compare | Compare without leaving results |
| Dense grid shows one retailer | Grid shows retailer count, panel shows detail |

### Key Changes

| Area | Current (v1) | New (v2) |
|------|--------------|----------|
| Card CTA | "View at {Retailer}" | "Compare {N} prices" |
| Card content | Single price + retailer | Summary: lowest price + range |
| Best price badge | `isBestPrice` crown/scale | Removed entirely |
| Grid retailer column | Single retailer name | "{N} retailers" count |
| Multi-retailer view | Navigate to PDP | RetailerPanel drawer |

---

## Component Mapping

### ResultCard → ResultCardV2

| v1 Prop | v2 Prop | Notes |
|---------|---------|-------|
| `pricePerRound` | (via retailers[0]) | Computed from retailer array |
| `totalPrice` | (via retailers[0]) | Computed from retailer array |
| `retailerName` | (via retailers[]) | Used in panel |
| `retailerUrl` | (via retailers[]) | Used in panel |
| `isBestPrice` | **REMOVED** | Violates neutrality |
| `badges` | **REMOVED** | Context badges removed |
| `updatedAt` | **REMOVED** | Creates urgency |
| — | `retailers: RetailerPrice[]` | **NEW** - full retailer list |
| — | `onCompareClick` | **NEW** - opens panel |

### ResultRow → ResultRowV2

| v1 Prop | v2 Prop | Notes |
|---------|---------|-------|
| `pricePerRound` | `lowestPricePerRound` | Renamed for clarity |
| `totalPrice` | **REMOVED** | Available in panel |
| `retailerName` | **REMOVED** | Replaced with count |
| `retailerUrl` | **REMOVED** | Via panel |
| `inStock` | `anyInStock` | Now reflects any retailer |
| — | `retailerCount` | **NEW** |
| — | `onCompareClick` | **NEW** |

### New Component: RetailerPanel

Component for multi-retailer comparison.

Location: `apps/web/components/results/retailer-panel.tsx`

---

## Data Changes

### API Response

Current product response:
```typescript
interface Product {
  prices: Price[]  // Multiple prices but rendered as single
}
```

Required for v2:
```typescript
interface ProductWithRetailers {
  retailers: RetailerPrice[]  // Explicitly multi-retailer
}

interface RetailerPrice {
  retailerId: string
  retailerName: string
  pricePerRound: number
  totalPrice: number
  inStock: boolean
  shippingInfo: ShippingInfo
  url: string
}
```

The current `prices` array can be mapped to `retailers`. Shipping info enrichment may be needed.

### Shipping Info

Current: `includesShipping: boolean`

Required: Richer `ShippingInfo` type:
```typescript
type ShippingInfo =
  | { type: 'included' }
  | { type: 'excluded'; amount: number }
  | { type: 'excluded_unknown' }
  | { type: 'free_over'; threshold: number }
  | { type: 'pickup_only' }
  | { type: 'unknown' }
```

If shipping data is unavailable, default to `{ type: 'unknown' }`.

---

## Removal Checklist

Before merging, verify these are removed:

### From Cards
- [ ] `isBestPrice` prop and scaling effect
- [ ] Crown/highlight on "best" card
- [ ] `badges` prop (CardBadge array)
- [ ] Price context ("Low", "Typical", "High")
- [ ] Timestamp display ("10m ago")
- [ ] Single "View at {Retailer}" CTA pattern

### From Grid
- [ ] Per-row retailer name column
- [ ] Per-row retailer URL link
- [ ] Single-retailer assumption

### From Language
- [ ] "Best price"
- [ ] "Deal" / "Great deal"
- [ ] "Save $X"
- [ ] "Lowest we've seen"
- [ ] "Limited stock" (use "Out of Stock" only)

---

## Migration Status

### Phase 1: Create New Components (Done)
1. Create `RetailerPanel` component
2. Create `ResultCardV2` with summary model
3. Create `ResultRowV2` with retailer count

### Phase 2: Update Data Flow (Partial)
1. Ensure products have full retailer array
2. Add `ShippingInfo` to price/retailer data
3. Update API responses if needed

### Phase 3: Wire Up Panel (Done)
1. Add panel state to `SearchResultsGridV2`
2. Connect card/row "Compare" actions to panel
3. Implement sort/filter in panel

### Phase 4: Replace Components (Partial)
1. SearchResultsGridV2 is active in search results
2. Legacy components still exist for other surfaces

### Phase 5: Cleanup (Pending)
1. Remove unused props from types
2. Update tests
3. Remove old component files

---

## Testing Considerations

### New Test Cases

1. **Multi-retailer summary**
   - Lowest price and range render correctly
   - Retailer count matches offers

2. **Retailer panel**
   - Opens on Compare click
   - Sorts correctly
   - Filters OOS
   - All retailers visible

3. **No recommendation signals**
   - No "best" highlighting
   - No badges implying judgment
   - Sort is user-controlled

### Removed Test Cases

- `isBestPrice` rendering
- Badge display tests
- Single-retailer CTA tests


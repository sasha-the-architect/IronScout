# Search Results Migration Guide

**From:** Current implementation (v1)
**To:** Search Results UX Spec (v2)

---

## Summary of Changes

### Philosophy Shift

| v1 | v2 |
|----|-----|
| Single-retailer focus per card | Multi-retailer comparison inline |
| "Best price" highlighting | No visual hierarchy by price |
| Navigate to compare | Compare without leaving results |
| Dense grid shows one retailer | Grid shows retailer count, panel shows detail |

### Key Changes

| Area | Current (v1) | New (v2) |
|------|--------------|----------|
| Card CTA | "View at {Retailer}" | "Compare {N} prices" |
| Card content | Single price + retailer | Up to 3 retailer rows inline |
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
| `retailerName` | (via retailers[]) | Now shows multiple |
| `retailerUrl` | (via retailers[]) | Per-retailer |
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

Creates new component for multi-retailer comparison.

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

The current `prices` array can be mapped to `retailers`, but shipping info enrichment may be needed.

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

## Migration Steps

### Phase 1: Create New Components
1. Create `RetailerPanel` component
2. Create `RetailerRow` component (for panel)
3. Create `ResultCardV2` with inline retailers
4. Create `ResultRowV2` with retailer count

### Phase 2: Update Data Flow
1. Ensure products have full retailer array
2. Add `ShippingInfo` to price/retailer data
3. Update API responses if needed

### Phase 3: Wire Up Panel
1. Add panel state to `SearchResultsGrid`
2. Connect card/row "Compare" actions to panel
3. Implement sort/filter in panel

### Phase 4: Replace Components
1. Swap `ResultCard` → `ResultCardV2`
2. Swap `ResultRow` → `ResultRowV2`
3. Remove old components
4. Rename v2 components (drop suffix)

### Phase 5: Cleanup
1. Remove unused props from types
2. Update tests
3. Remove old component files

---

## Testing Considerations

### New Test Cases

1. **Multi-retailer display**
   - 1 retailer: no overflow
   - 2-3 retailers: all inline
   - 4+ retailers: overflow with count

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

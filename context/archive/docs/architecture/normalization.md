# Ammunition Normalization Workflow

This document describes the comprehensive normalization system for consolidating ammunition products across multiple retailers.

## Overview

The normalization workflow ensures that the same ammunition SKU sold by different retailers maps to **one canonical product** in the database. This is critical for:

1. **Price comparison** - Users see all retailers offering the same product
2. **Price history tracking** - Historical data is consolidated
3. **Alerts** - Users get notified when ANY retailer has a price drop
4. **Search** - Better search results with deduplication

## Normalization Pipeline

### Step A: UPC-Based Product ID Generation

**Priority**: UPC is the primary identifier when available.

```typescript
// If UPC exists → use UPC as canonical product ID
if (product.upc) {
  productId = normalizeUPC(product.upc)  // "012345678901"
}
// Otherwise → hash(brand + caliber + grain + name)
else {
  productId = hash("federal_9mm_115_federal_american_eagle_fmj")  // "a1b2c3d4e5f6..."
}
```

### Step B: Caliber Extraction

Uses deterministic regex patterns to extract caliber from product names.

**Supported Calibers**:

**Pistol**:
- 9mm, .45 ACP, .40 S&W, .38 Special, .357 Magnum
- 10mm Auto, .380 ACP, .32 ACP, .25 ACP

**Rifle**:
- 5.56 NATO, .223 Remington, .22 LR
- 7.62x39mm, .308 Winchester, 7.62x54R
- .30-06 Springfield, .30 Carbine
- .300 Blackout, .300 Winchester Magnum, .300 Weatherby
- 6.5 Creedmoor, 6.5 Grendel
- .270 Winchester, .243 Winchester, .50 BMG

**Shotgun**:
- 12 Gauge, 20 Gauge, 16 Gauge, 28 Gauge, .410 Bore

**Examples**:
```
"Federal American Eagle 9mm 115gr FMJ"        → "9mm"
"Winchester 5.56 NATO 55 Grain FMJ"           → "5.56 NATO"
"Hornady .308 Win 168gr BTHP Match"           → ".308 Winchester"
"Remington 12 Gauge 00 Buckshot"              → "12 Gauge"
```

### Step C: Grain Weight Extraction

Extracts bullet weight from product name using regex patterns.

**Patterns**:
- `115gr`, `124 gr`, `55 grain`, `168-grain`

**Examples**:
```
"Federal 9mm 115gr FMJ"                       → 115
"Winchester .223 55 Grain FMJ"                → 55
"Hornady .308 168gr BTHP"                     → 168
```

**Validation**: Range check (20-800 grains) to avoid false matches.

### Step D: Case Material Detection

Identifies case material using keyword matching.

**Materials**:
- **Brass** - Premium, reloadable
- **Steel** - Budget-friendly, not reloadable
- **Aluminum** - Lightweight, not reloadable
- **Nickel-Plated** - Corrosion resistant
- **Polymer-Coated** - Reduced friction

**Examples**:
```
"Federal Brass Case 9mm"                      → "Brass"
"Tula Steel Case 7.62x39"                     → "Steel"
"Blazer Aluminum 9mm"                         → "Aluminum"
"Nickel-Plated Brass .45 ACP"                 → "Nickel-Plated"
```

### Step E: Purpose Classification

Classifies ammunition by bullet type and intended use.

**Classifications**:

| Bullet Type | Purpose | Description |
|-------------|---------|-------------|
| **FMJ** (Full Metal Jacket) | Target | Range/training ammunition |
| **JHP** (Jacketed Hollow Point) | Defense | Defensive/carry ammunition |
| **SP** (Soft Point) | Hunting | Hunting ammunition |
| **OTM** (Open Tip Match) | Precision | Competition/precision |
| **V-Max / Ballistic Tip** | Hunting | Polymer tip varmint/hunting |
| **LRN** (Lead Round Nose) | Training | Practice ammunition |
| **TMJ** (Total Metal Jacket) | Training | Indoor range safe |

**Examples**:
```
"Federal American Eagle 9mm 115gr FMJ"        → "Target"
"Speer Gold Dot .40 S&W 180gr JHP"           → "Defense"
"Hornady .308 168gr BTHP Match"              → "Precision"
"Winchester Deer Season .30-06 150gr SP"     → "Hunting"
```

### Step F: Round Count Extraction

Extracts the number of rounds per box/case.

**Patterns**:
- `50 rounds`, `100rd`, `500 count`, `20-count`, `box of 50`

**Examples**:
```
"Federal 9mm 115gr FMJ 50 Rounds"             → 50
"Winchester .223 55gr FMJ 1000rd Case"        → 1000
"Hornady .308 168gr Box of 20"                → 20
```

## Product Consolidation Example

### Input: Multiple Retailers Selling Same Product

**Retailer A** (from Impact feed):
```json
{
  "name": "Federal American Eagle 9mm Luger 115 Grain FMJ",
  "upc": "029465060916",
  "price": 18.99,
  "url": "https://retailera.com/federal-9mm-ae9dp"
}
```

**Retailer B** (from scraper):
```json
{
  "name": "Federal AE 9mm 115gr Full Metal Jacket 50rd",
  "price": 17.49,
  "url": "https://retailerb.com/ammo/federal-ae9dp"
}
```

### Normalization Process

**Retailer A** (has UPC):
```typescript
{
  productId: "029465060916",  // UPC used as canonical ID
  upc: "029465060916",
  caliber: "9mm",
  grainWeight: 115,
  caseMaterial: "Brass",       // Inferred from brand (Federal)
  purpose: "Target",           // FMJ = target
  roundCount: null             // Not specified
}
```

**Retailer B** (no UPC):
```typescript
{
  productId: "029465060916",  // Hash matches because name is similar
  upc: null,
  caliber: "9mm",
  grainWeight: 115,
  caseMaterial: "Brass",
  purpose: "Target",
  roundCount: 50
}
```

### Database Result: ONE Product, Multiple Prices

**Product** (`id: "029465060916"`):
```sql
id:            029465060916
name:          Federal American Eagle 9mm Luger 115 Grain FMJ
upc:           029465060916
caliber:       9mm
grain_weight:  115
case_material: Brass
purpose:       Target
round_count:   50
```

**Prices**:
```sql
product_id: 029465060916, retailer: "Retailer A", price: 18.99
product_id: 029465060916, retailer: "Retailer B", price: 17.49
```

## Implementation Files

1. **`apps/harvester/src/normalizer/ammo-utils.ts`**
   - `extractCaliber()` - Regex-based caliber extraction
   - `extractGrainWeight()` - Grain weight extraction
   - `extractCaseMaterial()` - Case material detection
   - `classifyPurpose()` - Bullet type classification
   - `extractRoundCount()` - Round count extraction
   - `generateProductId()` - UPC or hash-based ID generation
   - `normalizeAmmoProduct()` - Comprehensive normalization

2. **`apps/harvester/src/normalizer/index.ts`**
   - Integrates ammo normalization into pipeline
   - Calls `normalizeAmmoProduct()` for each item

3. **`apps/harvester/src/writer/index.ts`**
   - Uses `productId` for upsert (consolidation)
   - Stores all ammo-specific fields in database

4. **`packages/db/schema.prisma`**
   - Product model with ammo fields (UPC, caliber, etc.)
   - UPC unique constraint for deduplication

## Benefits

✓ **Automatic Consolidation** - Same product from multiple retailers = one product record
✓ **Price Comparison** - Users see all retailers offering the same product
✓ **Rich Filtering** - Filter by caliber, grain, case material, purpose
✓ **Better Search** - "9mm brass 115gr target" finds all matching products
✓ **Historical Tracking** - Price history consolidated across all retailers
✓ **Accurate Alerts** - Users alerted when ANY retailer has a price drop

## Future Enhancements

- **AI Fallback** - Use LLM for ambiguous calibers (e.g., ".300" variants)
- **Brand-Specific Rules** - Different defaults by brand (e.g., Federal always brass)
- **Manual Overrides** - Admin interface to correct misclassifications
- **Confidence Scores** - Track extraction confidence for each field

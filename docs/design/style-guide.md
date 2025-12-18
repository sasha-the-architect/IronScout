# Brand Style Guide

Official IronScout.ai brand guidelines for visual consistency.

## Brand Colors

### Primary Palette

**Cyan (Accent)**
- Primary: `#00C2CB`
- Used for: Logo, primary CTAs, links, focus states
- RGB: `rgb(0, 194, 203)`
- Tailwind: Custom color (define in tailwind.config)

**Dark Gray**
- Primary: `#1F2937` (gray-800)
- Secondary: `#374151` (gray-700)
- Used for: Headers, body text, dark backgrounds
- High contrast for readability

**Light Gray**
- Background: `#F9FAFB` (gray-50)
- Borders: `#E5E7EB` (gray-200)
- Muted text: `#6B7280` (gray-500)
- Used for: Backgrounds, borders, secondary text

### Semantic Colors

**Success**
- `#10B981` (green-500)
- Used for: Success messages, confirmations, positive states

**Warning**
- `#F59E0B` (amber-500)
- Used for: Warnings, cautions, important notices

**Error**
- `#EF4444` (red-500)
- Used for: Error messages, destructive actions, validation errors

**Info**
- `#3B82F6` (blue-500)
- Used for: Informational messages, helpful tips

### Tier-Specific Colors

**Free Tier**
- Badge: Gray `#6B7280`
- Background: Light gray `#F3F4F6`

**Premium Tier**
- Badge: Purple `#8B5CF6`
- Background: Purple tint `#F5F3FF`
- Highlights: Gold/amber for premium features

## Typography

### Font Family

**Primary Font**: Inter (via next/font/google)
- Clean, modern, highly readable
- Excellent for UI and body text
- Supports multiple weights

### Font Scales

**Headings**
```
h1: text-3xl (30px) or text-4xl (36px) - Main page titles
h2: text-2xl (24px) - Section headings
h3: text-xl (20px) - Subsection headings
h4: text-lg (18px) - Component headings
```

**Body Text**
```
Large: text-base (16px) - Primary body text
Normal: text-sm (14px) - Secondary text, labels
Small: text-xs (12px) - Captions, meta information
```

### Font Weights
- Regular: `400` - Body text
- Medium: `500` - Emphasized text, labels
- Semibold: `600` - Subheadings, buttons
- Bold: `700` - Headings, strong emphasis
- Black: `900` - Hero text, major headings

### Line Heights
- Tight: `1.25` - Headings
- Normal: `1.5` - Body text
- Relaxed: `1.625` - Long-form content

## Spacing

### Spacing Scale (Tailwind)

Use Tailwind's default spacing scale (4px base unit):

```
0: 0px
1: 4px
2: 8px
3: 12px
4: 16px
5: 20px
6: 24px
8: 32px
10: 40px
12: 48px
16: 64px
20: 80px
24: 96px
```

### Common Patterns

**Component Padding**
- Small: `p-3` or `p-4` (12-16px)
- Medium: `p-6` (24px)
- Large: `p-8` (32px)

**Section Spacing**
- Between sections: `space-y-6` or `space-y-8`
- Between components: `space-y-4`
- Between elements: `space-y-2` or `space-y-3`

**Container Padding**
- Mobile: `px-4` (16px)
- Desktop: `px-6` or `px-8` (24-32px)

## Logo Usage

### IronScout Logo

**Icon Logo** (Hexagonal crosshair design)
- Color: Cyan `#00C2CB`
- Minimum size: 24x24px
- Use inline SVG for flexibility
- Maintain aspect ratio

**Logo Variants**
- `logo-dark.svg` - Cyan on transparent/light backgrounds
- `logo-light.svg` - White on dark backgrounds
- `logo-wordmark-dark.svg` - Logo with "IRONSCOUT" text
- `logo-wordmark-light.svg` - Light version with text

**Clear Space**
- Minimum 8px clear space around logo
- Don't place on busy backgrounds
- Ensure sufficient contrast

## Buttons

### Button Styles

**Primary Button**
```
bg-gray-900 hover:bg-gray-800
text-white
rounded-md px-4 py-2
```

**Secondary Button**
```
bg-white border border-gray-300
text-gray-700 hover:bg-gray-50
rounded-md px-4 py-2
```

**Accent Button** (CTAs)
```
bg-[#00C2CB] hover:bg-[#00A8B0]
text-white
rounded-md px-4 py-2
```

**Ghost Button**
```
bg-transparent hover:bg-gray-100
text-gray-700
rounded-md px-4 py-2
```

**Destructive Button**
```
bg-red-600 hover:bg-red-700
text-white
rounded-md px-4 py-2
```

### Button Sizes
- Small: `text-sm px-3 py-1.5` (height: ~32px)
- Medium: `text-sm px-4 py-2` (height: ~40px)
- Large: `text-base px-6 py-3` (height: ~48px)

## Cards

### Card Styling
```
bg-white
border border-gray-200 or shadow
rounded-lg
p-6
```

### Card Variants
- Default: White background, subtle border
- Elevated: White background, shadow
- Interactive: Hover state with shadow/border change

## Forms

### Input Fields
```
border border-gray-300
rounded-md
px-3 py-2
focus:border-blue-500 focus:ring-1 focus:ring-blue-500
```

### Labels
```
text-sm font-medium text-gray-700
mb-1
```

### Error States
```
border-red-500
text-red-600
```

### Success States
```
border-green-500
text-green-600
```

## Shadows

### Shadow Scale
- Small: `shadow-sm` - Subtle depth
- Default: `shadow` - Standard card shadow
- Medium: `shadow-md` - Elevated components
- Large: `shadow-lg` - Modals, popovers

## Border Radius

### Radius Scale
- Small: `rounded` (4px) - Buttons, inputs
- Medium: `rounded-md` (6px) - Cards, containers
- Large: `rounded-lg` (8px) - Large cards, modals
- Full: `rounded-full` - Pills, avatars, circular buttons

## Iconography

**Icon Library**: Lucide React

**Icon Sizes**
- Small: `h-4 w-4` (16px)
- Medium: `h-5 w-5` (20px)
- Large: `h-6 w-6` (24px)
- XL: `h-8 w-8` (32px)

**Icon Colors**
- Default: `text-gray-400` or `text-gray-500`
- Active: `text-gray-700` or `text-gray-900`
- Accent: `text-[#00C2CB]`

## Responsive Breakpoints

```
sm: 640px   - Small tablets
md: 768px   - Tablets
lg: 1024px  - Small laptops
xl: 1280px  - Desktops
2xl: 1536px - Large desktops
```

### Mobile-First Approach
Always design for mobile first, then enhance for larger screens.

## Accessibility

### Color Contrast
- Normal text: 4.5:1 minimum
- Large text (18px+): 3:1 minimum
- UI components: 3:1 minimum

### Focus States
- Visible focus ring: `ring-2 ring-blue-500 ring-offset-2`
- Never remove focus outlines without replacement
- Keyboard navigation must be clear

### Touch Targets
- Minimum size: 44x44px
- Adequate spacing between interactive elements
- Clear visual feedback on interaction

---

*Last updated: December 18, 2025*

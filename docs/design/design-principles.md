# Design Principles

Comprehensive design checklist for IronScout.ai visual development, inspired by best practices from Stripe, Airbnb, and Linear.

## Core Design Philosophy

*   **Users First:** Prioritize user needs, workflows, and ease of use in every design decision.
*   **Meticulous Craft:** Aim for precision, polish, and high quality in every UI element and interaction.
*   **Speed & Performance:** Design for fast load times and snappy, responsive interactions.
*   **Simplicity & Clarity:** Strive for a clean, uncluttered interface. Ensure labels, instructions, and information are unambiguous.
*   **Focus & Efficiency:** Help users achieve their goals quickly and with minimal friction. Minimize unnecessary steps or distractions.
*   **Consistency:** Maintain a uniform design language (colors, typography, components, patterns) across the entire platform.
*   **Accessibility (WCAG AA+):** Design for inclusivity. Ensure sufficient color contrast, keyboard navigability, and screen reader compatibility.
*   **Opinionated Design:** Establish clear, efficient default workflows and settings, reducing decision fatigue for users.

## Design System Foundation

### Color Palette

*   [x] **Primary Brand Color:** Cyan `#00C2CB` (strategically used for CTAs, focus states, branding)
*   [x] **Neutrals:** Gray scale (gray-50 through gray-900) for text, backgrounds, borders
*   [x] **Semantic Colors:**
    *   Success: `#10B981` (green-500)
    *   Error/Destructive: `#EF4444` (red-500)
    *   Warning: `#F59E0B` (amber-500)
    *   Informational: `#3B82F6` (blue-500)
*   [ ] **Dark Mode Palette:** Create accessible dark mode color variants
*   [x] **Accessibility:** All color combinations meet WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)

See [Brand Style Guide](./style-guide.md) for complete color specifications.

### Typography Scale

*   [x] **Primary Font:** Inter (via next/font/google)
*   [x] **Type Scale:**
    *   H1: `text-3xl` (30px) or `text-4xl` (36px) - Main page titles
    *   H2: `text-2xl` (24px) - Section headings
    *   H3: `text-xl` (20px) - Subsection headings
    *   H4: `text-lg` (18px) - Component headings
    *   Body Large: `text-base` (16px) - Primary body text
    *   Body: `text-sm` (14px) - Secondary text, labels
    *   Small/Caption: `text-xs` (12px) - Meta information
*   [x] **Font Weights:** Regular (400), Medium (500), SemiBold (600), Bold (700), Black (900)
*   [x] **Line Height:** 1.25 (tight) for headings, 1.5 (normal) for body text, 1.625 (relaxed) for long-form content

### Spacing Units

*   [x] **Base Unit:** 4px (Tailwind default)
*   [x] **Spacing Scale:** 0, 1 (4px), 2 (8px), 3 (12px), 4 (16px), 5 (20px), 6 (24px), 8 (32px), 10 (40px), 12 (48px), 16 (64px), 20 (80px), 24 (96px)
*   [x] **Common Patterns:**
    *   Component padding: `p-3` to `p-8` depending on size
    *   Section spacing: `space-y-6` or `space-y-8`
    *   Between components: `space-y-4`
    *   Between elements: `space-y-2` or `space-y-3`

### Border Radii

*   [x] **Small:** `rounded` (4px) - Buttons, inputs
*   [x] **Medium:** `rounded-md` (6px) - Cards, containers
*   [x] **Large:** `rounded-lg` (8px) - Large cards, modals
*   [x] **Full:** `rounded-full` - Pills, avatars, circular buttons

## Core UI Components

All components must have consistent states: default, hover, active, focus, disabled.

### Buttons

*   [x] **Primary:** Main call-to-action (`bg-gray-900 hover:bg-gray-800`)
*   [x] **Secondary:** Alternative actions (`bg-white border border-gray-300`)
*   [x] **Accent:** Premium/important CTAs (`bg-[#00C2CB] hover:bg-[#00A8B0]`)
*   [x] **Ghost/Tertiary:** Subtle actions (`bg-transparent hover:bg-gray-100`)
*   [x] **Destructive:** Delete/remove (`bg-red-600 hover:bg-red-700`)
*   [x] **Minimum height:** 44px for touch targets (40px medium, 48px large)
*   [x] **Icon support:** Buttons with leading/trailing icons

### Input Fields

*   [x] **Types:** Text, textarea, select, date picker, number
*   [x] **Clear labels:** Always above inputs
*   [x] **Placeholders:** Provide example values when helpful
*   [x] **Helper text:** Descriptions below inputs when needed
*   [x] **Error messages:** Inline validation with clear, actionable messages
*   [x] **Focus states:** `focus:border-blue-500 focus:ring-1 focus:ring-blue-500`
*   [x] **Disabled state:** Clear visual distinction

### Forms

*   [x] Clear labels above inputs
*   [x] Inline validation with helpful messages
*   [x] Required field indicators
*   [x] Disabled state styling
*   [x] Focus states clearly visible
*   [x] Logical grouping of related fields
*   [x] Progressive disclosure for advanced options

### Checkboxes, Radio Buttons & Toggles

*   [x] Clear visual states (unchecked, checked, indeterminate for checkboxes)
*   [x] Large enough touch targets (minimum 44x44px)
*   [x] Labels clearly associated with controls

### Cards

*   [x] Consistent padding (`p-6` default)
*   [x] Clear visual boundaries (border or shadow)
*   [x] Proper spacing between elements
*   [x] Hover states for interactive cards
*   [x] White background with subtle border or shadow for elevation

### Data Tables

See [Module-Specific Guidelines](#data-tables-module) below for comprehensive table design.

### Navigation Elements

*   [x] **Sidebar:** Persistent left sidebar for primary navigation
*   [x] **Tabs:** For secondary navigation within modules
*   [x] **Breadcrumbs:** For deep navigation hierarchies
*   [x] **Clear active states:** Visual indicator for current location

### Badges/Tags

*   [x] Color-coded for semantic meaning (status, tier, category)
*   [x] Small, compact design
*   [x] Consistent styling across platform

### Tooltips

*   [x] Contextual help for icons and abbreviated text
*   [x] Appear on hover with slight delay
*   [x] Concise, helpful content

### Progress Indicators

*   [x] **Spinners:** For in-component loading
*   [x] **Progress bars:** For multi-step processes
*   [x] **Skeleton screens:** For page-level loading

### Icons

*   [x] **Single icon set:** Lucide React
*   [x] **Consistent sizes:** 16px (h-4 w-4), 20px (h-5 w-5), 24px (h-6 w-6), 32px (h-8 w-8)
*   [x] **Color matching:** Icons inherit text color
*   [x] **Accessibility:** Provide aria-labels or alt text

### Avatars

*   [x] Circular shape (`rounded-full`)
*   [x] Fallback to initials when no image
*   [x] Consistent sizes across platform

## Layout & Visual Hierarchy

### Responsive Grid System

*   [x] 12-column grid using Tailwind utilities
*   [x] Consistent gutter spacing
*   [x] Mobile-first responsive design
*   [x] Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px)

### Strategic White Space

*   [x] Ample negative space to reduce cognitive load
*   [x] Clear visual separation between sections
*   [x] Breathing room around key elements

### Visual Hierarchy

*   [x] Typography: Size, weight, and color to establish hierarchy
*   [x] Spacing: Proximity to group related elements
*   [x] Positioning: Important elements positioned prominently
*   [x] Color: Strategic use of accent color for emphasis

### Main Dashboard Layout

*   [x] **Persistent Left Sidebar:** Primary navigation between modules
*   [x] **Content Area:** Main space for module-specific interfaces
*   [x] **Top Bar:** Global search, user profile, notifications
*   [x] **Mobile adaptation:** Collapsible sidebar, hamburger menu

## Interaction Design & Micro-interactions

### Purposeful Animations

*   [x] Subtle visual feedback for user actions (hovers, clicks, submissions)
*   [x] Immediate and clear feedback
*   [x] Quick animations (150-300ms)
*   [x] Appropriate easing (`ease-in-out` for most transitions)
*   [x] Respect `prefers-reduced-motion` media query

### Loading States

*   [x] **Skeleton screens:** For page-level loading
*   [x] **Spinners:** For in-component actions
*   [x] **Progress indicators:** For multi-step processes
*   [x] Clear indication that content is loading

### Transitions

*   [x] Smooth transitions for state changes
*   [x] Modal appearances with fade + scale
*   [x] Section expansions with slide
*   [x] Avoid jarring or distracting motion

### Keyboard Navigation

*   [x] All interactive elements keyboard accessible
*   [x] Clear focus states (`ring-2 ring-blue-500 ring-offset-2`)
*   [x] Logical tab order
*   [x] Keyboard shortcuts for common actions (where applicable)

## Module-Specific Design Guidelines

### Admin Dashboard & Dealer Portal

*   [x] **Clean, professional interface**
*   [x] **Clear information hierarchy**
*   [x] **Quick access to common tasks**
*   [x] **Status indicators:** Color-coded badges for dealer status, feed health
*   [x] **Action buttons:** Clear, prominent placement
*   [x] **Contextual information:** Metadata displayed alongside primary content

### Data Tables Module

Used in dealer management, contact lists, SKU management, etc.

#### Readability & Scannability

*   [x] **Smart alignment:** Left-align text, right-align numbers
*   [x] **Clear headers:** Bold, distinguished from body rows
*   [x] **Zebra striping:** Optional for dense tables (improves scannability)
*   [x] **Legible typography:** Clean sans-serif font
*   [x] **Adequate row height:** Minimum 44px for touch, comfortable spacing
*   [x] **Consistent cell padding:** Visual breathing room

#### Interactive Controls

*   [x] **Column sorting:** Clickable headers with sort indicators (↑↓)
*   [x] **Filtering:** Accessible filter controls (dropdowns, inputs) above table
*   [x] **Global search:** Search across all table data
*   [x] **Bulk actions:** Checkboxes for row selection, contextual action toolbar

#### Large Datasets

*   [x] **Pagination:** Preferred for admin tables (show page numbers, rows per page)
*   [ ] **Virtual scrolling:** For extremely large datasets (if needed)
*   [x] **Sticky headers:** Keep column headers visible while scrolling
*   [ ] **Frozen columns:** For wide tables with key identifier column (if needed)

#### Row Interactions

*   [x] **Expandable rows:** For detailed information without navigation
*   [x] **Inline editing:** Quick modifications without modal
*   [x] **Action buttons per row:** Edit, Delete, View Details (clearly distinguishable)
*   [x] **Hover states:** Subtle highlight on row hover

### Configuration Panels Module

Used in dealer settings, admin settings, microsite configuration.

#### Clarity & Simplicity

*   [x] **Clear, unambiguous labels** for all settings
*   [x] **Concise helper text** or tooltips for descriptions
*   [x] **Avoid jargon:** Use plain language
*   [x] **Logical grouping:** Related settings in sections or tabs
*   [x] **Progressive disclosure:** Hide advanced settings by default (accordions, toggles)

#### Appropriate Input Types

*   [x] Use correct form controls (text, checkbox, toggle, select, slider)
*   [x] **Toggles** for on/off settings
*   [x] **Selects** for limited options
*   [x] **Text inputs** for free-form data
*   [x] **Sliders** for numeric ranges (with visible value)

#### Visual Feedback

*   [x] **Immediate confirmation:** Toast notifications or inline messages for saved changes
*   [x] **Clear error messages:** Actionable guidance for invalid inputs
*   [x] **Validation:** Real-time or on-blur validation where appropriate

#### Defaults & Reset

*   [x] **Sensible defaults:** Pre-populate with recommended values
*   [x] **Reset to defaults:** Easy way to revert to original settings
*   [x] **Unsaved changes warning:** Prompt if user navigates away with unsaved changes

#### Preview (where applicable)

*   [ ] **Live preview:** Show real-time preview of changes (e.g., microsite customization)
*   [ ] **Before/after comparison:** Visual comparison of changes

## Accessibility

### Color Contrast

*   [x] **Normal text:** 4.5:1 minimum
*   [x] **Large text (18px+):** 3:1 minimum
*   [x] **UI components:** 3:1 minimum
*   [x] **Test all color combinations** against WCAG AA standards

### Focus States

*   [x] **Visible focus ring:** `ring-2 ring-blue-500 ring-offset-2`
*   [x] **Never remove outlines** without accessible replacement
*   [x] **Keyboard navigation** must be clear and intuitive

### Touch Targets

*   [x] **Minimum size:** 44x44px
*   [x] **Adequate spacing** between interactive elements
*   [x] **Clear visual feedback** on interaction

### Semantic HTML

*   [x] Proper heading hierarchy (h1 → h2 → h3)
*   [x] Semantic elements (`<nav>`, `<main>`, `<article>`, `<section>`)
*   [x] ARIA labels where semantic HTML insufficient
*   [x] Form labels properly associated with inputs

### Screen Reader Compatibility

*   [x] Test with screen readers (NVDA, JAWS, VoiceOver)
*   [x] Meaningful alt text for images
*   [x] Descriptive link text (avoid "click here")
*   [x] ARIA live regions for dynamic content

## CSS & Styling Architecture

### Tailwind CSS (Utility-First)

*   [x] **Design tokens in config:** Colors, fonts, spacing defined in `tailwind.config`
*   [x] **Utility classes:** Apply directly in JSX/TSX
*   [x] **Component extraction:** Use `@apply` or React components for repeated patterns
*   [x] **Maintainability:** Keep classes organized and consistent
*   [x] **Performance:** Purge unused CSS in production

### Component Scoping

*   [x] **Scoped styles:** Use CSS modules or styled-components for component-specific styles
*   [x] **Global styles:** Minimize global CSS, use for resets and base styles only

### Performance Optimization

*   [x] **Optimize CSS delivery:** Critical CSS inline, defer non-critical
*   [x] **Minimize bundle size:** Remove unused styles
*   [x] **Use CDN for fonts:** Reduce server load

## Responsive Design

### Mobile-First Approach

*   [x] Design for mobile screens first (320px+)
*   [x] Progressively enhance for larger screens
*   [x] Test on actual devices, not just browser DevTools

### Breakpoints

*   [x] **Mobile:** 320px - 639px
*   [x] **Small tablets:** 640px - 767px (sm)
*   [x] **Tablets:** 768px - 1023px (md)
*   [x] **Small laptops:** 1024px - 1279px (lg)
*   [x] **Desktops:** 1280px - 1535px (xl)
*   [x] **Large desktops:** 1536px+ (2xl)

### Touch-Friendly Design

*   [x] Minimum 44x44px touch targets
*   [x] Adequate spacing between interactive elements
*   [x] Avoid hover-only interactions on mobile

## Testing Checklist

Before submitting visual changes:

*   [ ] **Tested on mobile viewport** (375px, 320px)
*   [ ] **Tested on tablet viewport** (768px)
*   [ ] **Tested on desktop viewport** (1440px)
*   [ ] **Verified keyboard navigation** (tab through all interactive elements)
*   [ ] **Checked color contrast ratios** (WCAG AA compliance)
*   [ ] **Tested with screen reader** (NVDA, JAWS, or VoiceOver)
*   [ ] **Validated against brand style guide** (colors, typography, spacing)
*   [ ] **No console errors** (check browser DevTools)
*   [ ] **Loading states implemented** (spinners, skeletons)
*   [ ] **Error states handled gracefully** (clear error messages)
*   [ ] **Tested with reduced motion preference** (`prefers-reduced-motion`)
*   [ ] **Cross-browser testing** (Chrome, Firefox, Safari, Edge)
*   [ ] **Touch device testing** (actual mobile/tablet if possible)
*   [ ] **Dark mode compatibility** (if implemented)

## General Best Practices

*   **Iterative Design & Testing:** Continuously test with users and iterate
*   **Clear Information Architecture:** Logical organization of content and navigation
*   **Documentation:** Maintain design system documentation
*   **Design-Development Collaboration:** Close partnership between design and engineering
*   **Component Library:** Build and maintain a shared component library
*   **Design Reviews:** Regular reviews for consistency and quality

---

*Last updated: December 18, 2025*

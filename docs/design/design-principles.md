# Design Principles

Comprehensive design checklist for IronScout.ai visual development.

## Core Principles

### 1. Consistency
- Follow established patterns across all applications
- Use consistent spacing, typography, and color schemes
- Maintain uniform component styling

### 2. Accessibility
- WCAG 2.1 AA compliance minimum
- Proper semantic HTML
- Keyboard navigation support
- Screen reader compatibility
- Color contrast ratios (4.5:1 for normal text, 3:1 for large text)

### 3. Responsive Design
- Mobile-first approach
- Breakpoints:
  - Mobile: 320px - 767px
  - Tablet: 768px - 1023px
  - Desktop: 1024px - 1439px
  - Large Desktop: 1440px+
- Touch-friendly targets (minimum 44x44px)

### 4. Performance
- Optimize images and assets
- Lazy load below-the-fold content
- Minimize layout shifts (CLS)
- Fast interaction response times

### 5. User Experience
- Clear visual hierarchy
- Intuitive navigation
- Helpful error messages
- Loading states for async operations
- Confirmation for destructive actions

## Component Guidelines

### Buttons
- Primary: Main call-to-action
- Secondary: Alternative actions
- Ghost: Tertiary actions
- Destructive: Delete/remove actions
- Minimum height: 44px for touch targets

### Forms
- Clear labels above inputs
- Inline validation with helpful messages
- Required field indicators
- Disabled state styling
- Focus states clearly visible

### Cards
- Consistent padding
- Clear visual boundaries
- Proper spacing between elements
- Hover states for interactive cards

### Typography
- Heading hierarchy: h1 → h2 → h3 → h4
- Body text: readable line height (1.5-1.6)
- Proper contrast ratios
- Responsive font sizes

## Layout Patterns

### Grid System
- Use Tailwind's built-in grid utilities
- Consistent gutter spacing
- Responsive column layouts

### Spacing Scale
- Follow Tailwind spacing scale (4px increments)
- Consistent margin/padding patterns
- Whitespace for visual breathing room

### Navigation
- Clear active state indicators
- Breadcrumbs for deep navigation
- Mobile hamburger menu for small screens

## Color Usage

See [Brand Style Guide](./style-guide.md) for specific color values.

### Semantic Colors
- **Success**: Green tones for confirmations
- **Warning**: Yellow/Orange for cautions
- **Error**: Red tones for errors
- **Info**: Blue tones for informational messages

### State Colors
- **Default**: Standard UI state
- **Hover**: Interactive feedback
- **Active**: Currently selected
- **Disabled**: Non-interactive elements
- **Focus**: Keyboard focus indicator

## Iconography

- Use Lucide React icon library
- Consistent icon sizes (16px, 20px, 24px)
- Match icon color to surrounding text
- Provide alt text or aria-labels

## Animation

- Subtle, purposeful animations
- Respect `prefers-reduced-motion`
- Typical duration: 150-300ms
- Use CSS transitions for simple effects
- Framer Motion for complex animations

## Testing Checklist

Before submitting visual changes:

- [ ] Tested on mobile viewport (375px)
- [ ] Tested on tablet viewport (768px)
- [ ] Tested on desktop viewport (1440px)
- [ ] Verified keyboard navigation
- [ ] Checked color contrast ratios
- [ ] Tested with screen reader
- [ ] Validated against brand style guide
- [ ] No console errors
- [ ] Loading states implemented
- [ ] Error states handled gracefully

---

*Last updated: December 18, 2025*

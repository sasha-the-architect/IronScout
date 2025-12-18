## Visual Development & Design

### Design Principles

When making visual (front-end, UI/UX) changes, always refer to design documentation:

- **Design Checklist**: `docs/design/design-principles.md` - Comprehensive design guidelines
- **Brand Style Guide**: `docs/design/style-guide.md` - Brand colors, typography, spacing

**IMPORTANT**: Check these files before implementing any UI/UX changes to ensure consistency.

### Quick Visual Check

**IMMEDIATELY** after implementing any front-end change, perform this verification:

1. **Identify what changed** - Review the modified components/pages
2. **Navigate to affected pages** - Use `mcp__playwright__browser_navigate` to visit each changed view
3. **Verify design compliance** - Compare against `docs/design/design-principles.md` and `docs/design/style-guide.md`
4. **Validate feature implementation** - Ensure the change fulfills the user's specific request
5. **Check acceptance criteria** - Review any provided context files or requirements
6. **Capture evidence** - Take full page screenshot at desktop viewport (1440px) of each changed view
7. **Check for errors** - Run `mcp__playwright__browser_console_messages`

This verification ensures changes meet design standards and user requirements.

### Comprehensive Design Review

Invoke the `@agent-design-review` subagent for thorough design validation when:

- Completing significant UI/UX features
- Before finalizing PRs with visual changes
- Needing comprehensive accessibility and responsiveness testing

The design review agent will validate:
- Visual consistency with brand guidelines
- Responsive design across viewports
- Accessibility compliance (WCAG)
- Cross-browser compatibility
- User experience patterns
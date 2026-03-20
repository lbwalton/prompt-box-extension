# Changelog

## [3.0.0] - 2026-03-19
### Added
- **Privacy Mode**: Prompt previews are now blurred by default to protect sensitive content like API keys. Click blurred text to peek temporarily.
- **Per-card visibility toggle**: Mark individual prompts as "Visible" so non-sensitive content stays readable. All new prompts default to hidden.
- **Privacy Shield**: One-click panic button in the header to instantly blur all prompt previews — perfect for screen sharing.
- **Dark Mode**: Full dark mode support with automatic system detection and a manual toggle button.
- **Settings Tabs**: Settings panel now organized into Tags, Import/Export, and About tabs for clearer navigation.

### Changed
- **Complete UI redesign**: New design system with CSS custom properties, Inter font, improved typography (14px base), and consistent spacing on a 4px grid.
- **Icon-based action buttons**: Copy, Edit, Delete, and Visibility actions now use SVG icons instead of colored text buttons, hidden until card hover for a cleaner look.
- **SVG icons throughout**: Replaced emoji characters (⚙, ★, ☆) with cross-platform SVG icons for consistent rendering.
- **Improved empty states**: New illustrated empty states for first-time users and empty search results.
- **Search bar**: Added magnifier icon for better affordance.
- **Accessible focus states**: All interactive elements now have visible `focus-visible` outlines.
- **Buttons simplified**: Removed gradient backgrounds from secondary buttons; only the primary "+ Add" button uses the accent color.

### Removed
- Infinite pulse animation on the "+ Add" button.
- Fixed 300px max-height on the prompt list (popup now expands naturally).

## [2.1.1] - 2026-02-02
### Security
- **Secure Import**: added sanitization to prevent CSV injection and XSS from imported files.
- **Import Warning**: added a confirmation dialog when importing files to warn users of potential risks.
- **Input Validation**: implemented stricter length limits and sanitization for prompt titles and text.

## [2.1.0] - 2026-01-21
### Security
- **XSS Protection**: Added HTML escaping for all user-generated content (titles, prompts, tags) to prevent script injection.
- **Content Security Policy**: Added explicit CSP to block unauthorized scripts from running.

## [2.0.0] - 2026-01-14
### Added
- **Filter by tag**: Easily find prompts by their category.
- **Sort functionality**: Sort by Title (A-Z), Date, or Favorites.
- **Favorites**: Star your most frequently used prompts.
- **Import/Export**: Backup your prompts to CSV or import from a spreadsheet.
- **Tag Management**: create, edit, and delete custom tags.

### Fixed
- Squashed a few bugs to improve stability.
- Improved search functionality.

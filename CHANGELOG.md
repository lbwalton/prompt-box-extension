# Changelog

## [3.4.0] - 2026-07-03
### Added
- **Shortcuts now expand on Tab and Enter, not just Space.** Type your shortcut in a sign-in box and press Tab, or in a search bar and press Enter: the full text is filled in before the page acts on it.
- **Smart fallback for stubborn editors.** If a site blocks direct expansion (LinkedIn posts and other complex editors), Prompt Box retries through the site's own paste handling. As a last resort it copies the expanded prompt to your clipboard and shows a small reminder to paste it, so expansion always gets you your text.
### Fixed
- Shortcuts now work in text fields inside open shadow DOM components, which many sign-in forms and embedded widgets use.

## [3.3.0] - 2026-05-16
### Added
- **Create new tags directly from the prompt form.** Type a name in the tag picker and select "Create" to add it to your tag library without opening Settings. The picker also doubles as a search: type to filter existing tags before deciding to add or create one.

## [3.2.5] - 2026-05-16
### Changed
- **Refreshed accent colors to match the brand mark.** Primary actions are now warm orange, info and success states use a calmer teal — both pulled directly from the toolbar icon — for a more cohesive look between the icon you click and the popup that opens.

## [3.2.4] - 2026-05-16
### Fixed
- **Text expansion in email composers and other apps that use iframes**: Shortcuts now expand inside web apps that compose mail or messages inside an embedded frame, including many CRM and sales tools layered on top of Gmail. Apps that render their editor inside a closed shadow DOM still may not be reachable.

## [3.2.3] - 2026-04-18
### Changed
- **New icon**: Refreshed the extension icon with a bolder design that fills the full toolbar space. The new icon features two overlapping "P" letterforms styled like the copy icon — a nod to the core action of copying prompts — in orange and teal on an orange background.

## [3.2.2] - 2026-04-18
### Fixed
- **Text expansion in Gmail and other rich-text editors**: Fixed a "recursive execCommand" warning that could silently block expansion in pages that programmatically fire their own input events (e.g. Google Search, some mail clients).

## [3.2.1] - 2026-04-18
### Fixed
- **Text expansion now works for everyone**: Shortcuts saved to Chrome Sync (the default since v3.2.0) were not loaded by the text-expansion engine, so typing a shortcut + Space did nothing. The content script now reads from whichever storage area you've configured.
- **Text expansion in email, URL, and other input types**: Expansion now works in every text-typable field — including email, URL, tel, number, and search inputs — not just plain text fields and textareas.
- **Text expansion in Gmail, Notion, and other rich-text editors**: Fixed a bug where browsers convert spaces to non-breaking spaces inside contenteditable fields, which prevented shortcut detection.
- **Text expansion in editors that programmatically insert text**: Fixed a "recursive execCommand" error that could block expansion in pages that drive their own input events.

## [3.2.0] - 2026-03-21
### Added
- **Chrome Sync**: Your prompt library now syncs automatically across all Chrome profiles signed into the same Google account — no account or setup required. If your library is too large for Chrome Sync (100KB limit), a warning banner will appear with a link to export a CSV backup.
- **Data Loss Warning**: A notice in Settings > Import / Export now reminds you to export a backup before uninstalling or resetting Chrome.
- **About Panel**: Added a storage note explaining how your data is saved and how to protect it.

## [3.1.0] - 2026-03-19
### Added
- **Text Expansion / Shortcuts**: Assign a short keyword to any prompt (e.g. `tlb`, `myemail`). Type it anywhere on the web and press Space to instantly expand it to the full prompt text. Works in standard text inputs, textareas, and rich-text editors like Gmail and Notion.

### Known Limitations
- **Does not work on `chrome://` pages** — Chrome prevents extensions from running on its own internal pages (Settings, Extensions, etc.) for security reasons. This is a Chrome platform restriction, not something we can change.
- **Does not work in Google Docs** — Google Docs uses a canvas-based rendering engine rather than standard HTML input elements, so the extension cannot intercept keystrokes there. Google Sheets, Google Slides, and most other web apps work fine.
- **Does not work in password fields** — Intentional. Extensions cannot and should not read or modify password inputs.
- **May not work in some browser-based code editors** — Editors like CodeMirror or Monaco (used in VS Code Web) handle their own keyboard events and may not allow text replacement via standard DOM APIs.

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

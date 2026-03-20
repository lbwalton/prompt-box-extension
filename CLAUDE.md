# Prompt Box — Project Guide

## What This Is

Prompt Box is a Chrome extension (Manifest V3) that lets users store, organize, and quickly access AI prompts. All data is local-only via `chrome.storage.local` — no servers, no analytics, no external dependencies.

## Architecture

- **popup.html** — Single-file UI. All CSS is embedded in `<style>` (no external stylesheets). This is intentional for Chrome extension performance.
- **popup.js** — All popup logic: CRUD, search, filtering, sorting, import/export, tag management, changelog display.
- **background.js** — Minimal service worker: context menu ("Save to Prompt Box") and update detection.
- **manifest.json** — MV3 config. CSP: `script-src 'self'; object-src 'self'`.

There is no build step for the extension itself. The files are loaded directly by Chrome.

## Design System (v3.0)

All styling uses CSS custom properties defined in `:root` within popup.html. Dark mode is handled via `@media (prefers-color-scheme: dark)` overriding the same tokens.

Key tokens:
- Colors: `--color-bg`, `--color-surface`, `--color-accent`, `--color-danger`, `--color-text-primary`, etc.
- Spacing: 4px base unit grid
- Radii: `--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (8px), `--radius-xl` (12px), `--radius-full`
- Font: Inter via system font stack (`'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`)
- Shadows: `--shadow-sm`, `--shadow-md`

Action buttons (Copy/Edit/Delete) are ghost-style icon buttons that appear on card hover. SVG icons are defined in the `ICONS` object in popup.js.

## Security Requirements

> Full developer security guide: **[SECURITY-GUIDE.md](./SECURITY-GUIDE.md)**

These are non-negotiable — never bypass or weaken them:

- **XSS protection**: All user content rendered via `escapeHTML()`. Never use `innerHTML` with unsanitized user input.
- **CSP**: `script-src 'self'; object-src 'self'` — no inline scripts, no eval, no remote scripts.
- **Input sanitization**: `sanitizeInput()` enforces length limits (title: 200, text: 10000, tag: 50) and CSV injection prevention.
- **Import safety**: User confirmation required before CSV import. Fields starting with `=`, `+`, `-`, `@` get a prepended single quote.

## Pre-Commit Checklist

Run these before every commit:

```bash
npm run security   # Check for security issues — fix all errors before committing
npm run lint       # Check for general code issues
```

If `npm run security` reports errors, fix them before staging. Warnings should be reviewed — ignore only if you're certain they're false positives. See [SECURITY-GUIDE.md](./SECURITY-GUIDE.md) for how to interpret results.

## Data Schema (chrome.storage.local)

```
prompts: [{ id, title, text, tags[], isFavorite, createdAt, updatedAt }]
availableTags: [{ name, isDefault, isFavorite }]
filterSettings: { tagFilter, sortBy }
new_update_available: boolean
tempSelectedText: string
```

Default tags (read-only): General, Writing, Coding, Research, Creative, Business, Favorite.

## Versioning

- Version lives in `manifest.json` (`"version"` field).
- Follow semver: patch for fixes, minor for features, major for breaking changes.
- The version is also displayed in the Settings > About panel via `#appVersion`.

## Changelog — REQUIRED

**After every commit that finalizes or updates the app, update `CHANGELOG.md`.**

Format follows [Keep a Changelog](https://keepachangelog.com/):
```markdown
## [X.Y.Z] - YYYY-MM-DD
### Added / Changed / Fixed / Security / Removed
- Description of change
```

The changelog is user-facing — it's rendered inside the extension via a modal ("What's New") and in Settings > About > "View Release Notes". Write entries that make sense to end users, not just developers.

When bumping the version:
1. Update `manifest.json` version
2. Add a new section at the top of `CHANGELOG.md`
3. Update `#appVersion` text in popup.html if it's hardcoded

## Testing

No automated test suite currently. Test manually by loading the unpacked extension in `chrome://extensions/`. Key flows to verify:
- Add / edit / delete prompts
- Copy to clipboard
- Toggle favorites
- Search and filter/sort
- Tag management (add/rename/delete)
- CSV export and import
- Dark mode appearance
- Right-click "Save to Prompt Box" context menu
- Settings panel tab switching

## Files You Can Ignore

- `node_modules/`, `package.json`, `package-lock.json` — only used for eslint security scanning, not for the extension runtime.
- `build.js`, `build.sh` — build/packaging scripts, not part of the extension.
- `eslint.security.js` — security linting config.
- `icons8-gear-50.png` — legacy asset, no longer referenced (replaced by inline SVG).
- `test-auth.html` — test file, not part of core functionality.

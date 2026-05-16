# Inline Tag Creation in Prompt Form

**Status:** Approved — ready for implementation
**Date:** 2026-05-16
**Target version:** 3.3.0

## Goal

Let users create a new tag from the prompt form without opening Settings. Replace the existing `<select>` tag picker with a combobox that searches existing tags and offers an inline "Create" action when no match exists. New tags persist to the shared `availableTags` store, so they automatically appear in Settings > Tags and the top filter dropdown.

## Scope

In scope:
- The tag picker inside the Add/Edit prompt form (`#promptCategory` in popup.html).

Out of scope:
- The top filter dropdown (`#tagFilter`) — stays a plain `<select>`.
- The Settings > Tags panel — unchanged. New tags created in the combobox flow through the same store, so they appear there automatically.
- Storage schema — no changes to `availableTags` shape.

## Current behavior

The form's "Tags" group renders a `<select id="promptCategory">` populated by `updateTagDropdown()` in popup.js. Selecting an option fires `addTagToPrompt()`, which pushes the value onto `selectedTags` and resets the dropdown. Creating a new tag requires opening Settings > Tags and using `addNewTag()`.

## New behavior

Replace the `<select>` with a combobox:

```
[ text input: "Type to search or create a tag…" ]
  └─ menu (hidden by default; opens on focus/typing)
       • existing tag matches (already-selected tags hidden)
       • divider
       • + Create "<query>"   (only when query has no exact case-insensitive match)
```

### Interactions

| Trigger | Behavior |
|---|---|
| Focus input | Menu opens showing all unselected tags |
| Type | Filter menu (case-insensitive substring). If no exact match, append `+ Create "<query>"` row |
| Click existing tag | Add to `selectedTags`, clear input, keep menu open |
| Click `+ Create …` | Create tag in `availableTags`, persist, add to `selectedTags`, clear input |
| Enter | Activate highlighted row. If nothing highlighted and query is new, create |
| ↑ / ↓ | Move highlight |
| Esc | Close menu, clear input |
| Tab or click outside | Close menu |
| Empty / whitespace-only + Enter | No-op |
| Duplicate (case-insensitive) | Silently select existing tag, do not create a duplicate |

### Validation

Reuses existing sanitization rules:
- Trim leading/trailing whitespace before comparing or saving
- Max length 50 chars (matches current tag limit in `sanitizeInput`)
- Reject empty after trim

## Implementation

### HTML changes (popup.html)

Replace lines 1598-1610 (the form's Tags group):

```html
<div class="form-group">
  <label>Tags</label>
  <div class="selected-tags" id="selectedTags"></div>
  <div class="tag-combobox" id="tagCombobox">
    <input type="text"
           id="tagComboboxInput"
           class="tag-combobox-input"
           placeholder="Type to search or create a tag…"
           autocomplete="off"
           spellcheck="false">
    <div class="tag-combobox-menu" id="tagComboboxMenu" hidden role="listbox"></div>
  </div>
</div>
```

### CSS additions (popup.html `<style>`)

New rules using existing design tokens:
- `.tag-combobox` — `position: relative` (anchors menu)
- `.tag-combobox-input` — shares style with other form inputs
- `.tag-combobox-menu` — absolutely positioned below input, `--color-surface` bg, `--shadow-md`, `--radius-md`, max-height with scroll
- `.tag-combobox-option` — padding, hover/highlight bg
- `.tag-combobox-option.is-highlighted` — for keyboard nav
- `.tag-combobox-option.is-create` — accent color + `+` icon
- `.tag-combobox-divider` — 1px border between existing tags and create row

Dark mode works automatically via existing `@media (prefers-color-scheme: dark)` token overrides.

### JS changes (popup.js)

**New module-level state:**
```js
let comboboxOpen = false;
let comboboxHighlightIndex = -1;
let comboboxFilteredOptions = []; // [{ type: 'tag' | 'create', value: string }]
```

**New functions:**
- `initTagCombobox()` — wires up input listeners (focus, input, keydown, blur with delay) and document click-outside handler. Called once during init.
- `openTagComboboxMenu()` / `closeTagComboboxMenu()` — toggle visibility and reset highlight.
- `renderTagComboboxMenu(query)` — builds `comboboxFilteredOptions` from `availableTags` minus `selectedTags`, filtered by query. Appends `{ type: 'create', value: query }` if query is non-empty and has no exact case-insensitive match. Renders rows via `escapeHTML()`.
- `handleTagComboboxKeydown(e)` — arrow nav, Enter (activate), Esc (close).
- `activateTagComboboxOption(option)` — if `type === 'tag'`, add to `selectedTags`. If `type === 'create'`, create tag via shared helper, then add to `selectedTags`. Clear input, re-render menu.
- `createTagFromCombobox(name)` — trim, validate length, check for case-insensitive dup, push to `availableTags`, persist via `chrome.storage.sync.set`, refresh filter dropdown.

**Refactored functions:**
- `updateTagDropdown()` → renamed to `refreshTagSources()`. Internally calls `renderTagComboboxMenu(currentQuery)` if menu is open, and always calls `updateTagFilterDropdown()`. All current callers (`addNewTag`, `deleteTag`, `updateTagName`, etc.) call this new name.

**Removed:**
- `addTagToPrompt()` (the `<select>` change handler) is no longer needed.
- The `document.getElementById('promptCategory').addEventListener('change', addTagToPrompt)` line in init.

### Security

- All tag names and the `+ Create "<query>"` label render via `escapeHTML()`. No `innerHTML` with raw user input.
- `npm run security` must pass with no errors before commit.

### Storage sync

`availableTags` is already persisted to `chrome.storage.sync`. The settings panel reads from the same in-memory array, so a tag created in the combobox appears in Settings > Tags the next time the panel opens (no re-render needed since it lazy-renders on `showTagManagement()` → `updateTagList()`).

## Versioning

- `manifest.json`: `3.2.5` → `3.3.0` (minor — new feature)
- `popup.html`: verify no hardcoded version display needs updating (`#appVersion` is populated dynamically from manifest in current code)
- `CHANGELOG.md`: add new section at top

### CHANGELOG entry

```markdown
## [3.3.0] - 2026-05-16
### Added
- Create new tags directly from the prompt form — type a name and select "Create" to add it to your tag library without opening Settings.
```

### Store listing and privacy docs

No permission changes, no new external connections, no new data handling. `prompt-box-store-listing.md` and `prompt-box-privacy-practices.md` do not need updates.

## Manual test checklist

1. Open the form (Add new prompt) → focus tag input → menu shows all available tags.
2. Type a partial name → list filters to matches.
3. Type a name with no matches → `+ Create "<query>"` appears at the bottom.
4. Click an existing tag → chip added, input clears, menu stays open.
5. Click `+ Create "foo"` → tag created, chip added; verify it appears in Settings > Tags and in the top filter dropdown.
6. Tags already on the prompt are hidden from the menu.
7. Enter key activates highlighted row; ↑/↓ navigate; Esc closes.
8. Duplicate name (case-insensitive) selects existing tag, does not create a duplicate.
9. Whitespace-only or empty input + Enter is a no-op.
10. New tag persists across popup close/reopen (verifies `chrome.storage.sync` write).
11. Dark mode appearance matches the rest of the form.
12. `npm run security` passes with no errors.

## Risks and considerations

- **Blur vs. click race:** `blur` on the input fires before `click` on a menu row. Use `mousedown` on rows or a short blur-delay so clicks register.
- **Long tag lists:** menu uses max-height + scroll. No virtualization needed at expected list sizes (<100 tags).
- **Existing tag filter dropdown:** stays a `<select>` for now — separate change if we want consistency later.

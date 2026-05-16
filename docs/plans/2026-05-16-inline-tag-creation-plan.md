# Inline Tag Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `<select>` tag picker in the prompt form with a combobox that lets users search existing tags and create new ones inline. New tags persist to the shared `availableTags` store, so they appear in Settings > Tags and the top filter dropdown automatically.

**Architecture:** Vanilla JS, no build step. All UI lives in `popup.html` (markup + embedded CSS) and `popup.js` (logic). The combobox is a custom-built input + absolutely-positioned menu, not a library. Tag persistence reuses the existing `availableTags` array and `chrome.storage.sync.set` calls already wired into Settings > Tags.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JS/HTML/CSS, `chrome.storage.sync` for persistence.

**Spec:** `docs/specs/2026-05-16-inline-tag-creation-design.md`

**Testing model:** The project has no automated test suite (per `CLAUDE.md`). Each task ends with a manual smoke test in Chrome via `chrome://extensions/` → Reload → open popup → verify behavior. Treat smoke tests as the equivalent of a TDD "make it pass" step.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `popup.html` | Modify | Replace `<select id="promptCategory">` markup (~lines 1598-1610); add `.tag-combobox*` CSS rules in the `<style>` block |
| `popup.js` | Modify | Add combobox state + functions; rename `updateTagDropdown` → `refreshTagSources`; remove `addTagToPrompt` |
| `manifest.json` | Modify | Bump version 3.2.5 → 3.3.0 |
| `CHANGELOG.md` | Modify | Add `## [3.3.0] - 2026-05-16` section at top |

No new files are needed. All combobox styles live in the existing `<style>` block in `popup.html`, and all JS lives in `popup.js`.

---

## Task 1: Replace `<select>` with combobox markup and CSS

**Files:**
- Modify: `popup.html` (markup ~lines 1598-1610, CSS in `<style>` block — append after the `.selected-tag-remove` rules around line 1066)

- [ ] **Step 1: Replace the Tags form group markup**

In `popup.html`, find this block (around lines 1598-1610):

```html
<div class="form-group">
  <label>Tags</label>
  <div class="selected-tags" id="selectedTags"></div>
  <select id="promptCategory">
    <option value="">Select a tag...</option>
    <option value="General">General</option>
    <option value="Writing">Writing</option>
    <option value="Coding">Coding</option>
    <option value="Research">Research</option>
    <option value="Creative">Creative</option>
    <option value="Business">Business</option>
  </select>
</div>
```

Replace with:

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
           spellcheck="false"
           role="combobox"
           aria-expanded="false"
           aria-autocomplete="list"
           aria-controls="tagComboboxMenu">
    <div class="tag-combobox-menu" id="tagComboboxMenu" role="listbox" hidden></div>
  </div>
</div>
```

- [ ] **Step 2: Add combobox CSS**

In `popup.html`, after the `.selected-tag-remove:focus-visible` rule (around line 1066), insert:

```css
    /* ========================================
       Tag Combobox (in prompt form)
       ======================================== */
    .tag-combobox {
      position: relative;
    }

    .tag-combobox-input {
      width: 100%;
    }

    .tag-combobox-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      z-index: 100;
      padding: 4px 0;
    }

    .tag-combobox-menu[hidden] {
      display: none;
    }

    .tag-combobox-option {
      padding: 6px 10px;
      font-size: 13px;
      color: var(--color-text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tag-combobox-option:hover,
    .tag-combobox-option.is-highlighted {
      background: var(--color-surface-hover);
    }

    .tag-combobox-option.is-create {
      color: var(--color-accent);
      font-weight: 500;
    }

    .tag-combobox-option.is-create::before {
      content: "+";
      font-weight: 700;
      width: 12px;
      display: inline-block;
      text-align: center;
    }

    .tag-combobox-divider {
      height: 1px;
      background: var(--color-border);
      margin: 4px 0;
    }

    .tag-combobox-empty {
      padding: 8px 10px;
      font-size: 12px;
      color: var(--color-text-faint);
      font-style: italic;
    }
```

- [ ] **Step 3: Manual smoke test — markup renders**

Reload the extension in `chrome://extensions/`, open the popup, click "Add new prompt", and verify:
- The Tags label is still visible.
- Below the (empty) selected-tags row, there's a text input with placeholder "Type to search or create a tag…".
- No `<select>` is visible anymore.
- The menu div is not visible (hidden by default).
- Focusing the input shows the focus ring (orange) like other form inputs.
- Switch Chrome to dark mode (System Settings) and verify the input still looks correct.

Expected: input is styled like other form inputs in both light and dark mode. Nothing functional yet — typing does nothing.

- [ ] **Step 4: Commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
git add popup.html
git commit -m "feat: scaffold tag combobox markup and styles"
```

---

## Task 2: Render menu, open/close, refactor `updateTagDropdown`

**Files:**
- Modify: `popup.js`

This task wires up the combobox to render existing tags when focused, filter on type, and replaces all callers of `updateTagDropdown`.

- [ ] **Step 1: Add module-level state**

In `popup.js`, find this block near the top (around lines 23-26):

```js
let availableTags = [...defaultTags]; // Tags available for selection
let editingPromptId = null; // Track which prompt we're editing
let selectedTags = []; // Track selected tags for current form
let storagePref = 'sync'; // 'sync' | 'local' — loaded from chrome.storage.local on startup
```

Append after the `storagePref` line:

```js
// Tag combobox state
let comboboxOpen = false;
let comboboxHighlightIndex = -1;
let comboboxFilteredOptions = []; // [{ type: 'tag' | 'create', value: string }]
```

- [ ] **Step 2: Add combobox functions**

In `popup.js`, find the existing `updateTagDropdown` function (around line 1036) and **replace the entire function** (lines 1035-1058) with:

```js
// Refresh all UI surfaces that reflect availableTags.
// Replaces the old updateTagDropdown(); name reflects that there's no
// <select> anymore — the form uses the combobox.
function refreshTagSources() {
  if (comboboxOpen) {
    const query = document.getElementById('tagComboboxInput').value;
    renderTagComboboxMenu(query);
  }
  updateTagFilterDropdown();
}

// Open the combobox menu and render its options.
function openTagComboboxMenu() {
  comboboxOpen = true;
  comboboxHighlightIndex = -1;
  const input = document.getElementById('tagComboboxInput');
  input.setAttribute('aria-expanded', 'true');
  renderTagComboboxMenu(input.value);
}

// Close the combobox menu.
function closeTagComboboxMenu() {
  comboboxOpen = false;
  comboboxHighlightIndex = -1;
  comboboxFilteredOptions = [];
  const menu = document.getElementById('tagComboboxMenu');
  const input = document.getElementById('tagComboboxInput');
  menu.hidden = true;
  menu.innerHTML = '';
  input.setAttribute('aria-expanded', 'false');
}

// Build the list of menu options and render them.
function renderTagComboboxMenu(rawQuery) {
  const menu = document.getElementById('tagComboboxMenu');
  const query = (rawQuery || '').trim();
  const queryLower = query.toLowerCase();

  // Exclude already-selected tags
  const candidates = availableTags
    .map(t => t.name)
    .filter(name => !selectedTags.includes(name));

  // Filter by substring match if there's a query
  const matches = query
    ? candidates.filter(name => name.toLowerCase().includes(queryLower))
    : candidates;

  comboboxFilteredOptions = matches.map(name => ({ type: 'tag', value: name }));

  // Append a "Create" option if query is non-empty and has no exact case-insensitive match
  const hasExactMatch = availableTags.some(
    t => t.name.toLowerCase() === queryLower
  );
  if (query && !hasExactMatch) {
    comboboxFilteredOptions.push({ type: 'create', value: query });
  }

  // Build HTML
  if (comboboxFilteredOptions.length === 0) {
    menu.innerHTML = '<div class="tag-combobox-empty">No tags available</div>';
    menu.hidden = false;
    return;
  }

  const tagOptions = comboboxFilteredOptions.filter(o => o.type === 'tag');
  const createOption = comboboxFilteredOptions.find(o => o.type === 'create');

  let html = '';
  tagOptions.forEach((opt, i) => {
    html += `<div class="tag-combobox-option" role="option" data-index="${i}" data-type="tag" data-value="${escapeHTML(opt.value)}">${escapeHTML(opt.value)}</div>`;
  });
  if (createOption) {
    if (tagOptions.length > 0) {
      html += '<div class="tag-combobox-divider"></div>';
    }
    const createIndex = comboboxFilteredOptions.length - 1;
    html += `<div class="tag-combobox-option is-create" role="option" data-index="${createIndex}" data-type="create" data-value="${escapeHTML(createOption.value)}">Create "${escapeHTML(createOption.value)}"</div>`;
  }

  // eslint-disable-next-line no-unsanitized/property -- all interpolated values escaped via escapeHTML(); index is a number from controlled loop
  menu.innerHTML = html;
  menu.hidden = false;
}

// Wire up the combobox event listeners. Called once during setupEventListeners.
function initTagCombobox() {
  const input = document.getElementById('tagComboboxInput');
  const menu = document.getElementById('tagComboboxMenu');

  input.addEventListener('focus', openTagComboboxMenu);
  input.addEventListener('input', function () {
    if (!comboboxOpen) openTagComboboxMenu();
    else renderTagComboboxMenu(this.value);
  });
}
```

- [ ] **Step 3: Wire combobox init in `setupEventListeners`**

In `popup.js`, find this line (around line 162):

```js
  document.getElementById('promptCategory').addEventListener('change', addTagToPrompt);
```

Replace it with:

```js
  initTagCombobox();
```

- [ ] **Step 4: Rename callers of `updateTagDropdown` → `refreshTagSources`**

In `popup.js`, find and replace every call site of `updateTagDropdown()`. There are three (in `addNewTag`, `deleteTag`, `updateTagName`):

Around line 971 (`addNewTag`):
```js
    updateTagList();
    updateTagDropdown();
```
Replace `updateTagDropdown();` with `refreshTagSources();`

Around line 993 (`deleteTag`):
```js
      updateTagList();
      updateTagDropdown();
```
Replace `updateTagDropdown();` with `refreshTagSources();`

Around line 1030 (`updateTagName`):
```js
  chrome.storage.sync.set({ availableTags: availableTags });
  savePrompts(prompts, function () {
    updateTagDropdown();
```
Replace `updateTagDropdown();` with `refreshTagSources();`

- [ ] **Step 5: Remove the old `addTagToPrompt` function**

In `popup.js`, find and delete the entire `addTagToPrompt` function (around lines 1081-1093):

```js
// Add tag to current prompt being edited
function addTagToPrompt() {
  const select = document.getElementById('promptCategory');
  const selectedTag = select.value;

  if (selectedTag && !selectedTags.includes(selectedTag)) {
    selectedTags.push(selectedTag);
    updateSelectedTagsDisplay();
  }

  // Reset dropdown
  select.value = '';
}
```

- [ ] **Step 6: Manual smoke test — menu opens and filters**

Reload the extension, open the popup, click "Add new prompt", and verify:
- Click into the tag input → menu opens, shows all default tags (General, Writing, Coding, Research, Creative, Business, Favorite).
- Type `cod` → menu filters to just "Coding".
- Clear the input → menu shows all tags again.
- Type `xyz` (no match, no existing tag) → menu shows `Create "xyz"` row in accent orange.
- Type just whitespace → menu still shows all tags (query is trimmed).

Expected: menu renders correctly. Clicking options does nothing yet — that's Task 3.

- [ ] **Step 7: Verify Settings > Tags still works**

Click the gear icon → Tags panel. Add a tag named "Test123" via the existing Settings input → click Add. Then close Settings, open Add new prompt, focus the tag input. Verify "Test123" appears in the combobox menu.

Expected: tags created in Settings still flow into the combobox via `refreshTagSources()`.

- [ ] **Step 8: Commit**

```bash
git add popup.js
git commit -m "feat: render tag combobox menu and refactor tag refresh path"
```

---

## Task 3: Select existing tag (click + Enter) and hide already-selected tags

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Add option activation function**

In `popup.js`, immediately after the `initTagCombobox` function added in Task 2, append:

```js
// Activate (select or create) a combobox option.
function activateTagComboboxOption(option) {
  if (!option) return;

  if (option.type === 'tag') {
    if (!selectedTags.includes(option.value)) {
      selectedTags.push(option.value);
      updateSelectedTagsDisplay();
    }
  }
  // 'create' branch added in Task 5

  // Clear input, re-render menu (already-selected tag now hidden)
  const input = document.getElementById('tagComboboxInput');
  input.value = '';
  renderTagComboboxMenu('');
  input.focus();
}
```

- [ ] **Step 2: Wire mousedown handler on the menu**

In `popup.js`, inside `initTagCombobox`, add a mousedown listener on the menu. Update the function to:

```js
function initTagCombobox() {
  const input = document.getElementById('tagComboboxInput');
  const menu = document.getElementById('tagComboboxMenu');

  input.addEventListener('focus', openTagComboboxMenu);
  input.addEventListener('input', function () {
    if (!comboboxOpen) openTagComboboxMenu();
    else renderTagComboboxMenu(this.value);
  });

  // Use mousedown (not click) so it fires before input blur,
  // preventing a blur-close race that would swallow the selection.
  menu.addEventListener('mousedown', function (e) {
    const optionEl = e.target.closest('.tag-combobox-option');
    if (!optionEl) return;
    e.preventDefault(); // keep focus in the input
    const index = parseInt(optionEl.getAttribute('data-index'), 10);
    activateTagComboboxOption(comboboxFilteredOptions[index]);
  });

  input.addEventListener('keydown', handleTagComboboxKeydown);
}

// Handle keyboard navigation and activation in the combobox.
function handleTagComboboxKeydown(e) {
  if (!comboboxOpen) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (comboboxHighlightIndex >= 0 && comboboxFilteredOptions[comboboxHighlightIndex]) {
      activateTagComboboxOption(comboboxFilteredOptions[comboboxHighlightIndex]);
    } else if (comboboxFilteredOptions.length > 0) {
      // No explicit highlight: activate the first option
      activateTagComboboxOption(comboboxFilteredOptions[0]);
    }
  }
}
```

- [ ] **Step 3: Manual smoke test — selecting tags works**

Reload the extension, open Add new prompt, focus the tag input.

- Click "Writing" in the menu → "Writing" appears as a chip in the selected-tags row above. Input clears. Menu stays open. "Writing" is no longer in the menu.
- Click "Coding" → "Coding" added as second chip. Menu still excludes "Writing" and "Coding".
- Type `gen` → menu shows "General". Press Enter → "General" added as chip.
- Click the × on a chip → tag removed from selected, reappears in menu next time it renders (focus input again to verify).

Expected: existing tag selection works via mouse and Enter. Already-selected tags hidden from menu.

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: select existing tags from combobox via mouse and Enter"
```

---

## Task 4: Keyboard navigation (arrows, Esc) and click-outside

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Extend `handleTagComboboxKeydown` with arrow nav and Esc**

In `popup.js`, replace the `handleTagComboboxKeydown` function added in Task 3 with:

```js
function handleTagComboboxKeydown(e) {
  if (!comboboxOpen) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openTagComboboxMenu();
    }
    return;
  }

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      if (comboboxHighlightIndex >= 0 && comboboxFilteredOptions[comboboxHighlightIndex]) {
        activateTagComboboxOption(comboboxFilteredOptions[comboboxHighlightIndex]);
      } else if (comboboxFilteredOptions.length > 0) {
        activateTagComboboxOption(comboboxFilteredOptions[0]);
      }
      break;

    case 'ArrowDown':
      e.preventDefault();
      if (comboboxFilteredOptions.length === 0) return;
      comboboxHighlightIndex = (comboboxHighlightIndex + 1) % comboboxFilteredOptions.length;
      updateComboboxHighlight();
      break;

    case 'ArrowUp':
      e.preventDefault();
      if (comboboxFilteredOptions.length === 0) return;
      comboboxHighlightIndex =
        comboboxHighlightIndex <= 0
          ? comboboxFilteredOptions.length - 1
          : comboboxHighlightIndex - 1;
      updateComboboxHighlight();
      break;

    case 'Escape':
      e.preventDefault();
      closeTagComboboxMenu();
      document.getElementById('tagComboboxInput').value = '';
      break;
  }
}

// Apply the .is-highlighted class to the currently-highlighted row and scroll it into view.
function updateComboboxHighlight() {
  const menu = document.getElementById('tagComboboxMenu');
  menu.querySelectorAll('.tag-combobox-option').forEach((el, i) => {
    if (i === comboboxHighlightIndex) {
      el.classList.add('is-highlighted');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('is-highlighted');
    }
  });
}
```

- [ ] **Step 2: Wire click-outside to close**

In `popup.js`, at the end of `initTagCombobox` (just before its closing `}`), add:

```js
  // Close on click outside the combobox
  document.addEventListener('mousedown', function (e) {
    if (!comboboxOpen) return;
    const combobox = document.getElementById('tagCombobox');
    if (combobox && !combobox.contains(e.target)) {
      closeTagComboboxMenu();
    }
  });
```

- [ ] **Step 3: Manual smoke test — keyboard and click-outside**

Reload the extension, open Add new prompt, focus the tag input.

- Press ↓ → first option highlighted (orange bg).
- Press ↓ again → highlight moves down.
- Press ↑ at top → wraps to bottom.
- Press ↓ at bottom → wraps to top.
- Press Enter on highlighted option → selected as chip.
- Type unknown name, press ↓ to highlight Create row, press Enter → (won't work yet, Task 5).
- Press Esc → menu closes, input clears.
- Focus input again, press ↓ from outside (currently focused but menu closed) → menu reopens.
- Open menu, click anywhere outside the combobox (e.g., on the Title input) → menu closes.

Expected: arrow keys navigate with wraparound, Esc closes/clears, click outside closes.

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: add keyboard navigation and click-outside to tag combobox"
```

---

## Task 5: Create new tag flow

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Add `createTagFromCombobox` function**

In `popup.js`, immediately after the `activateTagComboboxOption` function, add:

```js
// Create a new tag from the combobox input. Persists to availableTags
// and refreshes all tag surfaces (combobox menu, filter dropdown, settings list if open).
// Returns the canonical tag name (existing tag name if duplicate, otherwise the new name).
function createTagFromCombobox(rawName) {
  const name = sanitizeInput(rawName, 'tag');
  if (!name) return null;

  // Case-insensitive duplicate check — if it exists, return the existing name
  const existing = availableTags.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.name;

  availableTags.push({ name: name, isDefault: false });
  chrome.storage.sync.set({ availableTags: availableTags });
  updateTagFilterDropdown();
  // If the Settings > Tags panel is currently open, refresh its list too
  const tagManagement = document.getElementById('tagManagement');
  if (tagManagement && tagManagement.style.display === 'block') {
    updateTagList();
  }
  return name;
}
```

- [ ] **Step 2: Extend `activateTagComboboxOption` with create branch**

In `popup.js`, replace the `activateTagComboboxOption` function added in Task 3 with:

```js
function activateTagComboboxOption(option) {
  if (!option) return;

  let tagName = null;

  if (option.type === 'tag') {
    tagName = option.value;
  } else if (option.type === 'create') {
    tagName = createTagFromCombobox(option.value);
    if (!tagName) return; // validation failed (empty after sanitize)
  }

  if (tagName && !selectedTags.includes(tagName)) {
    selectedTags.push(tagName);
    updateSelectedTagsDisplay();
  }

  const input = document.getElementById('tagComboboxInput');
  input.value = '';
  renderTagComboboxMenu('');
  input.focus();
}
```

- [ ] **Step 3: Manual smoke test — create flow end-to-end**

Reload the extension, open Add new prompt, focus the tag input.

- Type `marketing` (no existing match) → menu shows `Create "marketing"` row in accent orange with `+` prefix.
- Click the Create row → "marketing" appears as a chip. Input clears.
- Focus input again → "marketing" now appears as a regular option in the list (it was persisted).
- Click gear icon → Tags panel → scroll to bottom of tag list → verify "marketing" is listed with a delete button (since it's not a default).
- Close Settings, return to form, open the top filter dropdown (`#tagFilter`) → "marketing" appears there too.
- Open Add new prompt again, type `MARKETING` (different case) → no Create option appears (case-insensitive dup check works). The existing "marketing" option appears in matches.
- Press Enter on the highlighted "marketing" option → selected as chip (no duplicate created).
- Type `   ` (whitespace only) → no Create row appears (query is trimmed before check).
- Type a 60-character string → menu shows `Create "<the first 50 chars>"` because `sanitizeInput` truncates. Click → chip shows the truncated name.

Finally, save the prompt with a couple of tags. Close the popup, reopen, edit the prompt → verify the tags persisted.

Expected: new tags created inline, persisted across sessions, visible in Settings + filter, case-insensitive dup prevention, length-limited.

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: create new tags inline from prompt form combobox"
```

---

## Task 6: Version bump, changelog, security check, final QA

**Files:**
- Modify: `manifest.json`, `CHANGELOG.md`

- [ ] **Step 1: Bump manifest version**

In `manifest.json`, change:

```json
  "version": "3.2.5",
```

to:

```json
  "version": "3.3.0",
```

- [ ] **Step 2: Verify no hardcoded version in `popup.html`**

Search `popup.html` for `3.2.5`:

```bash
grep -n "3\.2\.5" popup.html
```

Expected: no matches. The Settings > About `#appVersion` is populated dynamically from `chrome.runtime.getManifest()` in `popup.js`. (If a match appears, update it to `3.3.0`.)

- [ ] **Step 3: Add CHANGELOG entry**

Open `CHANGELOG.md` and insert this section directly below the top heading (`# Changelog` or similar), above the existing topmost version section:

```markdown
## [3.3.0] - 2026-05-16
### Added
- Create new tags directly from the prompt form — type a name and select "Create" to add it to your tag library without opening Settings.
```

- [ ] **Step 4: Run security scan**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
npm run security
```

Expected: no errors. Warnings are acceptable only if they're the same pre-existing warnings present before this change (verify by checking previous commit). If any new errors appear, fix them before continuing.

- [ ] **Step 5: Final manual test pass**

Reload the extension and run through the full checklist from the spec:

1. Open Add new prompt → focus tag input → menu shows all available tags ✓
2. Type partial name → list filters ✓
3. Type unknown name → `+ Create "<query>"` appears ✓
4. Click existing tag → chip added, input clears, menu stays open ✓
5. Click Create → tag created, chip added, appears in Settings > Tags AND top filter dropdown ✓
6. Already-selected tags hidden from menu ✓
7. Enter activates highlighted (or first); ↑/↓ navigate; Esc closes ✓
8. Duplicate (case-insensitive) selects existing, no dup ✓
9. Whitespace-only / empty + Enter no-op ✓
10. New tag persists across popup close/reopen ✓
11. Dark mode looks right ✓
12. Edit an existing prompt with tags → combobox menu hides those existing tags ✓
13. Right-click "Save to Prompt Box" on selected page text still opens the form correctly (regression check) ✓
14. Settings > Tags add/rename/delete still works and reflects in combobox ✓

- [ ] **Step 6: Commit**

```bash
git add manifest.json CHANGELOG.md
git commit -m "chore: release v3.3.0 with inline tag creation"
```

- [ ] **Step 7: Notify user that the build is ready**

Output to the user:

> Version 3.3.0 is implemented and committed. Run `/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension` pack & ship flow when ready (per CLAUDE.md): security check + zip with runtime files only.

Do NOT run pack & ship automatically — that's a separate user-initiated step.

---

## Self-Review (completed)

- **Spec coverage:** Every spec section mapped to a task. Scope (combobox in form only), interactions (focus/type/click/Enter/arrows/Esc/click-outside), validation (sanitizeInput reuse, case-insensitive dup, length limit), visual (existing tokens, accent for Create, dark mode automatic), state (combobox vars), refactor (`updateTagDropdown` → `refreshTagSources`, remove `addTagToPrompt`), persistence (`availableTags` + `chrome.storage.sync`), security (`escapeHTML` on all interpolated values), versioning (3.3.0 + changelog).
- **Placeholder scan:** None. Every step has actual code or a concrete command.
- **Type consistency:** Function names match across tasks (`refreshTagSources`, `renderTagComboboxMenu`, `openTagComboboxMenu`, `closeTagComboboxMenu`, `initTagCombobox`, `handleTagComboboxKeydown`, `updateComboboxHighlight`, `activateTagComboboxOption`, `createTagFromCombobox`). State variable names consistent (`comboboxOpen`, `comboboxHighlightIndex`, `comboboxFilteredOptions`). HTML IDs consistent (`tagCombobox`, `tagComboboxInput`, `tagComboboxMenu`).

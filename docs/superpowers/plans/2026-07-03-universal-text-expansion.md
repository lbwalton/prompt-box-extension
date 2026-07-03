# Universal Text Expansion (Layered Fallback Chain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shortcut expansion work on effectively every site by adding Tab/Enter triggers, shadow DOM support, post-expansion verification, a synthetic-paste fallback, and a clipboard+toast last resort.

**Architecture:** All runtime changes live in `content.js` (single file, no build step, loaded directly by Chrome per `manifest.json`). Every expansion attempt gets a context object and is verified ~100ms later; failures escalate Layer 1 (direct replacement) → Layer 2 (synthetic paste event) → Layer 3 (clipboard + toast). One new manifest permission: `clipboardWrite`.

**Tech Stack:** Plain JavaScript (Chrome MV3 content script), no frameworks, no build step. Lint via `npm run lint`, security scan via `npm run security`.

**Spec:** `docs/superpowers/specs/2026-07-03-universal-text-expansion-design.md`

## Global Constraints

- Manifest V3. No remote code, no `eval`, no inline scripts on extension pages.
- **Never use `innerHTML` with any content.** All DOM built with `createElement` + `textContent` (project security rule).
- Password fields must never be read or modified (existing `NON_TEXT_INPUT_TYPES` logic stays).
- The manifest file is `manifest.json`, all lowercase.
- Target version: **3.4.0** (updated in `manifest.json`, `popup.html` `#appVersion`, `CHANGELOG.md`).
- Before EVERY commit: run `npm run lint` and `npm run security`; both must pass with no errors.
- `test-expansion.html` is a dev file: never include it in the release zip (matches existing `test-*.html` exclusion rule).
- No automated test suite exists in this project. Each task's test cycle is: run lint/security, then manually verify against `test-expansion.html` (Task 1) loaded as a regular local page, with the unpacked extension reloaded at `chrome://extensions` after every `content.js` change.
- User-facing text (toast, changelog) must not contain em-dashes or double hyphens.
- Code style: match existing `content.js` (function declarations, `const`/`let`, `pbLog` for debug logging, section-divider comments).

**Manual reload procedure (referenced by every task):** open `chrome://extensions`, find Prompt Box, click the reload (circular arrow) button, then reload the test page tab. Before testing, create a prompt in the extension popup with shortcut `xtest` and text `Hello from Prompt Box expansion!` if it does not already exist.

---

### Task 1: Test control page

**Files:**
- Create: `test-expansion.html`

**Interfaces:**
- Consumes: nothing (standalone page).
- Produces: a local manual-test harness with one section per expansion scenario. Later tasks reference its sections by name: "Plain input", "Email input", "Textarea", "Contenteditable", "Shadow DOM input", "Stubborn input (paste-aware)", "Locked input (Layer 3)".

- [ ] **Step 1: Write the test page**

Create `test-expansion.html` with this exact content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Prompt Box — Expansion Test Page</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  section { margin-bottom: 28px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
  h2 { margin: 0 0 4px; font-size: 16px; }
  p.hint { margin: 0 0 10px; color: #666; font-size: 13px; }
  input, textarea { width: 100%; box-sizing: border-box; font-size: 14px; padding: 8px; }
  textarea { min-height: 70px; }
  [contenteditable] { border: 1px solid #bbb; border-radius: 4px; min-height: 60px; padding: 8px; }
  .expected { display: inline-block; font-size: 12px; background: #eef; border-radius: 4px; padding: 2px 8px; margin-bottom: 8px; }
</style>
</head>
<body>
<h1>Prompt Box Expansion Test Page</h1>
<p>Setup: create a prompt with shortcut <code>xtest</code> in the extension first.
In each field, type <code>xtest</code> followed by the trigger key named in the section.</p>

<section>
  <h2>Plain input</h2>
  <span class="expected">Expected: Layer 1, triggers: Space, Tab, Enter</span>
  <p class="hint">Enter is prevented from submitting here so you can inspect the value.</p>
  <form onsubmit="return false"><input type="text" id="plain" placeholder="type xtest then Space / Tab / Enter"></form>
</section>

<section>
  <h2>Email input</h2>
  <span class="expected">Expected: Layer 1, triggers: Tab, Enter (like a sign-in box)</span>
  <form onsubmit="return false"><input type="email" id="email" placeholder="type xtest then Tab"></form>
</section>

<section>
  <h2>Textarea</h2>
  <span class="expected">Expected: Layer 1, triggers: Space, Tab, Enter</span>
  <textarea id="ta" placeholder="type xtest then Space"></textarea>
</section>

<section>
  <h2>Contenteditable</h2>
  <span class="expected">Expected: Layer 1 (execCommand), trigger: Space only</span>
  <div contenteditable="true" id="ce"></div>
</section>

<section>
  <h2>Shadow DOM input</h2>
  <span class="expected">Expected: Layer 1 after shadow fix, triggers: Space, Tab, Enter</span>
  <div id="shadow-host"></div>
</section>

<section>
  <h2>Stubborn input (paste-aware)</h2>
  <span class="expected">Expected: Layer 2 (synthetic paste)</span>
  <p class="hint">Reverts any untrusted value change (simulates a framework), but honors paste events.</p>
  <form onsubmit="return false"><input type="text" id="stubborn" placeholder="type xtest then Space"></form>
</section>

<section>
  <h2>Locked input (Layer 3)</h2>
  <span class="expected">Expected: Layer 3 (clipboard + toast)</span>
  <p class="hint">Reverts untrusted value changes AND swallows paste events.</p>
  <form onsubmit="return false"><input type="text" id="locked" placeholder="type xtest then Space"></form>
</section>

<script>
// Shadow DOM input
(function () {
  const host = document.getElementById('shadow-host');
  const root = host.attachShadow({ mode: 'open' });
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'inside an open shadow root: type xtest then Space';
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.fontSize = '14px';
  input.style.padding = '8px';
  root.appendChild(input);
})();

// Framework-style revert: snapshot value on trusted keystrokes; when an
// untrusted input event changes the value, restore the snapshot.
function makeStubborn(el, opts) {
  let lastTrusted = '';
  el.addEventListener('keydown', function () {
    setTimeout(function () { lastTrusted = el.value; }, 0);
  });
  el.addEventListener('input', function (e) {
    if (e.isTrusted) { lastTrusted = el.value; return; }
    // revert programmatic writes, like a controlled React input would
    el.value = lastTrusted;
  });
  if (opts.acceptPaste) {
    el.addEventListener('paste', function (e) {
      e.preventDefault();
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      const start = el.selectionStart == null ? el.value.length : el.selectionStart;
      const end = el.selectionEnd == null ? el.value.length : el.selectionEnd;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      lastTrusted = el.value;
    });
  } else {
    el.addEventListener('paste', function (e) { e.preventDefault(); });
  }
}
makeStubborn(document.getElementById('stubborn'), { acceptPaste: true });
makeStubborn(document.getElementById('locked'), { acceptPaste: false });
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the page loads and behaves**

Run: `open "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension/test-expansion.html"` (or open the file in Chrome).

Expected: all seven sections render. Typing normally works in every field. In "Stubborn input", select-all + a real Cmd+V paste inserts text; in "Locked input", a real Cmd+V does nothing.

Baseline check (current v3.3.0 behavior, extension loaded): `xtest` + Space expands in "Plain input", "Textarea", "Contenteditable". `xtest` + Tab does NOT expand in "Email input". "Shadow DOM input", "Stubborn input", "Locked input" do NOT expand. This is the before-state the next tasks fix.

- [ ] **Step 3: Lint, security scan, commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
npm run lint && npm run security
git add test-expansion.html
git commit -m "test: add manual expansion test harness covering all fallback layers"
```

Expected: lint and security pass (the new file is HTML; eslint only scans `*.js`).

---

### Task 2: Shadow DOM target resolution

**Files:**
- Modify: `content.js` (field helpers section, keydown listener, contenteditable input listener)

**Interfaces:**
- Consumes: existing listeners in `content.js`.
- Produces: `resolveTarget(e)` returning the innermost event target (`Element`). Both listeners use it instead of `e.target`. Later tasks call `resolveTarget(e)` too.

- [ ] **Step 1: Add `resolveTarget` helper**

In `content.js`, directly below the `isContentEditable` function, add:

```js
// Resolve the real event target. For events originating inside an OPEN
// shadow root, e.target is the shadow host; composedPath()[0] is the actual
// element the user typed into. Closed shadow roots stay unreachable.
function resolveTarget(e) {
  if (typeof e.composedPath === 'function') {
    const path = e.composedPath();
    if (path && path.length) return path[0];
  }
  return e.target;
}
```

- [ ] **Step 2: Use it in both listeners**

In the keydown listener, replace:

```js
  const el = e.target;
```

with:

```js
  const el = resolveTarget(e);
```

In the contenteditable `input` listener, replace:

```js
  const el = e.target;
```

with:

```js
  const el = resolveTarget(e);
```

- [ ] **Step 3: Verify on the test page**

Reload the extension and the test page (see Manual reload procedure). In "Shadow DOM input", type `xtest` then Space.

Expected: the shortcut expands (Layer 1). All previously working sections ("Plain input", "Textarea", "Contenteditable") still expand on Space.

- [ ] **Step 4: Lint, security scan, commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
npm run lint && npm run security
git add content.js
git commit -m "fix: expand shortcuts inside open shadow DOM via composedPath"
```

Expected: both pass, commit succeeds.

---

### Task 3: Tab and Enter trigger keys

**Files:**
- Modify: `content.js` (keydown listener)

**Interfaces:**
- Consumes: `resolveTarget(e)` from Task 2.
- Produces: `TRIGGER_KEYS` (a `Set` of `' '`, `'Tab'`, `'Enter'`). Keydown handler expands on all three keys; only Space is `preventDefault`ed. Task 4 restructures the body of this handler but keeps this trigger behavior exactly.

- [ ] **Step 1: Add the trigger key set**

In `content.js`, above the keydown listener (below the `findShortcutAtEnd` function), add:

```js
// Keys that trigger expansion in input/textarea. Space is consumed (the
// expansion replaces shortcut + swallows the space, as before). Tab and
// Enter are NOT prevented: the value is expanded synchronously in capture
// phase, then the default action proceeds (focus moves, form submits) with
// the expanded text already in place. This is what makes sign-in boxes and
// search bars work, where users never press Space after a shortcut.
const TRIGGER_KEYS = new Set([' ', 'Tab', 'Enter']);
```

- [ ] **Step 2: Update the keydown handler**

Replace the first line of the keydown handler body:

```js
  if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
```

with:

```js
  if (!TRIGGER_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
```

Then replace the unconditional prevent:

```js
  e.preventDefault();
```

with:

```js
  // Only Space is consumed. Tab/Enter keep their default action.
  if (e.key === ' ') e.preventDefault();
```

(The contenteditable path is untouched: rich editors stay Space-only by design.)

- [ ] **Step 3: Verify on the test page**

Reload extension + test page.

- "Email input": type `xtest`, press Tab. Expected: value becomes the expansion, focus moves to the next field.
- "Plain input": type `xtest`, press Enter. Expected: value becomes the expansion (form submit is a no-op on the test page).
- "Plain input": type `xtest`, press Space. Expected: expands exactly as before, no trailing space.
- "Contenteditable": Tab and Enter do NOT expand; Space still does.

- [ ] **Step 4: Verify on one real surface**

Go to https://www.bing.com, click the search box, type `xtest`, press Enter.

Expected: the search submits with the expanded text (results page shows the expansion as the query). If the value visibly expands but search still uses `xtest`, note it: Task 4's verification layer is the designed fix; do not chase it here.

- [ ] **Step 5: Lint, security scan, commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
npm run lint && npm run security
git add content.js
git commit -m "feat: trigger expansion on Tab and Enter in text fields"
```

---

### Task 4: Verification engine + Layer 2 synthetic paste

This is the core task: introduce the expansion context, verify every attempt, and escalate failed attempts to a synthetic paste event.

**Files:**
- Modify: `content.js` (keydown handler body, contenteditable path, new engine section)

**Interfaces:**
- Consumes: `TRIGGER_KEYS`, `resolveTarget(e)`, existing `shortcuts` map, `findShortcutAtEnd`, `isContentEditable`, `ceExpanding`, `pbLog`.
- Produces (used by Task 5):
  - `ctx` object shape: `{ el, isCE, shortcut, expansion, replaceStart, layer }` (`replaceStart` only meaningful when `isCE === false`; `layer` is 1, 2, or 3).
  - `VERIFY_DELAY_MS` (number, 100)
  - `scheduleVerify(ctx)` → schedules `verifyAndEscalate(ctx)`
  - `verifyAndEscalate(ctx)` → checks `expansionStuck(ctx)`, escalates on failure. In THIS task, the chain ends after Layer 2 with a `pbLog`; Task 5 replaces that ending with `runLayer3Clipboard(ctx)`.
  - `expansionStuck(ctx)` → boolean
  - `normalizeWS(s)` → string with all whitespace runs collapsed to single spaces
  - `ceRoot(el)` → nearest `[contenteditable="true"]` ancestor or `el`
  - `locateCEShortcut()` → `{ range, shortcut, expansion }` or `null`
  - `runLayer1Input(ctx, cursor)`, `runLayer2Input(ctx)` → boolean, `runLayer2CE(ctx)` → boolean
  - `dispatchSyntheticPaste(target, text)` → boolean

- [ ] **Step 1: Add the engine section**

In `content.js`, after the `findShortcutAtEnd` function and before the `TRIGGER_KEYS` declaration, add this new section:

```js
// ─── Expansion engine: layered attempts + verification ──────────────────────
// Every expansion attempt builds a ctx and is verified VERIFY_DELAY_MS later.
// If the text didn't stick (framework reverted it), we escalate:
//   Layer 1  direct replacement (native setter / execCommand)
//   Layer 2  synthetic paste event (rich editors handle paste themselves)
//   Layer 3  clipboard + toast (added in a later change)
const VERIFY_DELAY_MS = 100;

// Collapse whitespace runs so NBSP substitution and newline-to-<br>
// conversion inside editors don't cause false verification failures.
function normalizeWS(s) {
  return s.replace(/\s+/g, ' ');
}

function ceRoot(el) {
  if (el && el.closest) {
    const root = el.closest('[contenteditable="true"]');
    if (root) return root;
  }
  return el;
}

function expansionStuck(ctx) {
  const el = ctx.el;
  // Element gone from the DOM: an Enter-triggered submit/navigation already
  // consumed the expanded value. Treat as success.
  if (!el || !el.isConnected) return true;
  const haystack = ctx.isCE
    ? (ceRoot(el).textContent || '')
    : (typeof el.value === 'string' ? el.value : '');
  return normalizeWS(haystack).indexOf(normalizeWS(ctx.expansion)) !== -1;
}

function scheduleVerify(ctx) {
  setTimeout(function () { verifyAndEscalate(ctx); }, VERIFY_DELAY_MS);
}

function verifyAndEscalate(ctx) {
  if (expansionStuck(ctx)) {
    pbLog('layer', ctx.layer, 'verified OK');
    return;
  }
  if (ctx.layer >= 2) {
    pbLog('layer 2 failed, no further fallback yet');
    return;
  }
  ctx.layer = 2;
  pbLog('escalating to layer 2 (synthetic paste)');
  const dispatched = ctx.isCE ? runLayer2CE(ctx) : runLayer2Input(ctx);
  if (dispatched) scheduleVerify(ctx);
  else pbLog('layer 2 could not run, no further fallback yet');
}

// Layer 1 for input/textarea: replace via the native value setter so React's
// internal value tracking registers the change.
function runLayer1Input(ctx, cursor) {
  const el = ctx.el;
  const newValue =
    el.value.substring(0, ctx.replaceStart) +
    ctx.expansion +
    el.value.substring(cursor);

  const proto = el.tagName.toLowerCase() === 'textarea'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, newValue);
  } else {
    el.value = newValue;
  }

  const newCursor = ctx.replaceStart + ctx.expansion.length;
  try { el.setSelectionRange(newCursor, newCursor); } catch (err) {}

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Layer 2 for input/textarea: select the shortcut text, then hand the
// insertion to the page's own paste handling via a synthetic paste event.
// Only runs if the shortcut text is verifiably still in place, so we can
// never double-insert.
function runLayer2Input(ctx) {
  const el = ctx.el;
  const val = typeof el.value === 'string' ? el.value : '';
  const current = val.substr(ctx.replaceStart, ctx.shortcut.length);
  if (current.toLowerCase() !== ctx.shortcut.toLowerCase()) {
    pbLog('layer2 input: shortcut no longer at expected position');
    return false;
  }
  try {
    el.focus();
    el.setSelectionRange(ctx.replaceStart, ctx.replaceStart + ctx.shortcut.length);
  } catch (err) {
    // email/number inputs throw on setSelectionRange
    pbLog('layer2 input: selection not supported', err);
    return false;
  }
  return dispatchSyntheticPaste(el, ctx.expansion);
}

// Layer 2 for contenteditable: re-locate the shortcut at the caret (the DOM
// may have re-rendered since Layer 1), select it, dispatch synthetic paste.
function runLayer2CE(ctx) {
  const found = locateCEShortcut();
  if (!found) {
    pbLog('layer2 CE: shortcut not found at caret');
    return false;
  }
  try {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(found.range);
  } catch (err) {
    pbLog('layer2 CE: could not select range', err);
    return false;
  }
  return dispatchSyntheticPaste(ceRoot(ctx.el), ctx.expansion);
}

// Synthetic paste: a ClipboardEvent carrying the expansion in DataTransfer.
// Untrusted events don't trigger the browser's default paste action, but
// rich editors (Lexical, ProseMirror, Quill) implement paste in JS and
// accept them. The user's real clipboard is never touched here.
// Note: we have no paste listeners of our own, and any input events the
// editor fires from this have e.data !== ' ', so our listeners ignore them.
function dispatchSyntheticPaste(target, text) {
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const evt = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    target.dispatchEvent(evt);
    return true;
  } catch (err) {
    pbLog('synthetic paste failed:', err);
    return false;
  }
}
```

- [ ] **Step 2: Rewire the keydown handler onto the engine**

Replace everything in the keydown handler AFTER the `if (e.key === ' ') e.preventDefault();` line (the old inline replacement code, native setter block, cursor restore, event dispatches, and the old "Sanity check" `setTimeout`) with:

```js
  const ctx = {
    el: el,
    isCE: false,
    shortcut: shortcut,
    expansion: expansion,
    replaceStart: cursor - shortcut.length,
    layer: 1
  };
  runLayer1Input(ctx, cursor);
  scheduleVerify(ctx);
```

The full keydown handler after this task reads:

```js
window.addEventListener('keydown', function (e) {
  if (!TRIGGER_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
  // Skip if a composition (IME) is active
  if (e.isComposing || e.keyCode === 229) return;

  const el = resolveTarget(e);

  // Contenteditable handled by input listener below
  if (isContentEditable(el)) return;
  if (!isTextInput(el)) return;

  // Some input types (email, number, and url in Chrome) don't expose
  // selectionStart — they either return null or throw InvalidStateError.
  // In those cases, assume the cursor is at the end of the value, which
  // is true whenever the user is actively appending characters.
  let cursor;
  try {
    cursor = el.selectionStart;
  } catch (err) {
    cursor = null;
  }
  if (cursor == null) cursor = el.value.length;

  const before = el.value.substring(0, cursor);
  const shortcut = findShortcutAtEnd(before);
  if (!shortcut) return;

  const expansion = shortcuts[shortcut.toLowerCase()];
  pbLog('keydown match:', shortcut, 'via key', JSON.stringify(e.key));

  // Only Space is consumed. Tab/Enter keep their default action.
  if (e.key === ' ') e.preventDefault();

  const ctx = {
    el: el,
    isCE: false,
    shortcut: shortcut,
    expansion: expansion,
    replaceStart: cursor - shortcut.length,
    layer: 1
  };
  runLayer1Input(ctx, cursor);
  scheduleVerify(ctx);
}, true); // capture so we run before page handlers
```

- [ ] **Step 3: Refactor the contenteditable path onto the engine**

Replace the entire existing `tryExpandContentEditable` function with these two functions (the shortcut-locating logic is extracted so Layer 2 can re-run it):

```js
// Locate a shortcut + trailing space immediately before the caret in a
// contenteditable. Returns { range, shortcut, expansion } or null.
// \s matches both regular space (U+0020) and the non-breaking space
// (U+00A0) that contenteditable editors often insert.
function locateCEShortcut() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    pbLog('  ce bail: no selection');
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    pbLog('  ce bail: range not collapsed');
    return null;
  }

  const container = range.startContainer;
  let textBefore = '';
  let startNode;

  if (container.nodeType === Node.TEXT_NODE) {
    textBefore = container.textContent.substring(0, range.startOffset);
    startNode = container;
  } else {
    const prevChild = container.childNodes[range.startOffset - 1];
    if (!prevChild || prevChild.nodeType !== Node.TEXT_NODE) {
      pbLog('  ce bail: container not text node, prevChild not text');
      return null;
    }
    textBefore = prevChild.textContent;
    startNode = prevChild;
  }

  const match = textBefore.match(/(?:^|\s)(\S+)\s$/);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const expansion = shortcuts[word];
  if (!expansion) return null;

  const shortcutWithSpace = match[1] + ' ';
  const nodeTextOffset = startNode === container
    ? range.startOffset
    : startNode.textContent.length;

  const deleteFrom = nodeTextOffset - shortcutWithSpace.length;
  if (deleteFrom < 0) return null;

  const replaceRange = document.createRange();
  replaceRange.setStart(startNode, deleteFrom);
  replaceRange.setEnd(range.startContainer, range.startOffset);

  return { range: replaceRange, shortcut: match[1], expansion: expansion };
}

function tryExpandContentEditable() {
  const found = locateCEShortcut();
  if (!found) return;

  pbLog('contenteditable match:', found.shortcut, '→', found.expansion.length, 'chars');

  const startContainer = found.range.startContainer;
  const anchorEl = startContainer.nodeType === Node.TEXT_NODE
    ? startContainer.parentElement
    : startContainer;

  const ctx = {
    el: ceRoot(anchorEl),
    isCE: true,
    shortcut: found.shortcut,
    expansion: found.expansion,
    replaceStart: -1,
    layer: 1
  };

  // Defer to next macrotask. Chrome blocks execCommand if it's called
  // recursively from within an input event triggered by another execCommand
  // (e.g. on sites that insert text programmatically). The setTimeout pushes
  // our call outside the recursive context.
  setTimeout(function () {
    ceExpanding = true;
    try {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(found.range);
      const ok = document.execCommand('insertText', false, found.expansion);
      pbLog('  ce execCommand returned', ok);
    } finally {
      ceExpanding = false;
    }
    scheduleVerify(ctx);
  }, 0);
}
```

- [ ] **Step 4: Verify Layer 1 regressions and Layer 2 on the test page**

Reload extension + test page. Set `PB_DEBUG = true` temporarily in `content.js` if you want to watch the layer logs in DevTools console (remember to set it back to `false` before committing).

- "Plain input", "Email input", "Textarea", "Contenteditable", "Shadow DOM input": all still expand as in Tasks 2 and 3 (Layer 1, verified OK).
- "Stubborn input (paste-aware)": type `xtest`, press Space. Expected: for ~100ms the field may briefly show `xtest`, then the expansion appears via Layer 2 (the field's own paste handler inserts it).
- "Locked input (Layer 3)": type `xtest`, press Space. Expected: nothing visible happens yet; console (with PB_DEBUG) shows "layer 2 could not run" or "layer 2 failed, no further fallback yet". Layer 3 arrives in Task 5.

- [ ] **Step 5: Verify on LinkedIn**

Go to https://www.linkedin.com, start a post, type `xtest` then Space in the composer.

Expected: the shortcut expands, via Layer 1 or Layer 2 (either is a pass). If it does not expand, capture the PB_DEBUG console output and stop for review; do not improvise fixes outside the plan.

- [ ] **Step 6: Lint, security scan, commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
npm run lint && npm run security
git add content.js
git commit -m "feat: verify expansions and fall back to synthetic paste for rich editors"
```

---

### Task 5: Layer 3 clipboard + toast, and the clipboardWrite permission

**Files:**
- Modify: `content.js` (engine section: extend `verifyAndEscalate`, add Layer 3 + toast functions)
- Modify: `manifest.json` (permissions array)

**Interfaces:**
- Consumes: `ctx` shape, `verifyAndEscalate`, `locateCEShortcut`, `pbLog` from Task 4.
- Produces: `runLayer3Clipboard(ctx)`, `copyToClipboard(text, cb)`, `legacyCopy(text)` → boolean, `pasteKeyLabel()` → `'⌘V' | 'Ctrl+V'`, `showToast(message)`, `removeToast()`, `TOAST_DISMISS_MS` (5000).

- [ ] **Step 1: Add clipboardWrite permission**

In `manifest.json`, change:

```json
  "permissions": [
    "storage",
    "activeTab",
    "contextMenus"
  ],
```

to:

```json
  "permissions": [
    "storage",
    "activeTab",
    "contextMenus",
    "clipboardWrite"
  ],
```

- [ ] **Step 2: Extend `verifyAndEscalate` to reach Layer 3**

Replace the `verifyAndEscalate` function from Task 4 with:

```js
function verifyAndEscalate(ctx) {
  if (expansionStuck(ctx)) {
    pbLog('layer', ctx.layer, 'verified OK');
    return;
  }
  if (ctx.layer >= 3) {
    pbLog('layer 3 reached, chain ends');
    return;
  }
  ctx.layer += 1;
  pbLog('escalating to layer', ctx.layer);
  if (ctx.layer === 2) {
    const dispatched = ctx.isCE ? runLayer2CE(ctx) : runLayer2Input(ctx);
    if (dispatched) {
      scheduleVerify(ctx);
    } else {
      ctx.layer = 3;
      runLayer3Clipboard(ctx);
    }
  } else {
    runLayer3Clipboard(ctx);
  }
}
```

- [ ] **Step 3: Add Layer 3 + clipboard helpers**

Below `dispatchSyntheticPaste`, add:

```js
// ─── Layer 3: clipboard + toast (universal safety net) ──────────────────────
// If the page blocks both direct replacement and synthetic paste, copy the
// expansion to the real clipboard and tell the user to paste. Best effort:
// leave the shortcut text selected so their paste replaces it in one go.
const TOAST_DISMISS_MS = 5000;

function runLayer3Clipboard(ctx) {
  try {
    if (!ctx.isCE) {
      const val = typeof ctx.el.value === 'string' ? ctx.el.value : '';
      const current = val.substr(ctx.replaceStart, ctx.shortcut.length);
      if (current.toLowerCase() === ctx.shortcut.toLowerCase()) {
        ctx.el.focus();
        ctx.el.setSelectionRange(ctx.replaceStart, ctx.replaceStart + ctx.shortcut.length);
      }
    } else {
      const found = locateCEShortcut();
      if (found) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(found.range);
      }
    }
  } catch (err) {
    pbLog('layer3: could not pre-select shortcut', err);
  }

  copyToClipboard(ctx.expansion, function (ok) {
    if (ok) {
      showToast('Prompt Box: prompt copied. Press ' + pasteKeyLabel() + ' to paste.');
    } else {
      showToast('Prompt Box: could not expand here. Open Prompt Box to copy your prompt.');
    }
  });
}

function pasteKeyLabel() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
}

function copyToClipboard(text, cb) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () { cb(true); },
      function () { cb(legacyCopy(text)); }
    );
  } else {
    cb(legacyCopy(text));
  }
}

// Fallback copy path for pages where the async clipboard API is blocked.
// Steals focus for one tick; restores it afterwards.
function legacyCopy(text) {
  const prevActive = document.activeElement;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.opacity = '0';
  (document.body || document.documentElement).appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
  ta.remove();
  if (prevActive && typeof prevActive.focus === 'function') {
    try { prevActive.focus(); } catch (err) {}
  }
  return ok;
}

// ─── Toast ───────────────────────────────────────────────────────────────────
// Rendered in a CLOSED shadow root on a container appended to
// document.documentElement, so page CSS can't restyle it and page scripts
// can't easily reach it. Built with createElement/textContent only.
let toastHost = null;
let toastTimer = null;

function showToast(message) {
  removeToast();

  toastHost = document.createElement('div');
  const shadow = toastHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent =
    '.pb-toast {' +
    '  position: fixed; bottom: 20px; right: 20px;' +
    '  background: #1f2937; color: #f9fafb;' +
    "  font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;" +
    '  padding: 10px 14px; border-radius: 8px;' +
    '  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);' +
    '  z-index: 2147483647; cursor: pointer; max-width: 320px;' +
    '}';

  const box = document.createElement('div');
  box.className = 'pb-toast';
  box.textContent = message;
  box.addEventListener('click', removeToast);

  shadow.appendChild(style);
  shadow.appendChild(box);
  (document.documentElement || document.body).appendChild(toastHost);

  toastTimer = setTimeout(removeToast, TOAST_DISMISS_MS);
}

function removeToast() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastHost) {
    toastHost.remove();
    toastHost = null;
  }
}
```

- [ ] **Step 4: Verify Layer 3 on the test page**

Reload extension + test page (manifest changed, so the full extension reload at `chrome://extensions` is required, not just the tab).

- "Locked input (Layer 3)": type `xtest`, press Space. Expected: within ~300ms a dark toast appears bottom-right reading "Prompt Box: prompt copied. Press ⌘V to paste." The shortcut text `xtest` is left selected in the field. Pressing Cmd+V pastes... nothing into this particular field (it swallows paste by design), but pasting into "Plain input" confirms the clipboard now holds the expansion.
- Toast auto-dismisses after 5 seconds; clicking it dismisses immediately; triggering it twice shows only one toast.
- All other sections still expand via Layers 1 or 2 with NO toast.

- [ ] **Step 5: Verify on Google Docs**

Open any Google Doc, type `xtest` then Space in the document body.

Expected: the toast appears and the expansion is on the clipboard (Google Docs renders to canvas; Layers 1 and 2 cannot reach it, this is the designed behavior). Paste with Cmd+V inserts the expansion. The typed shortcut may remain and need manual deletion; that is accepted spec behavior for canvas editors.

- [ ] **Step 6: Lint, security scan, commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
npm run lint && npm run security
git add content.js manifest.json
git commit -m "feat: clipboard + toast fallback when a page blocks expansion"
```

---

### Task 6: Version 3.4.0 bump, changelog, store listing, privacy docs

**Files:**
- Modify: `manifest.json` (version field)
- Modify: `popup.html:1771` (`#appVersion` text)
- Modify: `CHANGELOG.md` (new section at top)
- Modify: `prompt-box-store-listing.md` (feature copy)
- Modify: `prompt-box-privacy-practices.md` (permission justification + changelog table)

**Interfaces:**
- Consumes: shipped behavior from Tasks 2 to 5.
- Produces: release-ready metadata; nothing downstream consumes code from this task.

- [ ] **Step 1: Bump version in manifest.json**

Change `"version": "3.3.0"` to `"version": "3.4.0"`.

- [ ] **Step 2: Bump version in popup.html**

At line 1771, change:

```html
        <p>Version: <strong id="appVersion">3.3.0</strong></p>
```

to:

```html
        <p>Version: <strong id="appVersion">3.4.0</strong></p>
```

- [ ] **Step 3: Add CHANGELOG.md entry**

Insert at the top of `CHANGELOG.md`, directly under the `# Changelog` line:

```markdown
## [3.4.0] - 2026-07-03
### Added
- **Shortcuts now expand on Tab and Enter, not just Space.** Type your shortcut in a sign-in box and press Tab, or in a search bar and press Enter: the full text is filled in before the page acts on it.
- **Smart fallback for stubborn editors.** If a site blocks direct expansion (LinkedIn posts and other complex editors), Prompt Box retries through the site's own paste handling. As a last resort it copies the expanded prompt to your clipboard and shows a small reminder to paste it, so expansion always gets you your text.
### Fixed
- Shortcuts now work in text fields inside open shadow DOM components, which many sign-in forms and embedded widgets use.
```

- [ ] **Step 4: Update the store listing**

In `prompt-box-store-listing.md`, find the feature bullet(s) describing text expansion / shortcuts (search for "shortcut" or "expansion"). Update or extend that copy so it says:

```
Type a shortcut and press Space, Tab, or Enter to expand it into your full prompt in any text field. On sites that block expansion, Prompt Box copies the prompt to your clipboard and shows a reminder so you can paste it in one keystroke.
```

If a permissions section exists in the listing doc, add `clipboardWrite` with a one-line justification matching Step 5. Keep surrounding formatting intact.

- [ ] **Step 5: Update privacy practices doc**

In `prompt-box-privacy-practices.md`, under `## Permission Justifications` (after the storage justification, before the `### Host Permission — <all_urls>` section), add:

```markdown
### `clipboardWrite`

Used only as a last-resort fallback for text expansion. When a site's editor blocks direct text insertion, the expanded prompt is copied to the user's clipboard so they can paste it manually, and an on-page notice tells them to do so. The clipboard is written only in direct response to the user typing one of their own saved shortcuts. The extension never reads the clipboard, and nothing is sent anywhere.
```

Then add a row to the top of the Changelog table (line ~86):

```markdown
| 3.4.0 | Added clipboardWrite permission for the expansion fallback (copies the user's own prompt to their clipboard on their explicit shortcut action); no data leaves the device |
```

- [ ] **Step 6: Flag the Gist for the user**

The privacy policy Gist at https://gist.github.com/lbwalton/7405633b075268bb14a33378eeaba4d1 must be updated with the same clipboardWrite justification before store submission. This is a user-owned external account: report it as a remaining manual step in the task summary; do not attempt to edit the Gist.

- [ ] **Step 7: Lint, security scan, commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
npm run lint && npm run security
git add manifest.json popup.html CHANGELOG.md prompt-box-store-listing.md prompt-box-privacy-practices.md
git commit -m "chore: release v3.4.0 with universal text expansion fallbacks"
```

---

### Task 7: Full manual test matrix

**Files:**
- No file changes expected. If a failure is found, STOP and report; fixes go through review, not ad-hoc patches.

**Interfaces:**
- Consumes: everything from Tasks 1 to 6.
- Produces: a pass/fail report against the spec's test matrix.

- [ ] **Step 1: Reload the extension fully**

`chrome://extensions` → reload Prompt Box. Confirm the version shows 3.4.0 and Settings > About in the popup shows 3.4.0.

- [ ] **Step 2: Run the matrix**

Confirm the `xtest` prompt exists, then work through each surface. Record result (pass/fail + observed layer if PB_DEBUG enabled) for every row:

| # | Surface | Action | Pass criteria |
|---|---------|--------|---------------|
| 1 | test-expansion.html, all 7 sections | per-section trigger | behaves per section's "Expected" label |
| 2 | Sign-in email field (e.g. https://www.linkedin.com/login) | `xtest` + Tab | field contains expansion, focus moved |
| 3 | Bing search bar (bing.com) | `xtest` + Enter | search runs with expanded query |
| 4 | ChatGPT (chatgpt.com) message box | `xtest` + Space | expansion appears in composer |
| 5 | Claude.ai message box | `xtest` + Space | expansion appears in composer |
| 6 | Gmail compose body | `xtest` + Space | expansion appears |
| 7 | LinkedIn post composer | `xtest` + Space | expansion appears |
| 8 | Notion page | `xtest` + Space | expansion appears |
| 9 | Slack web message box | `xtest` + Space | expansion appears |
| 10 | Google Docs document | `xtest` + Space | toast appears, expansion on clipboard, Cmd+V pastes it |
| 11 | Any password field | `xtest` + Space | NO expansion, ever |
| 12 | Plain input, IME active (e.g. Japanese input source) | type shortcut during composition | NO expansion mid-composition |
| 13 | Dark-mode site (e.g. github.com dark) | force a Layer 3 toast via test page in a dark-mode themed OS | toast readable |

Skip rows for services with no available login rather than failing them; note skips in the report.

- [ ] **Step 3: Confirm PB_DEBUG is false and working tree is clean**

Run: `grep -n "PB_DEBUG = " content.js && git status --short`
Expected: `const PB_DEBUG = false;` and no unexpected modified files.

- [ ] **Step 4: Report**

Summarize: matrix results, any skipped rows, the outstanding manual Gist update, and that packing/shipping the zip is a separate "pack and ship" flow the user triggers when ready to upload.

---

## Self-Review Notes

- Spec coverage: trigger keys (Task 3), shadow DOM (Task 2), verification + escalation (Task 4), synthetic paste (Task 4), clipboard + toast + permission (Task 5), docs/version (Task 6), test matrix (Task 7). Google Docs designed-toast behavior verified in Task 5 Step 5 and matrix row 10. Enter-submit navigation edge case covered by `expansionStuck`'s `isConnected` check.
- Double-insertion safety: Layer 2 only runs when the shortcut text is verifiably still present (`runLayer2Input` position check, `locateCEShortcut` re-location). Whitespace-normalized verification prevents false failures from NBSP/newline conversion.
- Type consistency: `ctx` fields (`el`, `isCE`, `shortcut`, `expansion`, `replaceStart`, `layer`) match across Tasks 4 and 5; `locateCEShortcut` returns `{ range, shortcut, expansion }` in both consumers.

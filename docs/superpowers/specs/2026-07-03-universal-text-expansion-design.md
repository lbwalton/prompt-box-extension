# Universal Text Expansion: Layered Fallback Chain

**Date:** 2026-07-03
**Status:** Approved approach (Project A). Sync/monetization (Project B) is intentionally out of scope and will get its own spec.
**Target version:** 3.4.0 (minor bump: new behavior, new permission)

## Problem

Shortcut expansion fails on many real sites. Reported failures:

1. **Sign-in boxes** (email shortcut): user types the shortcut, then presses Tab or Enter, never Space. Expansion only triggers on Space today, so it never fires. This is a trigger gap, not an insertion bug.
2. **Bing search bar**: user presses Enter to search (same trigger gap), and Bing tracks the input value with its own JS, which can revert our insertion.
3. **LinkedIn post composer**: rich contenteditable editor that ignores or reverts `execCommand('insertText')`.
4. **General**: inputs inside shadow DOM are invisible to the current handler because `e.target` is the shadow host, not the real input.

Today content.js has exactly two paths (keydown native-setter for input/textarea, input-event + execCommand for contenteditable) and fails silently when either one doesn't stick.

## Design Overview

Keep the current fast paths. Add trigger keys, shadow DOM support, a verification step, and two fallback layers. Every expansion attempt is verified; on failure we escalate to the next layer instead of failing silently. The final layer always works: copy the expansion to the clipboard and tell the user to paste.

```
trigger (Space / Tab / Enter)
  └─ Layer 1: direct value replacement (native setter / execCommand)
       └─ verify (~100ms) ── ok? done
            └─ Layer 2: synthetic paste event (DataTransfer + ClipboardEvent)
                 └─ verify (~100ms) ── ok? done
                      └─ Layer 3: clipboard + toast ("press Cmd+V / Ctrl+V")
```

## Components

### 1. Trigger keys (input / textarea path)

- **Space** (existing): preventDefault and replace, as today.
- **Tab and Enter** (new): expand the shortcut synchronously in keydown, but do NOT preventDefault. The default action then proceeds with the expanded value: Tab moves focus in a sign-in form, Enter submits the search with the full text. The capture-phase window listener already runs before page handlers, so the value is expanded before the page reads it.
- Contenteditable stays Space-only. Enter and Tab have editor-specific meanings in rich editors (send message, indent, mention selection) and intercepting them is high-risk, low-reward.
- IME guard (`isComposing` / keyCode 229) applies to all trigger keys.

### 2. Shadow DOM support (Layer 0, target discovery)

Use `e.composedPath()[0]` instead of `e.target` in both the keydown and input listeners. This resolves the real element inside open shadow roots. Closed shadow roots stay unreachable (accepted limitation; Layer 3 still works there because the trigger never fires, so behavior is unchanged for them).

### 3. Verification and escalation

After each Layer 1 or Layer 2 attempt, check ~100ms later:

- input/textarea: does `el.value` contain the expansion at the expected position?
- contenteditable: does the text around the insertion point contain the expansion (or no longer end with the shortcut)?

If verification fails, escalate to the next layer. Verification state is kept per-attempt (element ref, expected text, layer index) so overlapping expansions in different fields don't interfere.

Edge case: on Enter-triggered expansion the page may navigate or clear the field (search submit) before verification runs. If the element is disconnected from the DOM at verify time, treat it as success and stop (the submit already consumed the expanded value).

### 4. Layer 2: synthetic paste

For targets where direct replacement failed (LinkedIn composer, other Lexical/Quill/ProseMirror editors):

1. Select the shortcut text: for input/textarea use `setSelectionRange`; for contenteditable build a Range over the shortcut and set the selection.
2. Create a `DataTransfer`, `setData('text/plain', expansion)`.
3. Dispatch `new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })` at the target.

Rich editors implement paste handling, so this path inserts through the editor's own state model. The user's real clipboard is not touched.

### 5. Layer 3: clipboard + toast (universal safety net)

When Layers 1 and 2 both fail:

1. Write the expansion to the clipboard via `navigator.clipboard.writeText` (fallback: hidden textarea + `document.execCommand('copy')`).
2. Best effort: leave the shortcut text selected so the user's paste replaces it in one keystroke.
3. Show a toast: "Prompt Box: prompt copied. Press ⌘V to paste." (Ctrl+V on Windows/Linux, detected via `navigator.platform`.)

Toast implementation rules:

- Rendered inside a **closed shadow root** on a container appended to `document.documentElement`, so page CSS cannot restyle it and page scripts cannot easily reach it.
- Built with `createElement` and `textContent` only. No innerHTML anywhere (project security rule).
- Fixed position bottom-right, auto-dismisses after 5 seconds, dismissible on click.
- One toast at a time; a new expansion replaces the existing toast.

### 6. Permissions and docs

- Add `"clipboardWrite"` to `manifest.json` permissions. No new host permissions.
- Update `prompt-box-store-listing.md` (feature description + permission justification).
- Update `prompt-box-privacy-practices.md` (new permission row in changelog table) and the privacy Gist. Note: clipboard is only written on explicit user action (typing a shortcut + trigger key) and nothing is read from the clipboard.
- Expect possible Chrome Web Store re-review due to the permission addition.

## Data Flow

1. `loadShortcuts()` (unchanged): reads prompts from sync or local storage per `storagePref`, builds the `shortcuts` map, reloads on storage change.
2. Keydown (capture, window): resolve target via composedPath, detect trigger key, find shortcut at cursor, run Layer 1, schedule verification.
3. Input event (contenteditable, unchanged trigger): detect space, find shortcut, run Layer 1 (execCommand), schedule verification.
4. Verification callback: on failure, run next layer against the same recorded target and shortcut position; after Layer 3, stop.

## Error Handling

- Every layer wrapped so an exception escalates to the next layer instead of breaking typing.
- Password fields and non-text input types remain excluded (existing `NON_TEXT_INPUT_TYPES` logic).
- If clipboard write fails in Layer 3 (permission edge case, insecure context), show a toast with instructions to copy from the popup instead. Never throw into the page.
- Re-entrancy guards: existing `ceExpanding` flag, plus a guard so synthetic paste events we dispatch are not re-processed by our own listeners.

## Testing (manual matrix)

No automated suite exists; test by loading unpacked. Control: plain HTML form (test page checked in as `test-expansion.html`, excluded from the release zip like other `test-*.html`).

| Surface | Trigger to test | Expected layer |
|---|---|---|
| Plain HTML input/textarea | Space, Tab, Enter | 1 |
| Sign-in email fields (Google, LinkedIn login) | Tab, Enter | 1 |
| Bing search bar | Enter, Space | 1 or 2 |
| ChatGPT / Claude.ai / Gemini | Space, Enter | 1 or 2 |
| LinkedIn post composer | Space | 2 |
| Gmail compose | Space | 1 or 2 |
| Notion / Slack web | Space | 2 |
| Google Docs | Space | 3 (toast) |

Also verify: IME composition unaffected, password fields never expand, dark mode toast appearance, no console errors on pages without shortcuts.

## Out of Scope

- Google Docs native insertion (canvas rendering; Layer 3 toast is the designed answer).
- Enter/Tab triggers in contenteditable editors.
- Desktop helper app, cross-device sync, web app, iOS, payments (Project B, separate spec).

## Ship Checklist

1. `npm run security` clean, `npm run lint` clean.
2. Version 3.4.0 in manifest.json, popup.html `#appVersion`, CHANGELOG.md entry.
3. Store listing and privacy practices docs updated (clipboardWrite), Gist updated.
4. Manual matrix above passes.

## Post-Implementation Findings (2026-07-03, live browser testing)

Verified working (v3.4.0 + match_about_blank): plain inputs, email inputs with Tab, search bars with Enter (Google, Bing including form submit), open shadow DOM inputs, contenteditable editors (X, ChatGPT, Claude.ai), React-style reverting fields via Layer 2 synthetic paste, and the Layer 3 clipboard + toast on fully locked fields. LinkedIn plain fields (search, sign-in) work.

Corrections to this spec's assumptions:

1. **Google Docs cannot trigger any layer, including the toast.** Docs routes typing through a hidden about:blank iframe whose contenteditable receives keydown events only; Docs prevents the default so no `input` event ever fires, and characters go straight to its canvas engine. `match_about_blank: true` (added to the manifest) injects our script there, but the input-event trigger for contenteditable never fires. The "Layer 3 toast is the designed answer" line in Out of Scope was wrong: no trigger, no toast. Docs support requires a keydown-driven keystroke buffer (3.5.0 candidate).
2. **LinkedIn's post composer uses a shadow-DOM editing surface** in the top document (events retarget to a non-editable host; `window.getSelection()` returns an element-level range that defeats shortcut location). The composer silently never starts the chain. Same 3.5.0 approach applies (keystroke buffer + `getComposedRanges` selection reading).
3. **Timer throttling in occluded windows** can delay the 100ms verification by seconds to minutes. Irrelevant for real users (typing implies a focused, unthrottled tab) but it will mislead anyone testing via remote automation with the window in the background. A `visibilitychange` flush is a cheap future hardening option.

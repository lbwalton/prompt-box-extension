# Bulk Delete (Multi-Select + Confirm)

**Date:** 2026-07-10
**Status:** Approved via plan (LB AFK during brainstorm; decisions below used the recommended defaults and are logged for override).
**Branch:** `feature/bulk-delete`
**Execution:** PRD loop (`prd.json` stories BD0-BD4).

## Goal

Free-tier UX: let users select multiple prompts and delete them in one confirmed action. Works
identically in all three storage modes; in cloud mode every deletion produces a tombstone through the
existing `deletePrompt`/`recordTombstone` path so deletes propagate to other devices — never bypassing
the sync engine.

## Design decisions (brainstormed 2026-07-10)

1. **Selection UI: "Select" mode toggle.** A `Select` button in the toolbar (near filter controls)
   enters selection mode: each visible card renders a checkbox, and a bottom action bar appears with
   `N selected · Select all · Delete (N) · Cancel`. Cards stay clean in normal mode; mode exits on
   Cancel, on successful delete, or naturally when the popup closes.
2. **Filter interplay: selection persists.** `selectedIds` survives search/filter/sort changes, even
   when selected cards are hidden by the current filter. The action-bar count and the confirm dialog
   always state the **true total** selected. `Select all` adds only the currently **visible (filtered)**
   set. Deselection of hidden items requires clearing (Cancel) or unfiltering — acceptable because the
   confirm dialog states the exact count before anything is deleted.
3. **Confirmation: native `confirm()`.** `Delete N prompts? This cannot be undone.` — consistent with
   the existing single-delete and tag-delete pattern (popup.js `deletePrompt`). No new modal.

## Behavior spec

### State

- `selectionMode: boolean`, `selectedIds: Set<number>` — module-level in popup.js, session-only
  (never persisted to storage).
- Checkbox checked state is re-derived from `selectedIds` inside `createPromptHTML` on every render,
  so re-renders from search/filter/sort keep selections.

### Entering / leaving selection mode

- `Select` button toggles mode on; label/state flips to `Cancel` semantics via the action bar.
- Exits: action-bar **Cancel**, **Escape** key, or successful bulk delete. All exits clear `selectedIds`.
- While in selection mode, per-card action buttons (copy/edit/delete/star/visibility) remain functional;
  clicking the checkbox (or the card's checkbox hit area) toggles membership only.

### Action bar

- Fixed bottom bar, visible only in selection mode. Contents: live count (`N selected`), `Select all`
  (adds all currently visible cards' ids), `Delete (N)` (disabled when N=0), `Cancel`.
- Styled with existing CSS custom-property tokens; dark mode inherits token overrides. No new colors.

### Delete flow

Mirrors `deletePrompt` exactly, N times over, with one save:

1. `confirm('Delete N prompts? This cannot be undone.')` — N is `selectedIds.size` (true total,
   including filtered-out selections).
2. Resolve each selected id → prompt object.
3. Cloud mode only: for every victim **with a `uuid`**, `await PBSync.recordTombstone(uuid)`
   sequentially (recordTombstone read-modify-writes `pb_tombstones`; sequential awaits avoid the
   documented RMW race). No-uuid prompts (never pushed) delete locally with no tombstone — same rule
   as single delete.
4. One `prompts = prompts.filter(...)` + **single** `savePrompts(prompts, cb)`. In cloud mode the
   save's push cycle flushes all queued tombstones (existing two-homogeneous-POST design).
5. `filterAndSortPrompts()`, exit selection mode, clear `selectedIds`.

Tombstones are recorded **before** the save/push, preserving single-delete ordering.

### Edge cases

- Delete-all → existing `.no-prompts` empty state renders.
- Selected-but-hidden cards are deleted; the confirm count said so.
- Sensitive/shielded cards are selectable and deletable (deleting is not revealing).
- Cancel in the confirm dialog leaves selection mode and selections intact.
- Ids no longer present at delete time (shouldn't happen in a popup session) are skipped silently.

## Files

- `popup.js` — selection state, checkbox in `createPromptHTML`, new `data-action` cases in the
  delegated `handlePromptButtonClick`, `bulkDeleteSelected()`, Escape handler, action-bar wiring.
- `popup.html` — Select button, action bar markup + embedded CSS (tokens only).
- Runtime changes only in those two files. No manifest, schema, or permission changes.

## Test harness (BD0, dev-only)

`test-harness/` in the repo — never shipped (added to CLAUDE.md never-include list):

- Serves the **real** `popup.html` + `popup.js` (+ sync scripts) on localhost.
- `chrome-shim.js`: in-memory `chrome.storage.local/sync` (event-compatible), stubbed
  `chrome.identity/runtime/alarms/contextMenus`, `window.confirm` override that auto-accepts and logs
  calls to `window.__confirmCalls`, seedable fixture prompts (10 by default, mixed tags/favorites/
  sensitive, some with uuids + `storagePref: 'cloud'` scenario support), and a `fetch` shim that
  captures Supabase POST/GET bodies to `window.__fetchLog` for cloud-mode assertions.
- Purpose: claude-in-chrome cannot open `chrome-extension://` pages; the harness makes every popup UI
  assertion machine-verifiable in a real tab. LB's real-extension checks remain the merge gate.

## Security

- No new `innerHTML` sinks with user content; checkbox markup carries only numeric `data-prompt-id`.
- All existing escapeHTML/sanitizeInput rules unchanged.
- `npm run lint && npm run security` must be 0 errors before every commit.

## Out of scope

- Bulk tag-edit / bulk favorite / bulk export (future).
- Undo/trash. The confirm dialog is the safety.
- Custom confirmation modal (revisit if LB dislikes native confirm in live test).

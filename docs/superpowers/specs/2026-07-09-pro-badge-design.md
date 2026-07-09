# Pro Badge (verified-style seal) Design

**Date:** 2026-07-09
**Status:** Approved by LB (seal shape, teal color, dimmed-everywhere behavior, and cache-then-refresh all chosen explicitly).
**Parent:** Prompt Box Pro B2 (`2026-07-04-promptbox-pro-b2-design.md`). Ships on the `feature/pro-b2-phase2-cloud-sync` branch, in the same future 4.0.0 store release as Phases 1-3. No version bump now.

## Goal

Give Pro users a visible status marker, styled like a social verified checkmark, so being Pro feels like something and free users constantly see the thing they don't have. Both audiences see the badge; only its state differs.

## The badge

A teal rosette seal: a 12-lobe scalloped circle with a white checkmark. Original artwork (generated arc path below), same genre as social verified badges but NOT a copy of any platform's asset.

Canonical SVG (24x24 viewBox; size via width/height attributes per placement):

```html
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path fill="currentColor" d="M12 2.8 A2.75 2.75 0 0 1 16.6 4.03 A2.75 2.75 0 0 1 19.97 7.4 A2.75 2.75 0 0 1 21.2 12 A2.75 2.75 0 0 1 19.97 16.6 A2.75 2.75 0 0 1 16.6 19.97 A2.75 2.75 0 0 1 12 21.2 A2.75 2.75 0 0 1 7.4 19.97 A2.75 2.75 0 0 1 4.03 16.6 A2.75 2.75 0 0 1 2.8 12 A2.75 2.75 0 0 1 4.03 7.4 A2.75 2.75 0 0 1 7.4 4.03 A2.75 2.75 0 0 1 12 2.8 Z"/>
  <path d="M8 12.6l2.6 2.6 5.4-6" fill="none" stroke="var(--color-surface, #fff)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- Seal fill: `currentColor`, with the wrapper setting `color: var(--color-info)` (#0d9488 light, #14b8a6 dark; existing tokens, no new colors).
- Check stroke: the surface color, so the check reads as "punched out" in both themes.
- Dimmed (non-Pro) state: CSS `filter: grayscale(1); opacity: 0.45;` on the wrapper. Same markup, one class toggles.

## Placements

1. **Popup header** (`popup.html`, inside `.header`, immediately after `<h1>Prompt Box</h1>`): a `<button id="proBadgeHeader" class="pro-badge">` wrapping a 17x17 seal. A button, not a span, because it is clickable and must be keyboard-reachable.
2. **Account panel** (`#accountSignedIn`, next to the email line): `<span id="proBadgeAccount" class="pro-badge">` with a 16x16 seal plus `<span id="proBadgeWord">PRO MEMBER</span>` (10px, 800 weight, letter-spacing 0.08em, teal). The wordmark shows ONLY when Pro; the seal itself shows dimmed for signed-in free users. The signed-out account view is unchanged (its existing upgrade pitch does that job; the dimmed header badge provides the aspiration hook there).

## States and behavior

| State | Header seal | Account seal | Wordmark | Tooltip / aria-label |
|---|---|---|---|---|
| Pro (cached true) | vivid teal | vivid teal | PRO MEMBER | "Prompt Box Pro member" |
| Signed in, free | dimmed | dimmed | hidden | "Get Prompt Box Pro" |
| Signed out | dimmed | (panel hidden) | hidden | "Get Prompt Box Pro" |

Clicking the header badge (either state) opens Settings and activates the Account tab, reusing the existing settings-open and tab-switching code paths. No new navigation mechanism.

## State source: cache-then-refresh

- New `chrome.storage.local` key: `pb_is_pro` (boolean; absent = false).
- **Paint from cache:** on popup open (`DOMContentLoaded` init), `renderProBadge()` reads `pb_is_pro` and paints immediately. No network wait, no flicker.
- **Refresh:** `refreshCloudOption()` already calls `PBSync.fetchEntitlement()` on every popup open and on sign-in/out (via `renderAccount`). Extend it: when the fetch returns a DEFINITIVE answer (non-null), write `pb_is_pro = ent.is_pro` and call `renderProBadge()` again. A null (offline, token blip, transient error) changes nothing, matching the cloud-mode demotion rule: transient failure never strips status.
- **Sign-out:** the existing sign-out handler sets `pb_is_pro = false` and re-renders immediately. (It already calls `PBSync.resetSyncState()`; the cache write sits alongside it in popup.js, not inside sync-auth.js.)
- Revocation: cache flips on the next successful entitlement fetch, same popup open.

## What is NOT touched

`sync-engine.js`, `sync-auth.js`, `background.js`, `content.js`, `manifest.json`, the database schema, and all free-user flows other than the two new badge elements. The `pb_is_pro` cache is a UI convenience only; it gates nothing (cloud-mode gating still runs on live entitlement in `refreshCloudOption`, unchanged).

## Security / constraints

- All markup is static inline SVG in popup.html; no `innerHTML`, no user content, CSP untouched.
- The cache is client-side display state only. A user editing `pb_is_pro` in DevTools gets a cosmetic badge and nothing else: cloud-mode gating keeps using the live entitlement fetch, and the server-side `guard_profile_entitlement` trigger still blocks real self-promotion. Acceptable by design.
- New CSS lives in the existing `<style>` block using existing tokens.

## Testing

Manual, folded into the Phase 2 live-test session (runbook `supabase/TEST-phase2-cloud-sync.md` gets a short badge section):

1. Signed out: dimmed header badge; click opens Settings > Account.
2. Signed in free: dimmed badge in header and account row; no wordmark.
3. `is_pro = true` (already flipped): vivid teal badge both places + PRO MEMBER; verify in light AND dark mode.
4. Reopen popup: badge is vivid instantly (cache), no flash.
5. Offline reopen: badge unchanged (transient null does not dim it).
6. Sign out: dims immediately. Set `is_pro = false` in SQL, sign in: dims after the fetch.

## Out of scope

Any badge on the website, store listing imagery, animated badge effects, and any additional Pro-status surfaces (card watermarks, etc.). Revisit after Phase 3 billing ships.

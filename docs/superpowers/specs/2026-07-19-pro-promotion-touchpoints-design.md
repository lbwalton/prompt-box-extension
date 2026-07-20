# Pro Promotion Touchpoints (Extension, Pass 1) — Design

**Date:** 2026-07-19
**Status:** Approved
**Scope:** Extension only. The promptbox-site pass (pricing emphasis, home CTA) is a separate follow-up.

## Goal

Promote Prompt Box Pro at the moments a free user actually feels the problem Pro solves, without nagging. Tone policy: direct and confident only where the user hits a real wall (the Chrome Sync overflow banner); everywhere else ambient and quiet. No popups, no periodic promos, no dismissible cards.

All CTAs route to the existing Settings > Account panel via `openAccountPanel()` (popup.js). Sign-in, the plan picker ($2.99/mo, $19/yr, $39 lifetime), and Stripe checkout already live there; this design adds no new auth or billing paths.

## 1. Earned moment: sync-fallback banner

Files: `popup.html` (`#syncFallbackBanner`, line ~1877), `popup.js` (`showSyncFallbackBanner()`, line ~857).

The banner appears when the library overflows Chrome Sync quota (`storagePref === 'sync' && syncFallback`). It is triggered from two code paths, both already funneled through `showSyncFallbackBanner()`:

1. Popup load (`finishLoadPrompts`, popup.js ~722)
2. Live mid-session when a sync save fails (`savePrompts` fallback, popup.js ~844)

All new rendering logic lives inside `showSyncFallbackBanner()` so both paths get it.

### Variant selection

`showSyncFallbackBanner()` reads `pb_is_pro` from `chrome.storage.local` (the same display cache the header badge uses; display-only, gates nothing) and toggles between two pre-authored HTML variants inside the banner:

- **Non-Pro variant** (signed out, or signed in without Pro): the upsell.
- **Pro variant**: today's informational text and CSV link, byte-for-byte unchanged. Rationale: the existing `syncOfferBanner` ("Turn on Cloud Sync") already serves signed-in Pro users not in cloud mode; a second pitch would stack two banners saying different things.

### Non-Pro variant content

> **Your library outgrew Chrome Sync.** Your prompts are safe on this device, but they're only on this device. Pro syncs any size library across all your browsers.
>
> [ Unlock cloud sync ]  · or export a CSV backup

- "Unlock cloud sync" button → `openAccountPanel()`.
- "export a CSV backup" stays wired to the existing `exportPrompts` listener (`#syncFallbackExportBtn`), visually demoted to a secondary text link.

### Markup and safety

- Both variants are static HTML in `popup.html`, toggled via JS `style.display`. No inline scripts (CSP), no user input rendered (no escaping concerns), listeners attached in `popup.js` as today.
- Existing hide behaviors preserved, same element ID: switching to local mode hides the banner (`updateStoragePrefUI`), a later successful sync save hides it (`savePrompts` success path).
- CTA button reuses the `.survey-yes-btn` style family from the cloud-sync offer banner for visual consistency; banner keeps its `.sync-fallback-banner` warning styling.

## 2. Whisper touchpoints

Ambient, one-line, never interruptive. All link to the Account tab.

### 2a. Storage Location panel: unlock the dead row

File: `popup.html` (`#storagePrefCloudOption`), `popup.js` (`refreshCloudOption`).

Today the "Prompt Box Cloud" row is disabled for non-Pro users and clicking it does nothing. Change: when the cloud radio is disabled, a click anywhere on the row opens the Account tab. The radio itself stays disabled (no accidental storage-mode switch). Add `cursor: pointer` and a title/tooltip: "Requires Prompt Box Pro. Click to learn more." When the user is Pro (radio enabled), the row behaves exactly as today.

Implementation: one click listener on the wrapper that checks `radio.disabled` before acting, so no state juggling with `refreshCloudOption`.

### 2b. Backup notice (local mode only)

File: `popup.js` (`updateBackupNotice()`, ~line 881).

Append one quiet sentence to the local-mode notice: "Prefer automatic backups? That's Prompt Box Pro." with "Prompt Box Pro" as a link (button styled as `.about-link`) that opens the Account tab. Sync-mode notice text unchanged. Because this notice is set via `textContent` today, the Pro sentence is added as a separate static element in `popup.html` next to `#backupNoticeText`, shown only when `storagePref === 'local'`; `updateBackupNotice()` toggles its visibility. No innerHTML.

### 2c. About panel

File: `popup.html` (`#panel-about`).

One line under the version: "Cloud sync across devices, no size limits. Get Prompt Box Pro" where "Get Prompt Box Pro" is an `.about-link`-styled button opening the Account tab. Hidden for Pro members? No: keep it static and always visible; it reads as a feature statement, and Pro members rarely open About. (Simplicity over a third state-aware surface.)

### 2d. Header seal

Already exists (`#proBadgeHeader`, dimmed when free, opens Account panel). No change.

### Deliberate cut

No empty-state hint. A user with zero prompts has nothing to sync; a pitch there is noise. (This drops the "empty state" item from the original scope sketch, agreed during design.)

## 3. Explicitly out of scope

- promptbox-site changes (pass 2)
- Promo cards, periodic nudges, dismissible banners, badges beyond what exists
- Any change to auth, entitlement, sync, or billing logic
- New storage keys, permissions, or manifest changes (beyond version bump)

## 4. Ship details

- Version: **4.0.1** (patch: UX/visual change, no new capability)
- Bump `manifest.json`, `#appVersion` in popup.html, add user-facing `CHANGELOG.md` entry
- Store listing / privacy docs: no changes expected (no permission or data-handling changes); confirm at pack time
- `npm run security` and `npm run lint` clean before commit

## 5. Verification

Manual, via the dev test harness (`python3 -m http.server 5641`, open `/test-harness/?mode=sync`) with `syncFallback` seeded, across three account states:

1. **Signed out:** banner shows upsell variant; CTA lands on Settings > Account sign-in; CSV link still exports.
2. **Signed in, free:** banner shows upsell variant; CTA lands on plan picker; no `syncOfferBanner` present.
3. **Pro:** banner shows the classic informational variant only; `syncOfferBanner` may appear per its own rules; no double pitch.

Also verify: banner hides on switch to local mode; locked Cloud row click opens Account tab while Pro users' row behaves as before; backup-notice Pro line appears only in local mode; About line links correctly; dark mode appearance of all touched surfaces.

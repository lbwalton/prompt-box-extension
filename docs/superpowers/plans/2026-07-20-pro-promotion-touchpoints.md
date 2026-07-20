# Pro Promotion Touchpoints (Extension, Pass 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the "Library too large for Chrome Sync" banner into a state-aware Pro upsell for non-Pro users, and add three quiet Pro pointers (locked Cloud storage row, local-mode backup notice, About panel), all routing to the existing Settings > Account panel.

**Architecture:** All CTAs call the existing `openAccountPanel()` in popup.js; no new auth, billing, or sync logic. The banner gets two pre-authored HTML variants toggled by `showSyncFallbackBanner()` based on the `pb_is_pro` display cache. The dev test harness gains `?fallback=1` / `?signedin=1` params so every state is reproducible.

**Tech Stack:** Vanilla JS Chrome extension (MV3), single-file popup.html with embedded CSS, `chrome.storage`, dev-only localhost test harness (`test-harness/`).

**Spec:** `docs/superpowers/specs/2026-07-19-pro-promotion-touchpoints-design.md`

## Global Constraints

- CSP is `script-src 'self'; object-src 'self'`: no inline scripts, no inline event handlers. All listeners attach in popup.js.
- Never render user input via `innerHTML`. (All markup added here is static; no user input involved.)
- No new permissions, no new storage keys, no manifest changes other than the version bump in Task 4.
- `manifest.json` is always lowercase.
- Pro users must never see the upsell variant: the existing `syncOfferBanner` already serves them; two banners must never pitch at once.
- The Pro variant of the fallback banner keeps today's informational text byte-for-byte.
- `npm run security` and `npm run lint` must pass before every commit.
- `test-harness/` is dev-only and never ships in the release zip.
- No em-dashes in any new user-facing copy or changelog text.
- All work happens in `prompt-box-extension/` on branch `feat/pro-promotion-touchpoints`.

---

### Task 1: Test harness states for sync-fallback and signed-in sync mode

Dev-only groundwork: make every account/fallback state reproducible in the harness so Tasks 2 and 3 can be verified deterministically.

**Files:**
- Modify: `test-harness/chrome-shim.js:78-81` (the `mode === 'sync'` branch)

**Interfaces:**
- Consumes: `config` (query params from `window.__HARNESS_CONFIG`), existing `FIXTURES`, `clone()`, `localSeed`, `syncSeed`.
- Produces: harness URLs used by later tasks:
  - `?mode=sync&fallback=1` → signed out, `syncFallback` seeded (local copy authoritative)
  - `?mode=sync&fallback=1&signedin=1&pro=0` → signed in, free
  - `?mode=sync&fallback=1&signedin=1` → signed in, Pro (profiles route already answers `is_pro:true` when `pro` ≠ `'0'`)

- [ ] **Step 1: Create the working branch**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
git checkout -b feat/pro-promotion-touchpoints
```

- [ ] **Step 2: Extend the sync branch of the seeder**

In `test-harness/chrome-shim.js`, replace the current `mode === 'sync'` block:

```js
  if (mode === 'sync') {
    seededPrompts = clone(FIXTURES);
    syncSeed.prompts = seededPrompts;
    // storagePref unset -> popup defaults to 'sync'
  } else if (mode === 'cloud') {
```

with:

```js
  if (mode === 'sync') {
    seededPrompts = clone(FIXTURES);
    // ?fallback=1 -> the library already overflowed Chrome Sync: the local
    // copy is authoritative (popup.js syncFallback load path) and the
    // fallback banner must show. ?signedin=1 adds a session; combine with
    // ?pro=0 for the signed-in-but-free upsell state (the profiles route
    // below answers is_pro to match config.pro).
    if (config.fallback === '1') {
      localSeed.syncFallback = true;
      localSeed.prompts = seededPrompts;
    } else {
      syncSeed.prompts = seededPrompts;
    }
    if (config.signedin === '1') {
      var syncIsPro = config.pro !== '0';
      localSeed.pb_session = {
        access_token: 'harness-access-token',
        refresh_token: 'harness-refresh-token',
        expires_at: Date.now() + 6 * 3600 * 1000,
        email: 'harness@promptbox.test',
        user_id: 'harness-user-0001',
      };
      localSeed.pb_is_pro = syncIsPro;
      localSeed.pb_plan = syncIsPro ? 'lifetime' : null;
    }
    // storagePref unset -> popup defaults to 'sync'
  } else if (mode === 'cloud') {
```

- [ ] **Step 3: Verify the seeds in a browser**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
python3 -m http.server 5641
```

Open each URL and check (banner behavior itself changes in Task 2; here we only prove seeding):

1. `http://127.0.0.1:5641/test-harness/?mode=sync&fallback=1` → the 10 fixture prompts render AND the current yellow "Library too large for Chrome Sync." banner is visible (existing code path: `storagePref === 'sync' && syncFallback`).
2. `http://127.0.0.1:5641/test-harness/?mode=sync&fallback=1&signedin=1` → same, plus Settings > Account shows "Signed in as harness@promptbox.test" with the PRO MEMBER word, and the "Turn on Cloud Sync" offer banner appears.
3. `http://127.0.0.1:5641/test-harness/?mode=sync&fallback=1&signedin=1&pro=0` → signed in, no PRO word, Account panel shows the plan picker (Pro Monthly $2.99/mo, Pro Annual $19/yr, Founding Lifetime $39 once).
4. `http://127.0.0.1:5641/test-harness/?mode=sync` (regression) → prompts render from sync seed, no banner.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint && npm run security
git add test-harness/chrome-shim.js
git commit -m "test: harness params for sync-fallback and signed-in sync states

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RaifbdcXc7Xn9rJDHzPhzh"
```

---

### Task 2: State-aware sync-fallback banner with Pro upsell variant

**Files:**
- Modify: `popup.html:1876-1880` (the `#syncFallbackBanner` markup)
- Modify: `popup.js:857-860` (`showSyncFallbackBanner`)
- Modify: `popup.js:248` (listener wiring in `setupEventListeners`)
- Modify: `popup.js:939-941` (entitlement cache write inside `refreshCloudOption`)

**Interfaces:**
- Consumes: `openAccountPanel()` (popup.js:301, no args, opens Settings > Account), `exportPrompts` (existing CSV export handler), `pb_is_pro` display cache in `chrome.storage.local`, CSS classes `.survey-yes-btn`, `.survey-actions`, `.about-link`, `.sync-fallback-banner`.
- Produces: element IDs `#syncFallbackInfo`, `#syncFallbackUpsell`, `#syncFallbackUpgradeBtn`, `#syncFallbackExportLink`; function `refreshSyncFallbackVariant()` (no args, no return; re-picks the variant only if the banner is already visible). Task 4's verification sweep relies on these.

- [ ] **Step 1: Replace the banner markup in popup.html**

Replace lines 1876-1880:

```html
  <!-- Sync quota fallback warning -->
  <div class="sync-fallback-banner" id="syncFallbackBanner">
    <strong>Library too large for Chrome Sync.</strong> Your prompts are saved locally on this device only.
    <button class="about-link" id="syncFallbackExportBtn" style="background:none;border:none;padding:0;cursor:pointer;font-size:12px;">Export a CSV backup</button> to protect your data.
  </div>
```

with:

```html
  <!-- Sync quota fallback warning. Two variants, toggled by
       showSyncFallbackBanner(): Pro members keep the informational text
       (the cloud-sync offer banner is their one-click fix); everyone else
       gets the Pro upsell, since cloud sync is the actual fix for
       outgrowing Chrome Sync. -->
  <div class="sync-fallback-banner" id="syncFallbackBanner">
    <div id="syncFallbackInfo">
      <strong>Library too large for Chrome Sync.</strong> Your prompts are saved locally on this device only.
      <button class="about-link" id="syncFallbackExportBtn" style="background:none;border:none;padding:0;cursor:pointer;font-size:12px;">Export a CSV backup</button> to protect your data.
    </div>
    <div id="syncFallbackUpsell" style="display:none;">
      <strong>Your library outgrew Chrome Sync.</strong> Your prompts are safe on this device, but they're only on this device. Pro syncs any size library across all your browsers.
      <div class="survey-actions" style="margin-top:8px;align-items:center;">
        <button class="survey-yes-btn" id="syncFallbackUpgradeBtn">Unlock cloud sync</button>
        <button class="about-link" id="syncFallbackExportLink" style="font-size:12px;">or export a CSV backup</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Make showSyncFallbackBanner state-aware in popup.js**

Replace lines 856-860:

```js
// Show the sync quota fallback banner
function showSyncFallbackBanner() {
  const banner = document.getElementById('syncFallbackBanner');
  if (banner) banner.style.display = 'block';
}
```

with:

```js
// Show the sync quota fallback banner. Non-Pro users see the Pro upsell
// variant (cloud sync is the actual fix for outgrowing Chrome Sync); Pro
// users keep the informational text, because the cloud-sync offer banner
// already gives them the one-click fix and two banners must never pitch
// at once. pb_is_pro is the same display-only cache the header badge
// paints from; it gates nothing.
function showSyncFallbackBanner() {
  const banner = document.getElementById('syncFallbackBanner');
  if (!banner) return;
  chrome.storage.local.get(['pb_is_pro'], function (r) {
    const isPro = r.pb_is_pro === true;
    const info = document.getElementById('syncFallbackInfo');
    const upsell = document.getElementById('syncFallbackUpsell');
    if (info) info.style.display = isPro ? 'block' : 'none';
    if (upsell) upsell.style.display = isPro ? 'none' : 'block';
    banner.style.display = 'block';
  });
}

// Re-pick the banner variant after a definitive entitlement answer (e.g.
// the user upgraded on another device, then reopened the popup): a visible
// banner must not keep pitching Pro to a paying member. No-op when the
// banner is hidden.
function refreshSyncFallbackVariant() {
  const banner = document.getElementById('syncFallbackBanner');
  if (banner && banner.style.display === 'block') showSyncFallbackBanner();
}
```

- [ ] **Step 3: Re-pick the variant on definitive entitlement answers**

In `refreshCloudOption` (popup.js, around line 939), replace:

```js
  if (ent) {
    chrome.storage.local.set({ pb_is_pro: ent.is_pro === true, pb_plan: ent.plan || null }, renderProBadge);
  }
```

with:

```js
  if (ent) {
    chrome.storage.local.set({ pb_is_pro: ent.is_pro === true, pb_plan: ent.plan || null }, function () {
      renderProBadge();
      refreshSyncFallbackVariant();
    });
  }
```

- [ ] **Step 4: Wire the new banner listeners**

In `setupEventListeners` (popup.js), directly below line 248 (`document.getElementById('syncFallbackExportBtn')?.addEventListener('click', exportPrompts);`), add:

```js
  document.getElementById('syncFallbackExportLink')?.addEventListener('click', exportPrompts);
  document.getElementById('syncFallbackUpgradeBtn')?.addEventListener('click', openAccountPanel);
```

- [ ] **Step 5: Verify all three banner states in the harness**

With `python3 -m http.server 5641` running from the extension root:

1. `?mode=sync&fallback=1` (signed out): banner shows "Your library outgrew Chrome Sync." with the accent "Unlock cloud sync" button and the smaller "or export a CSV backup" link. The old informational text is NOT visible. Clicking "Unlock cloud sync" opens Settings on the Account tab showing "Sign in with Google". Clicking "or export a CSV backup" downloads the CSV.
2. `?mode=sync&fallback=1&signedin=1&pro=0` (signed in, free): same upsell variant; "Unlock cloud sync" lands on the Account tab with the plan picker visible.
3. `?mode=sync&fallback=1&signedin=1` (Pro): banner shows the ORIGINAL text "Library too large for Chrome Sync." with the CSV link, no upsell button; the separate "Turn on Cloud Sync" offer banner appears below it. Exactly one pitch on screen.
4. `?mode=sync` (no fallback): no banner at all.
5. Dark mode spot-check of state 1 (DevTools > Rendering > emulate `prefers-color-scheme: dark`): banner text and buttons legible.

- [ ] **Step 6: Lint, security, commit**

```bash
npm run lint && npm run security
git add popup.html popup.js
git commit -m "feat: Pro upsell variant on the sync-overflow banner for non-Pro users

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RaifbdcXc7Xn9rJDHzPhzh"
```

---

### Task 3: Whisper touchpoints (locked Cloud row, backup notice, About panel)

**Files:**
- Modify: `popup.html:1987-1992` (backup notice markup)
- Modify: `popup.html:2005-2013` (About panel)
- Modify: `popup.js:248` area (listener wiring in `setupEventListeners`)
- Modify: `popup.js:881-889` (`updateBackupNotice`)
- Modify: `popup.js:943` (`refreshCloudOption` tooltip line)

**Interfaces:**
- Consumes: `openAccountPanel()`, `storagePref` module global, `#storagePrefCloudOption` wrapper + `#storagePrefCloud` radio, `.about-link` CSS class.
- Produces: element IDs `#backupNoticePro`, `#backupNoticeProBtn`, `#aboutProBtn`. Task 4's sweep relies on these.

- [ ] **Step 1: Add the Pro line to the backup notice markup**

In popup.html, replace:

```html
        <span id="backupNoticeText">Your prompts are stored only on this device. Export a CSV backup before removing the extension or resetting Chrome to avoid losing your library.</span>
```

with (the wrapper span keeps `.backup-notice`'s flex layout at two children: icon + text block):

```html
        <span>
          <span id="backupNoticeText">Your prompts are stored only on this device. Export a CSV backup before removing the extension or resetting Chrome to avoid losing your library.</span>
          <span id="backupNoticePro" style="display:none;"> Prefer automatic backups? <button class="about-link" id="backupNoticeProBtn" style="font-size:12px;">That's Prompt Box Pro.</button></span>
        </span>
```

- [ ] **Step 2: Toggle the Pro line in updateBackupNotice**

In popup.js, replace lines 880-889:

```js
// Update the backup notice text to match current storage mode
function updateBackupNotice() {
  const notice = document.getElementById('backupNoticeText');
  if (!notice) return;
  if (storagePref === 'local') {
    notice.textContent = 'Your prompts are stored only on this device. Export a CSV backup before removing the extension or resetting Chrome to avoid losing your library.';
  } else {
    notice.textContent = 'Your prompts sync across Chrome profiles, but removing the extension from all devices permanently deletes synced data. Export a CSV backup before uninstalling.';
  }
}
```

with:

```js
// Update the backup notice text to match current storage mode. The quiet
// Pro pointer shows only in local mode, where "manual CSV backups" is the
// pain cloud sync removes; sync mode keeps the plain warning.
function updateBackupNotice() {
  const notice = document.getElementById('backupNoticeText');
  const proLine = document.getElementById('backupNoticePro');
  if (!notice) return;
  if (storagePref === 'local') {
    notice.textContent = 'Your prompts are stored only on this device. Export a CSV backup before removing the extension or resetting Chrome to avoid losing your library.';
    if (proLine) proLine.style.display = 'inline';
  } else {
    notice.textContent = 'Your prompts sync across Chrome profiles, but removing the extension from all devices permanently deletes synced data. Export a CSV backup before uninstalling.';
    if (proLine) proLine.style.display = 'none';
  }
}
```

- [ ] **Step 3: Add the About panel line**

In popup.html, inside `#panel-about`, after the line:

```html
        <p>Prompts sync across Chrome profiles via Chrome Sync. Use <strong>Import / Export</strong> to back up your library before uninstalling.</p>
```

add:

```html
        <p>Cloud sync across devices, no size limits. <button class="about-link" id="aboutProBtn">Get Prompt Box Pro</button></p>
```

- [ ] **Step 4: Tooltip on the locked Cloud row**

In `refreshCloudOption` (popup.js, around line 943), replace:

```js
  radio.disabled = !allowed;
  wrapper.style.opacity = allowed ? '1' : '0.5';
```

with:

```js
  radio.disabled = !allowed;
  wrapper.style.opacity = allowed ? '1' : '0.5';
  wrapper.title = allowed ? '' : 'Requires Prompt Box Pro. Click to learn more.';
```

- [ ] **Step 5: Wire the listeners**

In `setupEventListeners` (popup.js), directly below the two listeners added in Task 2 (`syncFallbackExportLink` / `syncFallbackUpgradeBtn`), add:

```js
  document.getElementById('backupNoticeProBtn')?.addEventListener('click', openAccountPanel);
  document.getElementById('aboutProBtn')?.addEventListener('click', openAccountPanel);
  // Locked Cloud row (non-Pro): the row opens the Account tab instead of
  // being a dead end. Pro users keep the normal radio behavior; the radio
  // itself stays disabled either way, so no accidental mode switch.
  document.getElementById('storagePrefCloudOption')?.addEventListener('click', function (e) {
    const radio = document.getElementById('storagePrefCloud');
    if (radio && radio.disabled) {
      e.preventDefault();
      openAccountPanel();
    }
  });
```

Note: `.storage-pref-option` already has `cursor: pointer` in its CSS; no style change needed.

- [ ] **Step 6: Verify in the harness**

With the server running:

1. `?mode=local`: open Settings > Import / Export. The backup notice ends with "Prefer automatic backups? That's Prompt Box Pro." Clicking the link jumps to the Account tab. Clicking the greyed "Prompt Box Cloud" row also jumps to the Account tab; hovering it shows the "Requires Prompt Box Pro" tooltip; the radio stays unselected.
2. `?mode=sync`: the backup notice shows the sync wording with NO Pro sentence.
3. `?mode=cloud` (signed-in Pro, cloud enabled): the Cloud row is active; clicking it selects the radio normally and does NOT jump to the Account tab.
4. Any mode: Settings > About shows "Cloud sync across devices, no size limits. Get Prompt Box Pro"; the link opens the Account tab.
5. Dark mode spot-check of the backup notice and About line.

- [ ] **Step 7: Lint, security, commit**

```bash
npm run lint && npm run security
git add popup.html popup.js
git commit -m "feat: quiet Pro pointers on locked cloud row, backup notice, About panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RaifbdcXc7Xn9rJDHzPhzh"
```

---

### Task 4: Version 4.0.1, changelog, final sweep

**Files:**
- Modify: `manifest.json` (`"version": "4.0.0"` → `"4.0.1"`)
- Modify: `popup.html:2007` (`#appVersion` text)
- Modify: `CHANGELOG.md` (new top section)

**Interfaces:**
- Consumes: everything produced by Tasks 2 and 3.
- Produces: release-ready branch. (Store listing and privacy docs need no edits: no permission, connection, or data-handling changes. Confirm, don't edit.)

- [ ] **Step 1: Bump the version in both places**

In `manifest.json`: `"version": "4.0.1",`

In popup.html line 2007:

```html
        <p>Version: <strong id="appVersion">4.0.1</strong></p>
```

- [ ] **Step 2: Add the changelog entry**

At the top of `CHANGELOG.md`, directly under `# Changelog`, add:

```markdown
## [4.0.1] - 2026-07-20
### Changed
- When your library outgrows Chrome Sync, the warning banner now offers the real fix: Prompt Box Pro cloud sync has no size limit. The CSV backup option is still right there. Pro members keep the original notice.
- The "Prompt Box Cloud" storage option now opens the Account panel when clicked while locked, instead of doing nothing.
- Added small pointers to Prompt Box Pro in the device-only backup notice and the About panel. No popups, nothing to dismiss.
```

- [ ] **Step 3: Confirm the store docs need no changes**

Skim `prompt-box-store-listing.md` and `prompt-box-privacy-practices.md`: this release adds no permissions, no external connections, and no data-handling changes, so both files stay untouched. If that skim contradicts this, stop and flag it instead of editing.

- [ ] **Step 4: Full verification sweep**

Run the complete matrix from Tasks 2 and 3 once more on the final code (all seven harness URLs), plus:

1. `?mode=sync&fallback=1&signedin=1&pro=0`: in Settings > Account, the Founding Lifetime row is visible and "Upgrade" shows "Finish checkout in the new tab..." wiring intact (harness stubs checkout; no real charge).
2. Settings > About shows "Version: 4.0.1".
3. Hide behaviors intact on `?mode=sync&fallback=1`: switching Storage Location to "This device only" hides the banner; reloading and instead editing any prompt (the harness sync save succeeds, clearing `syncFallback`) also hides it.
4. `npm run lint && npm run security` both clean.

- [ ] **Step 5: Commit**

```bash
git add manifest.json popup.html CHANGELOG.md
git commit -m "release: 4.0.1 Pro promotion touchpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RaifbdcXc7Xn9rJDHzPhzh"
```

Do NOT pack a zip or push in this plan; shipping is a separate explicit step.

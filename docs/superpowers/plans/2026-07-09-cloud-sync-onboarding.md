# Cloud Sync Onboarding (banner-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show signed-in Pro users who are not in cloud mode a one-click banner in the main popup ("Turn on Cloud Sync" / "Not now"), with copy that adapts to whether the cloud and this device have prompts, and retire the obsolete cloud-sync survey banner.

**Architecture:** A new `PBSync.cloudPromptCount()` (PostgREST `Prefer: count=exact` probe) feeds `maybeOfferCloudSync(ent)` in popup.js, which is called at the end of the existing `refreshCloudOption()` so it reuses the one entitlement fetch per popup open and inherits the `entitlementEpoch` stale-answer guard. The banner replaces the old `cloudSyncSurvey` markup and reuses its CSS classes; the survey's JS is removed. NO auto-enable exists anywhere: every path into cloud mode is an explicit click (LB decision, recorded in the spec).

**Tech Stack:** Vanilla JS MV3 popup (no build step), existing CSS classes, `chrome.storage.local` key `pb_sync_offer_dismissed`. Lint via `npm run lint`, security via `npm run security`.

**Spec:** `docs/superpowers/specs/2026-07-09-cloud-sync-onboarding-design.md`
**Branch:** `feature/pro-b2-phase2-cloud-sync` (ships in the same future 4.0.0 release; no version bump now).

## Global Constraints

- NO auto-enable of cloud mode, under any condition. The banner's [Turn on Cloud Sync] click is the only path this feature adds, and it calls the existing `setStoragePref('cloud')`.
- Banner shows ONLY when ALL hold: definitive entitlement `ent.is_pro === true`, `storagePref !== 'cloud'`, `pb_sync_offer_dismissed` not set, and `cloudPromptCount()` returned non-null. Transient failures (null ent or null count) show nothing and re-evaluate next popup open.
- "Not now" sets `pb_sync_offer_dismissed = true` (chrome.storage.local). Sign-out removes the key so a fresh sign-in re-offers.
- `cloudPromptCount()` is display/offer logic only; it never gates sync operations.
- No `innerHTML` with dynamic content: banner copy is set via `textContent` only.
- The old survey (`cloudSyncSurvey` markup, `checkCloudSyncSurvey`, `dismissSurvey`, its three listeners, and the `'cloudSyncSurvey'` entries in the `chrome.storage.sync.get` arrays) is fully removed. The legacy `cloudSyncSurvey` key already stored in users' chrome.storage.sync is left orphaned on purpose (harmless; do not write to chrome.storage.sync to clean it).
- Files touched: `sync-engine.js`, `popup.html`, `popup.js`, `supabase/TEST-phase2-cloud-sync.md` only.
- Free users and signed-out users see zero change (survey removal excepted, which only ever showed a marketing question).
- Before every commit: `npm run lint` and `npm run security` pass with 0 errors. `node --check` each touched JS file.
- No automated test runner; verification = lint/security + node --check + manual checks batched to the live session/runbook.

---

### Task 1: `PBSync.cloudPromptCount()`

**Files:**
- Modify: `sync-engine.js` (new function inside the IIFE + export)

**Interfaces:**
- Consumes: `_authedFetch(path, options)` (existing internal helper; rejects when signed out).
- Produces: `PBSync.cloudPromptCount()` → Promise of `number | null`. Number = count of non-deleted cloud prompt rows for this account; null on ANY failure (signed out, network, non-OK response, unparseable header).

- [ ] **Step 1: Add the function**

In `sync-engine.js`, inside the IIFE, below `fetchEntitlement` (keep the entitlement/probe helpers together), add:

```js
  // Count of live (non-deleted) prompts in the cloud for this account.
  // Display/offer logic only (onboarding banner) — never gates sync.
  // Returns null on any failure so callers can silently skip the offer.
  async function cloudPromptCount() {
    try {
      const res = await _authedFetch(
        '/rest/v1/prompts?select=id&deleted_at=is.null&limit=1',
        { method: 'GET', headers: { Prefer: 'count=exact' } }
      );
      if (!res.ok) return null;
      // content-range looks like "0-0/10", or "*/0" for an empty table.
      const range = res.headers.get('content-range') || '';
      const total = parseInt(range.split('/')[1], 10);
      return Number.isFinite(total) ? total : null;
    } catch (e) {
      return null;
    }
  }
```

- [ ] **Step 2: Export it**

Add `cloudPromptCount,` to the `globalThis.PBSync = { ... }` object (next to `fetchEntitlement`).

- [ ] **Step 3: Verify**

Run: `node --check sync-engine.js && npm run lint && npm run security`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add sync-engine.js
git commit -m "feat(pro): cloudPromptCount probe for sync onboarding"
```

---

### Task 2: Offer banner + survey retirement + runbook

**Files:**
- Modify: `popup.html` (replace the `#cloudSyncSurvey` div)
- Modify: `popup.js` (remove survey code; add `maybeOfferCloudSync`; wire into `refreshCloudOption`, `setupEventListeners`, sign-out handler, `setStoragePref`)
- Modify: `supabase/TEST-phase2-cloud-sync.md` (new section 3c)

**Interfaces:**
- Consumes: `PBSync.cloudPromptCount()` (Task 1); existing `setStoragePref(newPref)`, `refreshCloudOption()` (with its `entitlementEpoch` early return), module-level `prompts` and `storagePref`; existing CSS classes `cloud-sync-survey`, `survey-text`, `survey-actions`, `survey-yes-btn`, `survey-no-btn`.
- Produces: `maybeOfferCloudSync(ent)` (async; `ent` is the entitlement object or null); elements `#syncOfferBanner`, `#syncOfferText`, `#syncOfferYesBtn`, `#syncOfferNoBtn`; storage key `pb_sync_offer_dismissed`.

- [ ] **Step 1: Replace the survey markup in popup.html**

Find the survey div (popup.html ~line 1703):

```html
  <!-- Cloud sync Pro demand survey -->
  <div class="cloud-sync-survey" id="cloudSyncSurvey" style="display:none;">
    <span class="survey-text">Quick question: would you pay for Prompt Box Pro to sync across all devices and browsers?</span>
    <div class="survey-actions">
      <button class="survey-yes-btn" id="surveyYesBtn">Yes, tell me more</button>
      <button class="survey-no-btn" id="surveyNoBtn">No thanks</button>
    </div>
    <button class="survey-dismiss-btn" id="surveyDismissBtn">&#x2715;</button>
  </div>
```

Replace with (same CSS classes, new ids; no dismiss ✕ — "Not now" is the dismissal):

```html
  <!-- Cloud sync onboarding offer (signed-in Pro users not yet in cloud mode) -->
  <div class="cloud-sync-survey" id="syncOfferBanner" style="display:none;">
    <span class="survey-text" id="syncOfferText"></span>
    <div class="survey-actions">
      <button class="survey-yes-btn" id="syncOfferYesBtn">Turn on Cloud Sync</button>
      <button class="survey-no-btn" id="syncOfferNoBtn">Not now</button>
    </div>
  </div>
```

- [ ] **Step 2: Remove the survey JS from popup.js**

Remove ALL of the following (verify each is gone by grepping `Survey` and `survey` afterwards):

1. The three listeners in `setupEventListeners` (~lines 206-213): the `surveyYesBtn` block (including its `chrome.tabs.create` line), `surveyNoBtn`, `surveyDismissBtn`.
2. The functions `checkCloudSyncSurvey` (~line 661) and `dismissSurvey` (~line 669), including their comment lines.
3. In `finishLoadPrompts` (~line 548-556), the whole survey block:

```js
  // Survey shown to all users — even local-only users may want cross-device sync
  if (syncResult) {
    checkCloudSyncSurvey(syncResult.cloudSyncSurvey);
  } else {
    // Local-only mode: read survey state from sync directly
    chrome.storage.sync.get(['cloudSyncSurvey'], function (r) {
      checkCloudSyncSurvey(r.cloudSyncSurvey);
    });
  }
```

4. The `'cloudSyncSurvey'` string from the three `chrome.storage.sync.get([...])` arrays in `loadPrompts` (~lines 473, 502, 508).

- [ ] **Step 3: Add `maybeOfferCloudSync` to popup.js**

Directly below `refreshCloudOption` (~line 691), add:

```js
// ---- Cloud sync onboarding offer ----
// One-click banner for signed-in Pro users not yet in cloud mode. There is
// deliberately NO auto-enable: turning on cloud mode arms this device to
// upload future prompts, so it always requires this explicit click (spec:
// 2026-07-09-cloud-sync-onboarding-design.md).
async function maybeOfferCloudSync(ent) {
  const banner = document.getElementById('syncOfferBanner');
  const text = document.getElementById('syncOfferText');
  if (!banner || !text) return;
  if (!ent || ent.is_pro !== true || storagePref === 'cloud') {
    banner.style.display = 'none';
    return;
  }
  const dismissed = await new Promise(function (res) {
    chrome.storage.local.get(['pb_sync_offer_dismissed'], function (r) {
      res(r.pb_sync_offer_dismissed === true);
    });
  });
  if (dismissed) return;
  const count = await PBSync.cloudPromptCount();
  if (count === null) return; // transient failure: re-evaluate next open
  const cloudNoun = count === 1 ? 'prompt' : 'prompts';
  const localNoun = prompts.length === 1 ? 'prompt' : 'prompts';
  if (count > 0 && prompts.length === 0) {
    text.textContent = 'Your cloud library (' + count + ' ' + cloudNoun + ') is ready. Turn on Cloud sync to download it to this device.';
  } else if (count > 0) {
    text.textContent = 'Your cloud library (' + count + ' ' + cloudNoun + ') is ready. Turn on Cloud sync? Your ' + prompts.length + ' local ' + localNoun + ' will be merged in.';
  } else {
    text.textContent = "You're Pro. Turn on Cloud sync to back up your prompts across your devices.";
  }
  banner.style.display = 'block';
}
```

- [ ] **Step 4: Call it from `refreshCloudOption`**

At the END of `refreshCloudOption` (after the demotion `if` block, still inside the function so the `entitlementEpoch` early return protects it), add:

```js
  maybeOfferCloudSync(ent);
```

(Not awaited on purpose: the offer must never delay the radio/badge updates.)

- [ ] **Step 5: Wire the banner buttons**

In `setupEventListeners`, where the survey listeners were removed, add:

```js
  // Cloud sync onboarding banner
  document.getElementById('syncOfferYesBtn')?.addEventListener('click', function () {
    document.getElementById('syncOfferBanner').style.display = 'none';
    setStoragePref('cloud');
  });
  document.getElementById('syncOfferNoBtn')?.addEventListener('click', function () {
    document.getElementById('syncOfferBanner').style.display = 'none';
    chrome.storage.local.set({ pb_sync_offer_dismissed: true });
  });
```

(`setStoragePref('cloud')` already persists the pref, runs the migration/merge, updates the radio UI, and commits the pull cursor on apply.)

- [ ] **Step 6: Hide the banner when cloud mode turns on via the radio**

In `setStoragePref`, inside the `newPref === 'cloud'` branch (before the `PBSync.migrateToCloud` call), add:

```js
    const offerBanner = document.getElementById('syncOfferBanner');
    if (offerBanner) offerBanner.style.display = 'none';
```

- [ ] **Step 7: Clear the dismissal on sign-out**

In the sign-out handler in `setupAccountUI`, after the `chrome.storage.local.set({ pb_is_pro: false }, renderProBadge);` line, add:

```js
      chrome.storage.local.remove('pb_sync_offer_dismissed');
```

(No banner-hide needed here: the handler's `renderAccount()` → `refreshCloudOption()` → `maybeOfferCloudSync(null)` hides it.)

- [ ] **Step 8: Verify**

Run: `node --check popup.js && npm run lint && npm run security`
Expected: 0 errors. Then grep to confirm no survey remnants: `grep -in "survey" popup.js popup.html` → only the reused CSS class names (`cloud-sync-survey`, `survey-text`, `survey-actions`, `survey-yes-btn`, `survey-no-btn`) in popup.html markup/styles and popup.js should have zero matches.

- [ ] **Step 9: Add runbook section 3c**

In `supabase/TEST-phase2-cloud-sync.md`, after section "3b. Pro badge", insert:

```markdown
## 3c. Cloud sync onboarding banner

1. Signed-in Pro, NOT in cloud mode, cloud has data, this device empty → banner: "Your cloud library (N prompts) is ready. Turn on Cloud sync to download it to this device." One click on [Turn on Cloud Sync] → library appears; banner gone.
2. Same but with local prompts on the device → banner adds "Your M local prompts will be merged in." [Turn on] merges both ways.
3. Pro with an empty cloud → "You're Pro. Turn on Cloud sync to back up your prompts across your devices."
4. [Not now] → banner gone, stays gone across popup reopens.
5. Sign out, sign back in → banner re-offers (dismissal cleared).
6. Already in cloud mode / signed out / free user → banner never shows. The old "would you pay for Pro?" survey banner is gone for everyone.
7. Offline popup open (transient entitlement/count failure) → no banner, no error; re-evaluates next open.
```

- [ ] **Step 10: Commit**

```bash
git add popup.html popup.js supabase/TEST-phase2-cloud-sync.md
git commit -m "feat(pro): cloud sync onboarding banner, survey retired"
```

---

## Self-Review Notes

- **Spec coverage:** banner-only + explicit-click invariant (Global Constraints + Task 2 Step 3 comment); three copy cases with counts + pluralization (Step 3); evaluation on sign-in AND popup open via refreshCloudOption call sites (Step 4 — renderAccount runs on both); once per open (single refreshCloudOption fetch path after the double-fetch removal); dismissal + sign-out re-offer (Steps 5, 7); [Turn on] uses existing setStoragePref('cloud') (Step 5); survey retirement incl. storage-get arrays (Step 2) and no-stacking (markup replaced, Step 1); count probe with count=exact + content-range and null-on-failure (Task 1); testing → runbook 3c (Step 9).
- **Type consistency:** `maybeOfferCloudSync(ent)` matches `refreshCloudOption`'s `ent` (object or null); `cloudPromptCount()` number|null checked with `=== null`; element ids consistent across markup (Step 1), logic (Step 3), listeners (Step 5), and setStoragePref hide (Step 6).
- **Ordering note:** `maybeOfferCloudSync` reads module `prompts` for local counts; `refreshCloudOption` runs from `renderAccount` while `loadPrompts` may still be loading, so the local count could be read as 0 momentarily on a slow open. Worst case the banner says "download" instead of "merge" for a signed-in-Pro-not-cloud user with local data; the [Turn on] path merges correctly regardless (migrateToCloud pushes local first). Accepted; noted for the reviewer.
- **Placeholder scan:** none; all steps carry complete code and exact anchors with search-text (line numbers are advisory, anchors are the quoted code).

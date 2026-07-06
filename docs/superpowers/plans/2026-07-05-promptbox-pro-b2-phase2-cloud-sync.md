# Prompt Box Pro B2 Phase 2: Cloud Sync (offline-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in Pro user pick a new "Prompt Box Cloud" storage mode that keeps `chrome.storage.local` as the instant, offline-first source of truth while delta-syncing prompts to Supabase (push on save, pull on popup open, last-write-wins with delete tombstones), migrating existing local prompts up on first switch.

**Architecture:** A new `sync-engine.js` module (global `PBSync`) talks to Supabase PostgREST over plain `fetch()` using the Phase 1 `PBAuth` access token. The extension never blocks the UI on the network: every mutation writes local first and fires sync in the background. Prompts get a stable `uuid` field (the cloud primary key) that is separate from today's numeric `id` (which stays the device-local DOM identity, untouched, to avoid a risky rewrite of every `p.id ==` comparison). Deletes are remembered as local tombstones and pushed as `deleted_at` so they propagate and never get resurrected by a stale device.

**Tech Stack:** Vanilla JS MV3 popup scripts (no build step), `chrome.storage.local`, `chrome.alarms`, Supabase PostgREST (REST + `Prefer: resolution=merge-duplicates` upsert), `crypto.randomUUID()`. Phase 1 modules `sync-config.js` (`PB_SYNC_CONFIG`) and `sync-auth.js` (`PBAuth`) are reused as-is. Lint via `npm run lint`, security via `npm run security`.

**Spec:** `docs/superpowers/specs/2026-07-04-promptbox-pro-b2-design.md` (Phase 2 section)
**Phase 1 plan (context):** `docs/superpowers/plans/2026-07-04-promptbox-pro-b2-phase1-accounts.md`
**Infra IDs:** `docs/infra/promptbox-pro-config.md`

## Global Constraints

- No build step: all runtime JS loads directly, unbundled. No CDN scripts, no `eval`. CSP stays `script-src 'self'; object-src 'self'`.
- Never `innerHTML` with unsanitized content. Any newly rendered content (e.g. the sync-status line) uses `textContent`. Prompt content continues to render through the existing `escapeHTML()`/`displayPrompts` path.
- No secret keys in the extension, the repo, or any committed file. Only public values (Supabase URL, publishable/anon key) may be embedded — they already live in `sync-config.js`. The service-role key is never used by the client.
- Supabase project ref: `jmxmtiqkpegqywderwkt`; URL `https://jmxmtiqkpegqywderwkt.supabase.co`.
- `is_pro` is only ever written server-side. In Phase 2 it is read-only from the client; for testing it is flipped manually in the Supabase SQL editor. The client MUST gate the Cloud storage option on `is_pro === true`.
- Row-Level Security is already on both tables (Phase 1 migration `0001_init.sql`). The client can only read/write its own rows; a `prompts` insert must satisfy `user_id = auth.uid()`.
- Sync must never block editing. Local (`chrome.storage.local`) is always the immediate source of truth; network work runs after the UI has already updated, and failures are non-fatal (retry next tick).
- Conflict resolution is last-write-wins by `updated_at`. Deletes win via tombstone.
- Local timestamps stay millisecond epoch numbers (`Date.now()`); the cloud wire format is ISO `timestamptz`. All conversion is isolated inside `sync-engine.js`.
- Version bump: Phase 2 does NOT bump the store version. The full Pro feature (Phase 1+2+3) ships to the store as one release later. The `alarms` permission and `sync-engine.js` land now, but the store upload waits.
- Before every commit: `npm run lint` and `npm run security` pass with 0 errors.
- No automated test runner exists in this project. Each task's verification is: lint/security clean, plus the manual checks described in the task (real Supabase project + reloaded unpacked extension, and for round-trip tasks, two Chrome profiles).

**Manual reload procedure (referenced by tasks):** `chrome://extensions` → Prompt Box → reload. For popup changes, reopen the popup. For `background.js`/manifest changes, click the reload icon on the extension card.

**Two-profile test setup (referenced by tasks):** Use two Chrome profiles (e.g. your normal profile + a fresh "Person 2" profile), load the unpacked extension in each, and sign in to the SAME Google account in both. Profile A is the "editor", Profile B is the "observer".

**Manually granting Pro for testing (referenced by tasks):** In the Supabase SQL editor (`https://supabase.com/dashboard/project/jmxmtiqkpegqywderwkt/sql/new`) run:

```sql
update public.profiles set is_pro = true
where user_id = (select id from auth.users where email = 'lbwalton@gmail.com');
```

(The SQL editor runs as the `postgres` role, so the `guard_profile_entitlement` trigger's `auth.role() <> 'service_role'` check is skipped and the write is allowed.) To reset: `set is_pro = false`.

---

### Task 1: Database default so client inserts can omit `user_id`

**Files:**
- Create: `supabase/migrations/0002_prompts_user_default.sql` (run manually in the Supabase SQL editor)

**Interfaces:**
- Produces: `public.prompts.user_id` defaults to `auth.uid()` on insert, so `PBSync.pushLocalChanges` (Task 3) can upsert rows without sending `user_id` while still satisfying the RLS `with check (auth.uid() = user_id)`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0002_prompts_user_default.sql`:

```sql
-- Phase 2: let authenticated client inserts omit user_id.
-- RLS still enforces user_id = auth.uid(); this only provides the value on insert
-- so the extension's PostgREST upsert body doesn't need to carry it.
alter table public.prompts alter column user_id set default auth.uid();
```

- [ ] **Step 2: Run the migration in Supabase**

Open `https://supabase.com/dashboard/project/jmxmtiqkpegqywderwkt/sql/new`, paste the file's contents, run. Expected: "Success. No rows returned."

- [ ] **Step 3: Verify the default is set**

In the SQL editor run:

```sql
select column_default from information_schema.columns
where table_schema='public' and table_name='prompts' and column_name='user_id';
```

Expected: `column_default` shows `auth.uid()`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
git add supabase/migrations/0002_prompts_user_default.sql
git commit -m "feat(pro): default prompts.user_id to auth.uid() for client upserts"
```

---

### Task 2: `sync-engine.js` foundation — helpers, uuid backfill, entitlement

**Files:**
- Create: `sync-engine.js`
- Modify: `popup.html` (load `sync-engine.js` after `sync-auth.js`, before `popup.js`)
- Modify: `.eslintrc.json` (add `PBSync` global)

**Interfaces:**
- Consumes: `PB_SYNC_CONFIG` (`.supabaseUrl`, `.supabaseAnonKey`) from `sync-config.js`; `PBAuth.getAccessToken()` from `sync-auth.js`.
- Produces: global `PBSync` with, so far:
  - `PBSync.ensureUuids(promptsArray)` → `{ prompts, changed }`. Backfills a `crypto.randomUUID()` string on `.uuid` for any prompt missing one. `changed` is true if any were added.
  - `PBSync.fetchEntitlement()` → Promise resolving to `{ is_pro, plan } | null` (null when signed out or on network error). Reads the caller's own `profiles` row via PostgREST (RLS returns only that row).
  - Internal (not part of the public contract but used by Tasks 3-4): `_toIso(ms)`, `_toMs(iso)`, `_authHeaders(token)`, `_authedFetch(path, options)`.

- [ ] **Step 1: Create `sync-engine.js`**

```js
// Prompt Box Pro — cloud sync engine. Offline-first: chrome.storage.local is the
// source of truth; this module pushes/pulls deltas to Supabase over PostgREST.
// No secrets here; it uses the Phase 1 PBAuth access token + the public anon key.
(function () {
  const cfg = () => PB_SYNC_CONFIG;

  // ---- timestamp helpers (local = ms epoch number, cloud = ISO timestamptz) ----
  function _toIso(ms) {
    return new Date(typeof ms === 'number' ? ms : Date.now()).toISOString();
  }
  function _toMs(iso) {
    const t = iso ? new Date(iso).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }

  // ---- auth + fetch helpers ----
  function _authHeaders(token) {
    return {
      apikey: cfg().supabaseAnonKey,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    };
  }

  // Returns a fetch Response, or throws. Rejects early if there is no session.
  async function _authedFetch(path, options) {
    const token = await PBAuth.getAccessToken();
    if (!token) throw new Error('not signed in');
    const opts = options || {};
    opts.headers = Object.assign(_authHeaders(token), opts.headers || {});
    return fetch(cfg().supabaseUrl + path, opts);
  }

  // ---- uuid backfill ----
  function ensureUuids(promptsArray) {
    let changed = false;
    const list = Array.isArray(promptsArray) ? promptsArray : [];
    for (const p of list) {
      if (!p.uuid) {
        p.uuid = crypto.randomUUID();
        changed = true;
      }
    }
    return { prompts: list, changed };
  }

  // ---- entitlement (is_pro) ----
  async function fetchEntitlement() {
    try {
      const res = await _authedFetch('/rest/v1/profiles?select=is_pro,plan', { method: 'GET' });
      if (!res.ok) return null;
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      return { is_pro: !!row.is_pro, plan: row.plan || null };
    } catch (e) {
      return null;
    }
  }

  globalThis.PBSync = {
    ensureUuids,
    fetchEntitlement,
    // internals exposed for later tasks in this module build-out:
    _toIso,
    _toMs,
    _authHeaders,
    _authedFetch,
  };
})();
```

- [ ] **Step 2: Load it in the popup after `sync-auth.js`**

In `popup.html`, find the existing block near the end:

```html
    <script src="sync-config.js"></script>
    <script src="sync-auth.js"></script>
    <script src="popup.js"></script>
```

Insert `sync-engine.js` between `sync-auth.js` and `popup.js`:

```html
    <script src="sync-config.js"></script>
    <script src="sync-auth.js"></script>
    <script src="sync-engine.js"></script>
    <script src="popup.js"></script>
```

- [ ] **Step 3: Add the `PBSync` global to `.eslintrc.json`**

Open `.eslintrc.json`. In the `globals` object (which already has `PB_SYNC_CONFIG`, `PBAuth`, `chrome`, etc. from Phase 1), add:

```json
    "PBSync": "writable"
```

(If `sync-engine.js` isn't already covered by the lint glob, no change is needed — the existing config lints all root `*.js`.)

- [ ] **Step 4: Verify lint/security**

```bash
npm run lint && npm run security
```

Expected: 0 errors.

- [ ] **Step 5: Manual smoke test**

Reload the extension. Open the popup → Settings → Account and sign in (Phase 1). Open the popup's DevTools console and run:

```js
PBSync.ensureUuids([{title:'x'}]).then ? 'no' : PBSync.ensureUuids([{title:'x'}])
// expect: { prompts: [{ title:'x', uuid:'<uuid>' }], changed: true }
await PBSync.fetchEntitlement()
// expect: { is_pro: false, plan: null }  (or is_pro:true if you flipped it in SQL)
```

`ensureUuids` returns synchronously; `fetchEntitlement()` returns a Promise. If `fetchEntitlement` returns `null` while signed in, confirm the profile row exists (Supabase → Table editor → `profiles`) and the access token is valid (`await PBAuth.getAccessToken()` should be a long string).

- [ ] **Step 6: Commit**

```bash
git add sync-engine.js popup.html .eslintrc.json
git commit -m "feat(pro): sync-engine foundation (uuid backfill, entitlement fetch)"
```

---

### Task 3: Push, pull, and tombstones in `sync-engine.js`

**Files:**
- Modify: `sync-engine.js`

**Interfaces:**
- Consumes: the Task 2 internals (`_toIso`, `_toMs`, `_authedFetch`, `ensureUuids`); `chrome.storage.local` keys `pb_last_push` (ms number, default 0), `pb_last_pull` (ISO string, default `'1970-01-01T00:00:00Z'`), `pb_tombstones` (array of `{ uuid, deleted_at }`, default `[]`).
- Produces: on `PBSync`:
  - `PBSync.recordTombstone(uuid)` → Promise. Appends `{ uuid, deleted_at: <now ISO> }` to `pb_tombstones` and resolves once persisted. No-op (resolves) if `uuid` is falsy.
  - `PBSync.pushLocalChanges(promptsArray)` → Promise resolving to `{ ok, pushed }`. Backfills uuids (persisting them via the caller's later save), upserts prompts whose `updatedAt > pb_last_push` plus all pending tombstones, then advances `pb_last_push` and clears the flushed tombstones. Rejects/returns `{ ok:false }` on network/auth failure — never throws to the UI.
  - `PBSync.pullRemoteChanges(promptsArray)` → Promise resolving to `{ ok, changed, prompts }`. Fetches cloud rows with `updated_at > pb_last_pull`, merges into a COPY of `promptsArray` (LWW by `updated_at`; tombstoned rows removed), advances `pb_last_pull`. `changed` is true if the merged list differs.
  - `PBSync.getStatus()` → Promise resolving to `{ lastSyncAt }` (ISO string or null) for the status indicator.

- [ ] **Step 1: Add storage helpers and the row mappers**

Inside the IIFE in `sync-engine.js`, above the `globalThis.PBSync = {...}` assignment, add:

```js
  // ---- local sync-state storage ----
  function _getLocal(keys) {
    return new Promise((res) => chrome.storage.local.get(keys, res));
  }
  function _setLocal(obj) {
    return new Promise((res) => chrome.storage.local.set(obj, res));
  }

  // ---- shape mappers (local prompt <-> cloud row) ----
  function _localToRow(p) {
    return {
      id: p.uuid,
      title: p.title != null ? p.title : null,
      text: p.text != null ? p.text : null,
      tags: Array.isArray(p.tags) ? p.tags : [],
      shortcut: p.shortcut || null,
      is_favorite: !!p.isFavorite,
      is_sensitive: p.isSensitive !== false,
      created_at: _toIso(p.createdAt),
      updated_at: _toIso(p.updatedAt),
    };
  }
  function _rowToLocal(row, existing) {
    return {
      // Keep the device-local numeric id if we already have this prompt;
      // otherwise use the uuid as the local id (strings compare fine via ==).
      id: existing && existing.id != null ? existing.id : row.id,
      uuid: row.id,
      title: row.title || '',
      text: row.text || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      shortcut: row.shortcut || null,
      isFavorite: !!row.is_favorite,
      isSensitive: row.is_sensitive !== false,
      createdAt: _toMs(row.created_at),
      updatedAt: _toMs(row.updated_at),
    };
  }
```

- [ ] **Step 2: Add `recordTombstone`**

Add inside the IIFE:

```js
  async function recordTombstone(uuid) {
    if (!uuid) return;
    const cur = (await _getLocal(['pb_tombstones'])).pb_tombstones || [];
    cur.push({ uuid, deleted_at: _toIso(Date.now()) });
    await _setLocal({ pb_tombstones: cur });
  }
```

- [ ] **Step 3: Add `pushLocalChanges`**

Add inside the IIFE:

```js
  async function pushLocalChanges(promptsArray) {
    try {
      const list = Array.isArray(promptsArray) ? promptsArray : [];
      ensureUuids(list); // mutates in place; caller persists prompts separately
      const state = await _getLocal(['pb_last_push', 'pb_tombstones']);
      const lastPush = state.pb_last_push || 0;
      const tombstones = state.pb_tombstones || [];

      const changedRows = list
        .filter((p) => (p.updatedAt || 0) > lastPush)
        .map(_localToRow);
      const tombRows = tombstones.map((t) => ({
        id: t.uuid,
        deleted_at: t.deleted_at,
        updated_at: t.deleted_at,
      }));
      const body = changedRows.concat(tombRows);
      if (body.length === 0) return { ok: true, pushed: 0 };

      const res = await _authedFetch('/rest/v1/prompts', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, pushed: 0 };

      const maxUpdated = list.reduce((m, p) => Math.max(m, p.updatedAt || 0), lastPush);
      await _setLocal({ pb_last_push: maxUpdated, pb_tombstones: [] });
      return { ok: true, pushed: body.length };
    } catch (e) {
      return { ok: false, pushed: 0 };
    }
  }
```

- [ ] **Step 4: Add `pullRemoteChanges`**

Add inside the IIFE:

```js
  async function pullRemoteChanges(promptsArray) {
    try {
      const state = await _getLocal(['pb_last_pull']);
      const since = state.pb_last_pull || '1970-01-01T00:00:00Z';
      const path =
        '/rest/v1/prompts?select=*&order=updated_at.asc&updated_at=gt.' +
        encodeURIComponent(since);
      const res = await _authedFetch(path, { method: 'GET' });
      if (!res.ok) return { ok: false, changed: false, prompts: promptsArray };
      const rows = await res.json();

      const byUuid = new Map();
      for (const p of promptsArray || []) {
        if (p.uuid) byUuid.set(p.uuid, p);
      }
      let changed = false;
      let maxUpdated = since;
      for (const row of rows) {
        if (row.updated_at > maxUpdated) maxUpdated = row.updated_at;
        const existing = byUuid.get(row.id);
        if (row.deleted_at) {
          if (existing) { byUuid.delete(row.id); changed = true; }
          continue;
        }
        if (!existing || _toMs(row.updated_at) > (existing.updatedAt || 0)) {
          byUuid.set(row.id, _rowToLocal(row, existing));
          changed = true;
        }
      }
      // Preserve any purely-local prompts that never got a uuid (not yet pushed).
      const merged = [];
      for (const p of promptsArray || []) {
        if (!p.uuid) merged.push(p);
      }
      for (const p of byUuid.values()) merged.push(p);

      await _setLocal({ pb_last_pull: maxUpdated });
      return { ok: true, changed, prompts: merged };
    } catch (e) {
      return { ok: false, changed: false, prompts: promptsArray };
    }
  }
```

- [ ] **Step 5: Add `getStatus` and export the new functions**

Add inside the IIFE:

```js
  async function getStatus() {
    const state = await _getLocal(['pb_last_pull']);
    const iso = state.pb_last_pull;
    return { lastSyncAt: iso && iso !== '1970-01-01T00:00:00Z' ? iso : null };
  }
```

Then extend the export object so it reads:

```js
  globalThis.PBSync = {
    ensureUuids,
    fetchEntitlement,
    recordTombstone,
    pushLocalChanges,
    pullRemoteChanges,
    getStatus,
    _toIso,
    _toMs,
    _authHeaders,
    _authedFetch,
  };
```

- [ ] **Step 6: Verify lint/security**

```bash
npm run lint && npm run security
```

Expected: 0 errors.

- [ ] **Step 7: Manual round-trip test (single profile, is_pro flipped)**

Grant Pro for testing (see Global Constraints SQL). Reload, sign in, open the popup DevTools console:

```js
// Push a couple of real prompts (use your actual in-memory `prompts` if available,
// or a throwaway array):
const test = [
  { title:'Sync A', text:'hello A', tags:[], isFavorite:false, isSensitive:true, createdAt:Date.now(), updatedAt:Date.now() },
  { title:'Sync B', text:'hello B', tags:['Coding'], isFavorite:false, isSensitive:true, createdAt:Date.now(), updatedAt:Date.now() },
];
await PBSync.pushLocalChanges(test);   // expect { ok:true, pushed:2 }
```

In Supabase → Table editor → `prompts`: expect two rows with your `user_id`, `deleted_at` null. Then:

```js
// Simulate a fresh device: force a full pull by clearing the cursor.
await new Promise(r => chrome.storage.local.remove('pb_last_pull', r));
const pulled = await PBSync.pullRemoteChanges([]);   // expect { ok:true, changed:true, prompts:[...2] }
pulled.prompts.map(p => p.title);                    // ['Sync A','Sync B'] (order may vary)
```

Tombstone check:

```js
await PBSync.recordTombstone(test[0].uuid);
await PBSync.pushLocalChanges(test);                 // pushes the tombstone
await new Promise(r => chrome.storage.local.remove('pb_last_pull', r));
const p2 = await PBSync.pullRemoteChanges(test.map(x => ({...x})));
p2.prompts.map(p => p.title);                        // 'Sync A' removed -> ['Sync B']
```

Clean up the test rows in the Supabase table editor afterward if you like.

- [ ] **Step 8: Commit**

```bash
git add sync-engine.js
git commit -m "feat(pro): sync-engine push/pull deltas with delete tombstones"
```

---

### Task 4: Wire the `cloud` storage mode into `loadPrompts` / `savePrompts` / `deletePrompt` + migration

**Files:**
- Modify: `sync-engine.js` (add `migrateToCloud`)
- Modify: `popup.js` (`loadPrompts` cloud branch, `savePrompts` cloud branch, `deletePrompt` tombstone, a small `rerenderPrompts` helper, `updateSyncStatus`)

**Interfaces:**
- Consumes: `PBSync.pushLocalChanges`, `PBSync.pullRemoteChanges`, `PBSync.ensureUuids`, `PBSync.getStatus` (Tasks 2-3). The module-level `storagePref` variable in `popup.js` (currently `'sync' | 'local'`) gains a third value `'cloud'`.
- Produces: `PBSync.migrateToCloud(localPrompts)` → Promise resolving to `{ ok, prompts }` (the merged set after first push+pull). In `popup.js`, `loadPrompts`/`savePrompts` transparently sync when `storagePref === 'cloud'`; `deletePrompt` records a tombstone in cloud mode.

- [ ] **Step 1: Add `migrateToCloud` to `sync-engine.js`**

Add inside the IIFE (above the export), then add `migrateToCloud` to the `globalThis.PBSync` export object:

```js
  // First switch to Cloud: give everything a uuid, push local up, pull anything
  // already in the cloud (e.g. a second device), and return the merged set.
  async function migrateToCloud(localPrompts) {
    const list = Array.isArray(localPrompts) ? localPrompts.slice() : [];
    ensureUuids(list);
    await pushLocalChanges(list);
    const pulled = await pullRemoteChanges(list);
    return { ok: pulled.ok, prompts: pulled.prompts };
  }
```

Export line to add inside `globalThis.PBSync = { ... }`:

```js
    migrateToCloud,
```

- [ ] **Step 2: Add a re-render helper and status updater to `popup.js`**

In `popup.js`, add these two functions near `finishLoadPrompts` (after it):

```js
// Re-paint the whole prompt list from the current in-memory `prompts` array.
function rerenderPrompts() {
  displayPrompts();
  refreshTagSources();
  updateTagList();
  updateTagFilterDropdown();
  filterAndSortPrompts();
}

// Update the "last synced" status line (added to the DOM in Task 5).
async function updateSyncStatus() {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (storagePref !== 'cloud') { el.textContent = ''; return; }
  let status = null;
  try { status = await PBSync.getStatus(); } catch (e) { status = null; }
  if (status && status.lastSyncAt) {
    const t = new Date(status.lastSyncAt);
    el.textContent = 'Cloud sync on. Last synced ' + t.toLocaleTimeString() + '.';
  } else {
    el.textContent = 'Cloud sync on.';
  }
}
```

- [ ] **Step 3: Add the `cloud` branch to `loadPrompts`**

In `popup.js`, inside `loadPrompts`, the outer `chrome.storage.local.get([...], function (localResult) { ... })` callback currently branches `if (storagePref === 'local') { ... } else if (localResult.syncFallback) { ... } else { ... }`. Add a `cloud` branch as the FIRST check inside that callback, immediately after `updateStoragePrefUI();`:

```js
    if (storagePref === 'cloud') {
      // Cloud mode: local is the instant source of truth; pull deltas in the
      // background. Tags/filter prefs still live in Chrome Sync (unchanged).
      prompts = localResult.prompts || [];
      displayPrompts(); // instant paint, offline-safe
      chrome.storage.sync.get(['availableTags', 'filterSettings', 'cloudSyncSurvey'], function (syncResult) {
        finishLoadPrompts(prompts, syncResult, localResult);
        PBSync.pullRemoteChanges(prompts).then(function (res) {
          if (res && res.changed) {
            prompts = res.prompts;
            chrome.storage.local.set({ prompts: prompts });
            rerenderPrompts();
          }
          updateSyncStatus();
        }).catch(function () { updateSyncStatus(); });
      });
      return;
    }
```

- [ ] **Step 4: Add the `cloud` branch to `savePrompts`**

In `popup.js`, `savePrompts` currently starts with `if (storagePref === 'local') { ... return; }`. Add a `cloud` branch BEFORE the `local` check:

```js
  if (storagePref === 'cloud') {
    // Write local first (instant, offline-safe), then push in the background.
    chrome.storage.local.set({ prompts: promptsArray }, function () {
      if (callback) callback();
      PBSync.pushLocalChanges(promptsArray).then(function () {
        // ensureUuids may have added uuids to the objects; persist them.
        chrome.storage.local.set({ prompts: promptsArray });
        updateSyncStatus();
      }).catch(function () { updateSyncStatus(); });
    });
    return;
  }
```

- [ ] **Step 5: Record a tombstone on delete in cloud mode**

In `popup.js`, replace the body of `deletePrompt` with a version that records a tombstone before removing, in cloud mode:

```js
// Delete a prompt
function deletePrompt(promptId) {
  if (confirm('Are you sure you want to delete this prompt?')) {
    const gone = prompts.find(p => p.id == promptId);
    const finishDelete = function () {
      prompts = prompts.filter(p => p.id != promptId);
      savePrompts(prompts, function () {
        filterAndSortPrompts();
      });
    };
    if (storagePref === 'cloud' && gone && gone.uuid) {
      // Persist the tombstone first so the subsequent push includes it.
      PBSync.recordTombstone(gone.uuid).then(finishDelete);
    } else {
      finishDelete();
    }
  }
}
```

- [ ] **Step 6: Verify lint/security**

```bash
npm run lint && npm run security
```

Expected: 0 errors.

- [ ] **Step 7: Manual cross-device round-trip (two profiles)**

Set up two profiles (see Global Constraints), sign in to the same account in both, and grant Pro. In each profile's popup DevTools console set cloud mode directly (the UI toggle lands in Task 5):

```js
// In BOTH profiles:
chrome.storage.local.set({ storagePref: 'cloud' }, () => location.reload());
```

Then:
1. **Profile A:** add a prompt "Cross-device 1" via the normal UI. Wait ~2s.
2. **Profile B:** close and reopen the popup → "Cross-device 1" appears.
3. **Profile A:** edit it to "Cross-device 1 (edited)" and toggle its favorite. Reopen Profile B's popup → the edit + favorite propagate.
4. **Profile B:** delete the prompt. Reopen Profile A's popup → it disappears (tombstone propagated, not resurrected).
5. **Offline check (Profile A):** DevTools → Network → Offline. Add a prompt → it appears instantly in the list (no error). Go back Online, reopen popup → it pushes; Profile B sees it on next open.

If a step fails, capture the popup console error and confirm `await PBSync.fetchEntitlement()` returns `is_pro:true` in that profile.

- [ ] **Step 8: Commit**

```bash
git add sync-engine.js popup.js
git commit -m "feat(pro): wire cloud storage mode into load/save/delete with migration"
```

---

### Task 5: Storage-mode UI — Cloud radio gated by `is_pro`, plus sync status line

**Files:**
- Modify: `popup.html` (Cloud radio in the storage-mode section, `#syncStatus` element)
- Modify: `popup.js` (`setStoragePref` cloud handling, `updateStoragePrefUI` gating, entitlement gate on load)

**Interfaces:**
- Consumes: `PBSync.fetchEntitlement`, `PBSync.migrateToCloud`, `updateSyncStatus`/`rerenderPrompts` (Task 4).
- Produces: a user-visible Cloud option enabled only when signed in AND `is_pro`; selecting it runs `migrateToCloud`; leaving it stops syncing (local remains).

- [ ] **Step 1: Add the Cloud radio + status line to `popup.html`**

Find the storage-preference section that contains `id="storagePrefSync"` and `id="storagePrefLocal"`. Add a third radio option after the Local one, matching the existing markup pattern (label wrapping an input + text). Insert:

```html
      <label class="storage-pref-option" id="storagePrefCloudOption" style="opacity:0.5;">
        <input type="radio" name="storagePref" id="storagePrefCloud" value="cloud" disabled>
        <span>Prompt Box Cloud <span id="cloudProBadge" style="font-size:11px; color: var(--color-accent);">(Pro)</span></span>
      </label>
      <div class="import-status" id="syncStatus" style="margin-top:6px;"></div>
```

(Keep the exact class names used by the sibling `sync`/`local` options; if they differ from `storage-pref-option`, match the siblings' classes instead. The wrapper starts disabled + dimmed and is enabled in Step 3.)

- [ ] **Step 2: Handle `'cloud'` in `setStoragePref` (`popup.js`)**

`setStoragePref(newPref)` currently handles `'local'` and the else (`'sync'`). Replace the function body so it also handles `'cloud'`:

```js
// Switch storage location and migrate prompts to the new destination
function setStoragePref(newPref) {
  if (newPref === storagePref) return;
  const prev = storagePref;
  storagePref = newPref;
  chrome.storage.local.set({ storagePref: newPref });
  updateStoragePrefUI();

  if (newPref === 'local') {
    // Moving to local: persist current prompts locally, clear sync copy
    chrome.storage.local.set({ prompts: prompts, syncFallback: false });
    chrome.storage.sync.remove('prompts');
  } else if (newPref === 'cloud') {
    // Moving to cloud: back to local-as-truth for the prompt store, then migrate up.
    chrome.storage.local.set({ prompts: prompts, syncFallback: false });
    if (prev === 'sync') chrome.storage.sync.remove('prompts');
    PBSync.migrateToCloud(prompts).then(function (res) {
      if (res && res.prompts) {
        prompts = res.prompts;
        chrome.storage.local.set({ prompts: prompts });
        rerenderPrompts();
      }
      updateSyncStatus();
    }).catch(function () { updateSyncStatus(); });
  } else {
    // Moving to sync: push current prompts to Chrome Sync
    savePrompts(prompts);
  }
}
```

- [ ] **Step 3: Gate the Cloud radio on entitlement in `popup.js`**

Add a function that enables/disables the Cloud option, and call it. First the function:

```js
// Enable the Cloud storage option only when signed in AND is_pro.
async function refreshCloudOption() {
  const wrapper = document.getElementById('storagePrefCloudOption');
  const radio = document.getElementById('storagePrefCloud');
  const badge = document.getElementById('cloudProBadge');
  if (!wrapper || !radio) return;
  let ent = null;
  try { ent = await PBSync.fetchEntitlement(); } catch (e) { ent = null; }
  const allowed = !!(ent && ent.is_pro);
  radio.disabled = !allowed;
  wrapper.style.opacity = allowed ? '1' : '0.5';
  if (badge) badge.style.display = allowed ? 'none' : 'inline';
  // If we're in cloud mode but Pro was revoked, fall back to sync.
  if (!allowed && storagePref === 'cloud') {
    setStoragePref('sync');
  }
}
```

Then update `updateStoragePrefUI` so the Cloud radio reflects state. Find `updateStoragePrefUI` and add, alongside the existing `syncRadio`/`localRadio` checked assignments:

```js
  const cloudRadio = document.getElementById('storagePrefCloud');
  if (cloudRadio) cloudRadio.checked = storagePref === 'cloud';
```

Ensure the Cloud radio's `change` is wired the same way as the sync/local radios. Find where `storagePrefSync` / `storagePrefLocal` get their `change` listeners (in `setupEventListeners`) and add a matching listener:

```js
  const cloudRadioEl = document.getElementById('storagePrefCloud');
  if (cloudRadioEl) {
    cloudRadioEl.addEventListener('change', function () {
      if (this.checked) setStoragePref('cloud');
    });
  }
```

Finally, call `refreshCloudOption()` after sign-in/out and on startup. In `renderAccount` (Task/Phase 1 function), add `refreshCloudOption();` at the end. Also add `refreshCloudOption();` and `updateSyncStatus();` to the `DOMContentLoaded` init block in `popup.js` (which already calls `loadPrompts(); setupEventListeners(); setupAccountUI(); renderAccount();`):

```js
  refreshCloudOption();
  updateSyncStatus();
```

- [ ] **Step 4: Verify lint/security**

```bash
npm run lint && npm run security
```

Expected: 0 errors.

- [ ] **Step 5: Manual UI test**

Reload, open popup → Settings (storage section).
1. **Signed out:** Cloud option is dimmed, shows "(Pro)", radio disabled.
2. **Signed in, is_pro=false:** still dimmed/disabled.
3. **Flip is_pro=true (SQL), reopen popup:** Cloud option is enabled, "(Pro)" badge hidden. Select it → `#syncStatus` shows "Cloud sync on. Last synced …". Add/edit/delete a prompt → still works; reopening keeps cloud selected.
4. **Two-profile:** with both on Cloud via the UI now, repeat the Task 4 round-trip through the real UI (no console commands).
5. **Revoke:** set is_pro=false in SQL, reopen popup → falls back to Sync automatically (Cloud dimmed again), local prompts intact.

- [ ] **Step 6: Commit**

```bash
git add popup.html popup.js
git commit -m "feat(pro): cloud storage-mode UI gated on Pro entitlement"
```

---

### Task 6: Background freshness — periodic pull via `chrome.alarms`

**Files:**
- Modify: `manifest.json` (add `alarms` permission)
- Modify: `background.js` (alarm + background pull)
- Modify: `sync-auth.js` (make the global assignment service-worker-safe)

**Interfaces:**
- Consumes: `PBSync.pullRemoteChanges`, `storagePref` from `chrome.storage.local`.
- Produces: while signed in and in cloud mode, a periodic background pull merges remote changes into `chrome.storage.local` so the popup opens already-synced (covers the "observer popup was already closed / opens later" path). This is a freshness layer; Tasks 1-5 already deliver the full testable round-trip.

- [ ] **Step 1: Make `sync-auth.js` and `sync-engine.js` global assignment SW-safe**

Service workers have no `window`. `sync-engine.js` (Task 2) already uses `globalThis.PBSync`. In `sync-auth.js`, change the final assignment from `window.PBAuth = {...}` to:

```js
  globalThis.PBAuth = { signIn, signOut, getSession, getAccessToken };
```

(`signIn` uses `chrome.identity`, which is only invoked from the popup, so importing the file into the SW for `getAccessToken`/`getSession` is safe — those only touch `chrome.storage` + `fetch`.)

- [ ] **Step 2: Add the `alarms` permission to `manifest.json`**

In the `permissions` array (currently `storage, activeTab, contextMenus, clipboardWrite, identity`), add `"alarms"`:

```json
  "permissions": [
    "storage",
    "activeTab",
    "contextMenus",
    "clipboardWrite",
    "identity",
    "alarms"
  ],
```

- [ ] **Step 3: Import the sync scripts and add the alarm in `background.js`**

At the very top of `background.js` (before the existing listeners), add:

```js
// Load the public config + auth + sync engine into the service worker so we can
// pull cloud changes on a schedule. These attach to globalThis (SW-safe).
importScripts('sync-config.js', 'sync-auth.js', 'sync-engine.js');

const SYNC_ALARM = 'pb-cloud-pull';

async function backgroundPull() {
  const { storagePref } = await new Promise((r) =>
    chrome.storage.local.get(['storagePref'], r));
  if (storagePref !== 'cloud') return;
  const token = await PBAuth.getAccessToken();
  if (!token) return;
  const { prompts } = await new Promise((r) =>
    chrome.storage.local.get(['prompts'], r));
  const res = await PBSync.pullRemoteChanges(prompts || []);
  if (res && res.changed) {
    await new Promise((r) => chrome.storage.local.set({ prompts: res.prompts }, r));
  }
}
```

In the existing `chrome.runtime.onInstalled` listener, register the alarm (add after the `contextMenus.create` call):

```js
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
```

And add a top-level alarm handler:

```js
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) {
    backgroundPull();
  }
});
```

- [ ] **Step 4: Verify lint/security**

```bash
npm run lint && npm run security
```

Expected: 0 errors. (If lint flags `importScripts`/`PBAuth`/`PBSync` as undefined in `background.js`, add them to `.eslintrc.json` globals: `"importScripts": "readonly"` — `PBAuth`/`PBSync` are already global from Task 2/6.)

- [ ] **Step 5: Manual background-pull test**

Reload the extension (click reload on the card so the new service worker + permission take effect). In the extension card, open the service worker DevTools ("Inspect views: service worker").
1. Confirm no import errors in the SW console on load.
2. In cloud mode + signed in, from Profile A add a prompt. In Profile B, WITHOUT opening the popup, wait for the alarm (or in Profile B's SW console run `backgroundPull()` to trigger immediately). Then open Profile B's popup → the prompt is already there from local (background pull merged it).
3. `chrome.storage.local.get('prompts', console.log)` in the SW console reflects the merged set.

To trigger the alarm faster during testing you may temporarily set `periodInMinutes: 1` (Chrome's minimum for released extensions is 1 minute); revert to 5 before committing.

- [ ] **Step 6: Commit**

```bash
git add manifest.json background.js sync-auth.js
git commit -m "feat(pro): background chrome.alarms pull to keep cloud data fresh"
```

---

### Task 7: Privacy + store-listing disclosure update (docs only)

**Files:**
- Modify: `prompt-box-privacy-practices.md`
- Modify: `prompt-box-store-listing.md`

**Interfaces:**
- No code. Extends the Phase 1 disclosures to cover the new `alarms` permission and the fact that, in Cloud mode, prompt content is now transmitted to and stored on Supabase.

- [ ] **Step 1: Update `prompt-box-privacy-practices.md`**

Under Permission Justifications add:

```markdown
### `alarms`

Used only when Prompt Box Pro cloud sync is enabled, to periodically check our
Supabase backend for changes made on your other devices so your library stays
up to date. It runs no more than once every few minutes and does nothing for
signed-out or local-only users.
```

Update the existing host-permission justification (from Phase 1) to note that, with cloud sync ON, prompt content is transmitted and stored:

```markdown
### Host permission — `https://jmxmtiqkpegqywderwkt.supabase.co/*`

Used only when the user has signed in to Prompt Box Pro. For account sign-in, and
— when the user turns on Cloud sync — to store and retrieve their prompts on our
Supabase backend (encrypted in transit and at rest). Nothing is sent here for
signed-out or local-only users; local-only remains the default.
```

Add a changelog row at the top of the practices changelog table:

```markdown
| 4.0.0 | Prompt Box Pro cloud sync: when enabled, prompts are stored on our Supabase backend so they sync across devices. Adds the alarms permission for periodic background sync. Local-only remains the default; nothing leaves the device unless the user signs in and turns on Cloud sync. |
```

- [ ] **Step 2: Update `prompt-box-store-listing.md`**

Ensure the Pro paragraph reflects live sync (not just "coming soon"). Replace/extend the Phase 1 line with:

```
Prompt Box Pro (optional): sign in with Google and turn on Cloud sync to keep your
prompts in sync across browsers and devices, offline-first. The free extension stays
local-first and requires no account — nothing leaves your device unless you enable sync.
```

- [ ] **Step 3: Commit**

```bash
git add prompt-box-privacy-practices.md prompt-box-store-listing.md
git commit -m "docs(pro): disclose alarms permission and cloud-sync data handling"
```

---

## Self-Review Notes

- **Spec coverage (Phase 2 slice):**
  - "New storage mode selectable only when signed in AND is_pro" → Task 5 (`refreshCloudOption` gate).
  - "local stays the immediate source of truth; instant + offline" → Tasks 4 (local-first load/save) + Global Constraints.
  - "`pushLocalChanges` after save; `pullRemoteChanges` on popup open + periodic alarm tick" → Task 3 (functions), Task 4 (popup wiring), Task 6 (alarm).
  - "conflict resolution last-write-wins by updated_at; deletes win via tombstone" → Task 3 (`pullRemoteChanges` merge + `recordTombstone`).
  - "first Pro sign-in migration: push local, merge if cloud already has rows" → Task 4 (`migrateToCloud`).
  - "stable uuid per prompt, backfilled on migration" → Task 2 (`ensureUuids`), applied in Task 3 push and Task 4 migrate. **Deviation noted:** the spec says "generates a stable id (uuid)"; this plan adds a SEPARATE `uuid` field rather than replacing the numeric `id`, to avoid rewriting every `p.id ==` comparison across popup.js. Cloud identity = `uuid`; local DOM identity = `id`. Same guarantee, lower blast radius.
  - "network failures non-fatal, local authoritative, retry next tick, subtle status indicator" → Task 3 (all functions swallow errors and return `{ok:false}`), Task 5 (`#syncStatus`).
  - "never block editing on sync" → Task 4 (save writes local + fires push after callback).
  - Manifest/permission + privacy disclosure → Task 6 (`alarms`), Task 7 (docs).
- **Scope:** prompts only sync (tags/filter prefs stay in Chrome Sync, matching the cloud schema where `tags` is a jsonb column on each prompt row). Confirmed with LB. Web app, version history, team libraries, billing = out of scope (later phases).
- **Type consistency:** `pushLocalChanges(promptsArray)`/`pullRemoteChanges(promptsArray)` both take the local array and return `{ok, ...}`; `pullRemoteChanges`/`migrateToCloud` return `{prompts}`; `getStatus()`→`{lastSyncAt}`; `fetchEntitlement()`→`{is_pro, plan}|null`. `storagePref` is `'sync'|'local'|'cloud'` everywhere (`loadPrompts`, `savePrompts`, `setStoragePref`, `updateStoragePrefUI`, `deletePrompt`, `updateSyncStatus`). Row mappers `_localToRow`/`_rowToLocal` are inverses over the fields used.
- **Security invariants:** no secrets added (reuses public anon key + `PBAuth` token); `user_id` provided by DB default under RLS (Task 1); `is_pro` never written by the client and gates the UI (Task 5); new rendered text (`#syncStatus`) uses `textContent`; prompt rendering unchanged (still `escapeHTML`).
- **Known dependency / sequencing:** Task 1 (DB default) must run before Task 3 pushes (else inserts fail RLS). Task 6 depends on Task 2's `globalThis` pattern; it also flips `sync-auth.js` to `globalThis`. Tasks 4-5 depend on Tasks 2-3. Manual round-trip tasks require Pro flipped on in SQL (no billing yet).
- **Placeholder scan:** none — every code step contains full code; the only value to confirm is the test email in the grant-Pro SQL (`lbwalton@gmail.com`).
```
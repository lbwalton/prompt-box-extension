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

  // ---- tombstone recording ----
  async function recordTombstone(uuid) {
    if (!uuid) return;
    const cur = (await _getLocal(['pb_tombstones'])).pb_tombstones || [];
    cur.push({ uuid, deleted_at: _toIso(Date.now()) });
    await _setLocal({ pb_tombstones: cur });
  }

  // ---- push changes: local -> cloud ----
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
      if (changedRows.length === 0 && tombRows.length === 0) {
        return { ok: true, pushed: 0 };
      }

      // Snapshot the cursor target BEFORE any await: an edit that lands while a
      // push is in flight must stay newer than the cursor so the next tick sends it.
      const maxUpdated = list.reduce((m, p) => Math.max(m, p.updatedAt || 0), lastPush);

      // PostgREST bulk upserts require every row to share the same key set, so
      // changed prompts and tombstones go in two separate requests.
      if (changedRows.length > 0) {
        const res = await _authedFetch('/rest/v1/prompts', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(changedRows),
        });
        if (!res.ok) return { ok: false, pushed: 0 };
        await _setLocal({ pb_last_push: maxUpdated });
      }

      if (tombRows.length > 0) {
        const res = await _authedFetch('/rest/v1/prompts', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(tombRows),
        });
        if (!res.ok) return { ok: false, pushed: changedRows.length };
        // Remove only the tombstones this push actually flushed; one recorded
        // while the request was in flight stays queued for the next tick.
        const flushed = new Set(tombstones.map((t) => t.uuid));
        const cur = (await _getLocal(['pb_tombstones'])).pb_tombstones || [];
        await _setLocal({ pb_tombstones: cur.filter((t) => !flushed.has(t.uuid)) });
      }

      return { ok: true, pushed: changedRows.length + tombRows.length };
    } catch (e) {
      return { ok: false, pushed: 0 };
    }
  }

  // ---- pull changes: cloud -> local ----
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

  // ---- sync status ----
  async function getStatus() {
    const state = await _getLocal(['pb_last_pull']);
    const iso = state.pb_last_pull;
    return { lastSyncAt: iso && iso !== '1970-01-01T00:00:00Z' ? iso : null };
  }

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
})();

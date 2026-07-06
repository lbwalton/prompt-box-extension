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

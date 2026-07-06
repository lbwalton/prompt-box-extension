// Google sign-in for Prompt Box Pro via chrome.identity + Supabase Auth.
// Session (access+refresh tokens) is stored in chrome.storage.local. No secrets here.
(function () {
  const SESSION_KEY = 'pb_session';
  const cfg = () => PB_SYNC_CONFIG;

  function authHeaders(token) {
    return {
      apikey: cfg().supabaseAnonKey,
      Authorization: 'Bearer ' + (token || cfg().supabaseAnonKey),
      'Content-Type': 'application/json',
    };
  }

  function storeSession(s) {
    return new Promise((res) => chrome.storage.local.set({ [SESSION_KEY]: s }, res));
  }
  function readSession() {
    return new Promise((res) =>
      chrome.storage.local.get([SESSION_KEY], (r) => res(r[SESSION_KEY] || null)));
  }
  function clearSession() {
    return new Promise((res) => chrome.storage.local.remove(SESSION_KEY, res));
  }

  // Parse tokens from the chromiumapp.org redirect URL fragment.
  function parseRedirect(redirectUrl) {
    const frag = redirectUrl.split('#')[1] || '';
    const p = new URLSearchParams(frag);
    const access_token = p.get('access_token');
    const refresh_token = p.get('refresh_token');
    const expires_in = parseInt(p.get('expires_in') || '3600', 10);
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000 };
  }

  async function fetchUserEmail(access_token) {
    const res = await fetch(cfg().supabaseUrl + '/auth/v1/user', { headers: authHeaders(access_token) });
    if (!res.ok) throw new Error('user fetch failed: ' + res.status);
    const u = await res.json();
    return u.email || null;
  }

  async function signIn() {
    const authorizeUrl =
      cfg().supabaseUrl + '/auth/v1/authorize?provider=google&redirect_to=' +
      encodeURIComponent(cfg().authRedirect);
    const redirectUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authorizeUrl, interactive: true }, (r) => {
        if (chrome.runtime.lastError || !r) {
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'cancelled'));
        } else {
          resolve(r);
        }
      });
    });
    // Surface provider errors (user denied, misconfig) instead of a generic message.
    const errFrag = redirectUrl.split('#')[1] || redirectUrl.split('?')[1] || '';
    const errParams = new URLSearchParams(errFrag);
    if (errParams.get('error')) {
      throw new Error('OAuth error: ' + (errParams.get('error_description') || errParams.get('error')));
    }
    const tokens = parseRedirect(redirectUrl);
    if (!tokens) throw new Error('no tokens in redirect');
    const email = await fetchUserEmail(tokens.access_token);
    const session = { ...tokens, email };
    await storeSession(session);
    return { email };
  }

  // Returns the next session on success, null when the refresh token is
  // definitively invalid (caller should clear), or THROWS on a transient
  // failure (5xx / network) so the caller keeps the stored session.
  async function refresh(session) {
    const res = await fetch(
      cfg().supabaseUrl + '/auth/v1/token?grant_type=refresh_token',
      { method: 'POST', headers: authHeaders(null), body: JSON.stringify({ refresh_token: session.refresh_token }) }
    );
    if (!res.ok) {
      if (res.status === 400 || res.status === 401 || res.status === 403) return null;
      throw new Error('refresh transient ' + res.status);
    }
    const d = await res.json();
    if (!d.access_token) throw new Error('refresh returned no access_token');
    const next = {
      access_token: d.access_token,
      refresh_token: d.refresh_token || session.refresh_token,
      expires_at: Date.now() + (d.expires_in || 3600) * 1000,
      email: session.email,
    };
    await storeSession(next);
    return next;
  }

  async function getSession() {
    let s = await readSession();
    if (!s) return null;
    // Refresh if within 60s of expiry.
    if (Date.now() > (s.expires_at - 60000)) {
      let next;
      try {
        next = await refresh(s);
      } catch (e) {
        // Transient failure: keep the stored session, just report none this call.
        return null;
      }
      if (!next) { await clearSession(); return null; }
      s = next;
    }
    return { accessToken: s.access_token, email: s.email };
  }

  async function getAccessToken() {
    const s = await getSession();
    return s ? s.accessToken : null;
  }

  async function signOut() {
    const s = await readSession();
    if (s && s.access_token) {
      try {
        await fetch(cfg().supabaseUrl + '/auth/v1/logout', { method: 'POST', headers: authHeaders(s.access_token) });
      } catch (e) { /* best effort */ }
    }
    await clearSession();
  }

  globalThis.PBAuth = { signIn, signOut, getSession, getAccessToken };
})();

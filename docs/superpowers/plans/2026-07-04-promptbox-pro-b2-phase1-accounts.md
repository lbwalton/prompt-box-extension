# Prompt Box Pro B2 Phase 1: Accounts (Google Sign-In) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Prompt Box user sign in with Google, backed by the Supabase `promptbox-pro` project, with a `profiles` row (default `is_pro=false`) created on first sign-in. No sync or payments yet.

**Architecture:** The extension talks to Supabase Auth over plain `fetch()` (no SDK bundled, CSP stays `script-src 'self'`). Google sign-in runs through `chrome.identity.launchWebAuthFlow` against Supabase's OAuth authorize endpoint; the returned session (access + refresh tokens) is stored in `chrome.storage.local`. A new Account tab in Settings drives sign-in/out.

**Tech Stack:** Vanilla JS MV3 content/popup scripts (no build step), `chrome.identity`, Supabase Auth REST + PostgREST, SQL for schema/RLS. Lint via `npm run lint`, security via `npm run security`.

**Spec:** `docs/superpowers/specs/2026-07-04-promptbox-pro-b2-design.md`
**Infra IDs:** `docs/infra/promptbox-pro-config.md`

## Global Constraints

- No build step: all runtime JS loads directly, unbundled. No CDN scripts, no `eval`, CSP stays `script-src 'self'; object-src 'self'`.
- Never `innerHTML` with unsanitized content. New rendered content (account email) uses `textContent` or `escapeHTML()`.
- No secret keys in the extension, the repo, or any committed file. Only public values (Supabase URL, anon/publishable key) may be embedded.
- Supabase project ref: `jmxmtiqkpegqywderwkt`; URL `https://jmxmtiqkpegqywderwkt.supabase.co`.
- `is_pro` is only ever written server-side (webhook, Phase 3). In Phase 1 it is read-only from the client and always false unless flipped manually for testing.
- Row-Level Security on every table; a user can only read/write their own rows.
- Before every commit: `npm run lint` and `npm run security` pass with 0 errors.
- Version bump target for the release that ships Phase 1+2+3 together is decided later; Phase 1 alone does NOT bump the store version (it is not shipped to the store until the full Pro feature is ready). Manifest permission changes land now but the store upload waits.
- No automated test runner exists. Each task's verification is: lint/security clean, plus manual checks against the real Supabase project and an unpacked extension reload.

**Manual reload procedure (referenced by tasks):** `chrome://extensions` → Prompt Box → reload. For popup changes, reopen the popup.

**Prerequisite owned by LB (Task 2 guides it):** a Google Cloud OAuth client and the Supabase Google provider must be configured before auth can be tested. Tasks 1-2 set this up; code tasks follow.

---

### Task 1: Supabase schema, RLS, and profile trigger

**Files:**
- Create: `supabase/migrations/0001_init.sql` (source of truth for the schema; run manually in the Supabase SQL editor)

**Interfaces:**
- Produces: `public.profiles` and `public.prompts` tables with RLS; a trigger that inserts a `profiles` row on new `auth.users`. Later tasks/phases read/write these via PostgREST.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0001_init.sql`:

```sql
-- Prompt Box Pro schema (Phase 1 + prepares Phase 2/3)

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_pro boolean not null default false,
  stripe_customer_id text,
  plan text,
  updated_at timestamptz not null default now()
);

create table if not exists public.prompts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  text text,
  tags jsonb not null default '[]'::jsonb,
  shortcut text,
  is_favorite boolean not null default false,
  is_sensitive boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists prompts_user_updated_idx on public.prompts (user_id, updated_at);

alter table public.profiles enable row level security;
alter table public.prompts enable row level security;

-- profiles: a user may read and update ONLY their own row. is_pro/plan/stripe_customer_id
-- are protected from client writes by a trigger below (client can only touch nothing here
-- that matters; the webhook uses the service role which bypasses RLS).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Guard: prevent clients from self-promoting. If a non-service update tries to change
-- is_pro/plan/stripe_customer_id, reject it.
create or replace function public.guard_profile_entitlement()
returns trigger language plpgsql as $$
begin
  if (auth.role() <> 'service_role') then
    if (new.is_pro is distinct from old.is_pro)
       or (new.plan is distinct from old.plan)
       or (new.stripe_customer_id is distinct from old.stripe_customer_id) then
      raise exception 'entitlement fields are read-only for clients';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_profile_entitlement_trg on public.profiles;
create trigger guard_profile_entitlement_trg before update on public.profiles
  for each row execute function public.guard_profile_entitlement();

-- prompts: full CRUD scoped to the owner.
drop policy if exists prompts_all_own on public.prompts;
create policy prompts_all_own on public.prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create a profiles row automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Run the migration in Supabase**

Open the SQL editor for the project and run the file's contents:
`https://supabase.com/dashboard/project/jmxmtiqkpegqywderwkt/sql/new`
Paste the SQL, run. Expected: "Success. No rows returned."

- [ ] **Step 3: Verify RLS and trigger exist**

In the SQL editor run:

```sql
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('profiles','prompts');
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass;
```

Expected: both tables show `rowsecurity = true`; the triggers list includes `on_auth_user_created`.

- [ ] **Step 4: Record the publishable (anon) key**

In the dashboard → Settings → API Keys → copy the **Publishable key** (safe, public). Paste it into `docs/infra/promptbox-pro-config.md` in the Supabase table (replace the "copy from dashboard" placeholder). This value is used by later tasks as `SUPABASE_ANON_KEY`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/labroiwalton/Projects/Deployed/Chrome Extensions/Prompt-box/prompt-box-extension"
git add supabase/migrations/0001_init.sql docs/infra/promptbox-pro-config.md
git commit -m "feat(pro): Supabase schema, RLS, and profile trigger for accounts"
```

---

### Task 2: Google OAuth provider + Supabase redirect config (LB-guided setup)

**Files:**
- Create: `supabase/SETUP-google-oauth.md` (the runbook; no runtime code)

**Interfaces:**
- Produces: a working Supabase Google provider whose allowed redirect URLs include the extension's `chrome.identity` redirect. Task 4's `signIn()` depends on this.

- [ ] **Step 1: Determine the extension's redirect URL**

The redirect URL is `https://<EXTENSION_ID>.chromiumapp.org/`. For the published extension the ID is `aaecghoccdpphfkmnpakjdgpanlgijcc`, so the production redirect is
`https://aaecghoccdpphfkmnpakjdgpanlgijcc.chromiumapp.org/`.
For an unpacked dev copy the ID differs; obtain it by loading the extension unpacked and reading the ID at `chrome://extensions`, giving `https://<dev-id>.chromiumapp.org/`. Both must be registered (Steps 3-4). To make the dev ID equal the prod ID, optionally add the published extension's `key` to `manifest.json` (from the Chrome Web Store "Pack extension" / uploaded public key); recommended but not required.

- [ ] **Step 2: Write the runbook** `supabase/SETUP-google-oauth.md`:

```markdown
# Google OAuth setup for Prompt Box Pro

Done once by LB. Enables "Sign in with Google" in the extension.

## 1. Google Cloud OAuth client
1. https://console.cloud.google.com → create/select a project "Prompt Box".
2. APIs & Services → OAuth consent screen → External → app name "Prompt Box",
   support email lbwalton@gmail.com, add scopes: email, profile, openid. Add yourself as a test user.
3. APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
   - Authorized redirect URI: https://jmxmtiqkpegqywderwkt.supabase.co/auth/v1/callback
4. Copy the Client ID and Client secret.

## 2. Supabase Google provider
1. https://supabase.com/dashboard/project/jmxmtiqkpegqywderwkt/auth/providers → Google → enable.
2. Paste the Client ID and Client secret. Save.

## 3. Allowed redirect URLs (Supabase Auth → URL Configuration)
Add these to the allow list:
- https://aaecghoccdpphfkmnpakjdgpanlgijcc.chromiumapp.org/   (production extension)
- https://<your-unpacked-dev-id>.chromiumapp.org/             (dev, from chrome://extensions)

## 4. Verify
Once the extension code lands, "Sign in with Google" should complete and return to the extension.
```

- [ ] **Step 3: LB performs the runbook**

This step is LB's manual action. The implementer STOPS here and reports NEEDS_CONTEXT-style: "Task 2 runbook written; LB must complete the Google Cloud + Supabase provider setup before auth can be tested. Client ID/secret are entered only in the Google/Supabase dashboards, never in the repo." Do not fabricate credentials.

- [ ] **Step 4: Commit the runbook**

```bash
git add supabase/SETUP-google-oauth.md
git commit -m "docs(pro): Google OAuth setup runbook"
```

---

### Task 3: Public config module

**Files:**
- Create: `sync-config.js`
- Modify: `popup.html` (load the script before `popup.js`)

**Interfaces:**
- Produces: a global `PB_SYNC_CONFIG` object with `supabaseUrl`, `supabaseAnonKey`, `authRedirect` (computed), and the Stripe price IDs (for Phase 3). Consumed by `sync-auth.js` (Task 4) and Phase 2/3.

- [ ] **Step 1: Create `sync-config.js`**

Use the anon key recorded in the infra config in Task 1 Step 4. Replace `PASTE_ANON_KEY` with that value.

```js
// Public, non-secret config for Prompt Box Pro. Safe to ship: the anon key is
// protected by Row-Level Security. No secret keys ever live here.
const PB_SYNC_CONFIG = {
  supabaseUrl: 'https://jmxmtiqkpegqywderwkt.supabase.co',
  supabaseAnonKey: 'PASTE_ANON_KEY',
  // chrome.identity redirect for this extension instance.
  get authRedirect() {
    return chrome.identity.getRedirectURL();
  },
  stripePrices: {
    monthly: 'price_1TpZLQGuSTSqtrBZDOq0hOBv',
    annual: 'price_1TpZNQGuSTSqtrBZ94zcxFxR',
    lifetime: 'price_1TpZQGGuSTSqtrBZ79zdYXR4',
  },
};
```

- [ ] **Step 2: Load it in the popup before popup.js**

In `popup.html`, find the `<script src="popup.js"></script>` tag near the end and add `sync-config.js` and (for Task 4) `sync-auth.js` immediately before it:

```html
    <script src="sync-config.js"></script>
    <script src="sync-auth.js"></script>
    <script src="popup.js"></script>
```

- [ ] **Step 3: Verify**

Run `npm run lint && npm run security`. Reload the extension, open the popup, and in its DevTools console run `PB_SYNC_CONFIG.supabaseUrl` → expect the URL string, and `PB_SYNC_CONFIG.authRedirect` → expect `https://<id>.chromiumapp.org/`.

- [ ] **Step 4: Commit**

```bash
git add sync-config.js popup.html
git commit -m "feat(pro): public sync config module"
```

---

### Task 4: Auth module (`sync-auth.js`)

**Files:**
- Create: `sync-auth.js`

**Interfaces:**
- Consumes: `PB_SYNC_CONFIG` (Task 3).
- Produces: global `PBAuth` with:
  - `PBAuth.signIn()` → Promise resolving to `{ email }` or rejecting with an Error.
  - `PBAuth.signOut()` → Promise (clears stored session).
  - `PBAuth.getSession()` → Promise resolving to `{ accessToken, email } | null` (refreshes if near-expiry).
  - `PBAuth.getAccessToken()` → Promise resolving to a valid access token or null (used by Phase 2 for PostgREST calls).

- [ ] **Step 1: Create `sync-auth.js`**

```js
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
    const tokens = parseRedirect(redirectUrl);
    if (!tokens) throw new Error('no tokens in redirect');
    const email = await fetchUserEmail(tokens.access_token);
    const session = { ...tokens, email };
    await storeSession(session);
    return { email };
  }

  async function refresh(session) {
    const res = await fetch(
      cfg().supabaseUrl + '/auth/v1/token?grant_type=refresh_token',
      { method: 'POST', headers: authHeaders(null), body: JSON.stringify({ refresh_token: session.refresh_token }) }
    );
    if (!res.ok) return null;
    const d = await res.json();
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
      s = await refresh(s);
      if (!s) { await clearSession(); return null; }
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

  window.PBAuth = { signIn, signOut, getSession, getAccessToken };
})();
```

- [ ] **Step 2: Verify lint/security**

Run `npm run lint && npm run security`. Expect 0 errors. (`window.PBAuth`, `PB_SYNC_CONFIG` globals may warn as undefined in lint; add them to `.eslintrc.json` `globals` if lint errors: `"PB_SYNC_CONFIG": "readonly", "PBAuth": "writable", "chrome": "readonly"`.)

- [ ] **Step 3: Commit**

```bash
git add sync-auth.js .eslintrc.json
git commit -m "feat(pro): Google sign-in auth module"
```

---

### Task 5: Account UI + wire-up, manifest permissions

**Files:**
- Modify: `manifest.json` (add `identity` permission + Supabase host permission)
- Modify: `popup.html` (Account settings tab + panel, styles)
- Modify: `popup.js` (render account state, wire sign-in/out)

**Interfaces:**
- Consumes: `PBAuth` (Task 4).
- Produces: a working Account panel; no downstream consumer in Phase 1.

- [ ] **Step 1: Add permissions to `manifest.json`**

Change the permissions array and add host permissions:

```json
  "permissions": [
    "storage",
    "activeTab",
    "contextMenus",
    "clipboardWrite",
    "identity"
  ],
  "host_permissions": [
    "https://jmxmtiqkpegqywderwkt.supabase.co/*"
  ],
```

(Insert `host_permissions` as a sibling of `permissions`.)

- [ ] **Step 2: Add the Account tab and panel to `popup.html`**

In the `.settings-tabs` div (currently Tags / Import-Export / About), add an Account tab as the first tab:

```html
      <button class="settings-tab" data-tab="account">Account</button>
```

After the About panel (`id="panel-about"`), add:

```html
    <!-- Account Panel -->
    <div class="settings-panel" id="panel-account">
      <div class="about-section">
        <div id="accountSignedOut">
          <p><strong>Prompt Box Pro</strong> adds cloud sync across browsers and devices. Sign in to get started. Your local prompts stay exactly where they are.</p>
          <button class="import-export-btn" id="signInBtn" style="width:100%;">Sign in with Google</button>
          <div class="import-status" id="authStatus"></div>
        </div>
        <div id="accountSignedIn" style="display:none;">
          <p>Signed in as <strong id="accountEmail"></strong></p>
          <p id="accountPlan" style="color: var(--color-text-secondary); font-size: 13px;"></p>
          <button class="import-export-btn" id="signOutBtn" style="width:100%;">Sign out</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Wire the Account UI in `popup.js`**

Add near the other `setupEventListeners` wiring (inside or called from it). First, a render function:

```js
// ---- Account (Prompt Box Pro) ----
async function renderAccount() {
  const signedOut = document.getElementById('accountSignedOut');
  const signedIn = document.getElementById('accountSignedIn');
  if (!signedOut || !signedIn) return;
  let session = null;
  try { session = await PBAuth.getSession(); } catch (e) { session = null; }
  if (session && session.email) {
    signedOut.style.display = 'none';
    signedIn.style.display = 'block';
    document.getElementById('accountEmail').textContent = session.email;
  } else {
    signedOut.style.display = 'block';
    signedIn.style.display = 'none';
  }
}

function setupAccountUI() {
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const status = document.getElementById('authStatus');
  if (signInBtn) {
    signInBtn.addEventListener('click', async function () {
      status.textContent = 'Opening Google sign-in...';
      try {
        await PBAuth.signIn();
        status.textContent = '';
        await renderAccount();
      } catch (e) {
        status.textContent = 'Sign-in did not complete. Please try again.';
      }
    });
  }
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await PBAuth.signOut();
      await renderAccount();
    });
  }
}
```

Then call both at popup startup. Find where the popup initializes (the `DOMContentLoaded` / init path that calls `loadPrompts`) and add:

```js
  setupAccountUI();
  renderAccount();
```

- [ ] **Step 4: Verify lint/security + build sanity**

Run `npm run lint && npm run security`. Expect 0 errors.

- [ ] **Step 5: Manual end-to-end test (requires Task 2 setup done by LB)**

Reload the extension. Open popup → Settings → Account. Click "Sign in with Google", complete the Google flow. Expect the panel to flip to "Signed in as <your email>". In the Supabase dashboard → Table editor → `profiles`, confirm a row exists with your `user_id` and `is_pro = false`. Click "Sign out" → panel returns to signed-out. Reopen popup → still signed out. Sign in again → signed in persists across popup reopen (session stored). If sign-in fails, capture the popup console error and confirm the redirect URL is registered in Supabase (Task 2 Step 3).

- [ ] **Step 6: Commit**

```bash
git add manifest.json popup.html popup.js
git commit -m "feat(pro): account UI with Google sign-in/out"
```

---

### Task 6: Privacy + store-listing disclosure (docs only)

**Files:**
- Modify: `prompt-box-privacy-practices.md`
- Modify: `prompt-box-store-listing.md`

**Interfaces:**
- No code. Prepares the disclosures required before the eventual store upload (which waits until Phase 3 completes).

- [ ] **Step 1: Add permission justifications to `prompt-box-privacy-practices.md`**

Under Permission Justifications add:

```markdown
### `identity`

Used only to sign the user in with Google when they choose to create a Prompt Box Pro account. It launches the standard Google sign-in and returns an authentication token. Prompt Box never sees the user's Google password.

### Host permission — `https://jmxmtiqkpegqywderwkt.supabase.co/*`

Used only when the user has signed in to Prompt Box Pro, to talk to our Supabase backend for account sign-in and (with Pro) cloud sync. No data is sent here for signed-out or local-only users.
```

Add a changelog row at the top of the practices changelog table:

```markdown
| 4.0.0 | Added optional Prompt Box Pro accounts (Google sign-in) and cloud sync; adds identity permission and a Supabase host permission. Local-only remains the default; nothing leaves the device unless the user signs in and enables sync. |
```

- [ ] **Step 2: Note the pending store disclosure in `prompt-box-store-listing.md`**

In the feature copy, add a short paragraph (kept accurate to what will ship): 

```
Prompt Box Pro (optional, coming soon): sign in with Google to sync your prompts across browsers and devices. The free extension stays local-first and requires no account.
```

- [ ] **Step 3: Commit**

```bash
git add prompt-box-privacy-practices.md prompt-box-store-listing.md
git commit -m "docs(pro): privacy and listing disclosures for accounts"
```

---

## Self-Review Notes

- Spec coverage (Phase 1 slice): schema+RLS+trigger (Task 1), Google provider setup (Task 2), no-SDK fetch auth via chrome.identity with session storage + refresh (Task 4), Account UI (Task 5), manifest identity+host permission (Task 5), privacy disclosure (Task 6). Phase 2 (sync) and Phase 3 (billing) are intentionally separate plans.
- Security invariants: `is_pro` client-write blocked by the `guard_profile_entitlement` trigger (Task 1); RLS on both tables; no secret keys anywhere; account email rendered via `textContent` (Task 5 Step 3).
- Placeholder check: the one intentional value to fill is the anon key (public), recorded in Task 1 Step 4 and pasted in Task 3 Step 1. LB-owned external setup (Google/Supabase provider) is Task 2, explicitly a manual gate, not a code placeholder.
- Type consistency: `PBAuth.getSession()` returns `{ accessToken, email }`; `renderAccount` uses `session.email`; `getAccessToken()` (for Phase 2) returns the token string. `PB_SYNC_CONFIG` shape matches across config and auth.
- Known dependency: Task 5 Step 5 (end-to-end sign-in) cannot pass until Task 2's LB setup is done. Sequence accordingly.

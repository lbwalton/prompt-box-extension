# Prompt Box Pro — Phase 3: Billing (Stripe Checkout + Webhook)

**Date:** 2026-07-10
**Parent spec:** `2026-07-04-promptbox-pro-b2-design.md` §Phase 3 (the blueprint; this refines it to build level).
**Branch:** `feature/pro-b2-phase3-billing` (base ca01e6e; carries the BD0 test harness via cherry-pick).
**Execution:** PRD loop (stories B3-1 … B3-8 in `prd.json`).
**Mode:** Stripe **TEST MODE ONLY** until LB explicitly says otherwise. Secrets live only in Supabase Edge Function secrets, set by LB per runbook — never repo, never chat.

## Decisions defaulted while LB was AFK (override any of these)

1. **Checkout success/cancel URLs:** `https://promptboxapp.com/?checkout=success` and
   `https://promptboxapp.com/?checkout=cancel` (home page + query param — zero site work now; a
   dedicated `/pro/thanks` page in the promptbox-site repo is a nice-to-have later).
2. **Plan picker placement:** inline in Settings → Account (`#accountSignedIn`), replacing the unused
   `#accountPlan` line: three plan rows (Monthly $2.99/mo, Annual $19/yr, Founding Lifetime $39 once)
   + one Upgrade button. Shown only when signed in AND not Pro. When Pro: `#accountPlan` shows the
   active plan name instead.
3. **Founding Lifetime sold-out UX:** optimistic — the option is always listed; if `create-checkout`
   returns 409 `lifetime_sold_out`, the extension hides the option, shows "Founding Lifetime — sold
   out", and remembers nothing (server is the source of truth; the 100-cap is enforced server-side
   both in create-checkout and again in the webhook).
4. **Manage/cancel subscription:** OUT of scope this build. Cancellation happens in Stripe;
   `customer.subscription.deleted` already flips `is_pro` off via the webhook. A Stripe
   customer-portal link is a follow-up.
5. **RLS predicate scope:** `is_pro` gates **writes** (INSERT/UPDATE) on `prompts`; SELECT stays
   owner-scoped-only so an expired Pro can still read/export their cloud data. Rationale: sync
   pushes are the paid feature; reading your own data back should never be hostage.

## Components

### 1. Migration `0003_billing.sql`

- `stripe_events (id text primary key, type text, received_at timestamptz default now())` — webhook
  idempotency ledger. No RLS exposure needed for clients (service role only; enable RLS with no
  policies).
- RLS on `prompts`: replace the write policies so INSERT/UPDATE require
  `exists (select 1 from profiles p where p.user_id = auth.uid() and p.is_pro)`. SELECT policy
  unchanged (owner). This also blocks tombstone upserts from expired accounts — accepted (they are
  not syncing anyway).
- Helper for the lifetime cap: `create or replace function public.lifetime_count() returns integer`
  … `security definer` counting `profiles where plan = 'lifetime' and is_pro` — callable by the
  Edge Functions via service role (not exposed to anon).
- Applied by LB per runbook (same as migrations 0001/0002).

### 2. Edge Function `create-checkout` (`supabase/functions/create-checkout/index.ts`)

- POST, JSON `{ plan: 'monthly' | 'annual' | 'lifetime' }`. CORS: allow extension origin(s)
  (`chrome-extension://*`) + no credentials; responds to OPTIONS.
- Verifies the caller: `Authorization: Bearer <user JWT>` → `auth.getUser()` via supabase-js with
  the anon key. 401 on failure.
- Maps plan → TEST price ID from env (`PRICE_MONTHLY`, `PRICE_ANNUAL`, `PRICE_LIFETIME` function
  config; the same public IDs also live in `docs/infra/promptbox-pro-config.md`). Rejects unknown
  plans (400).
- Lifetime: if `lifetime_count() >= 100` → 409 `{ error: 'lifetime_sold_out' }`.
- Creates/reuses the Stripe customer: reads `profiles.stripe_customer_id` (service role client);
  if null, `stripe.customers.create({ email, metadata: { user_id } })` and persists it.
- Creates a Checkout Session: `mode: 'subscription'` (monthly/annual) or `'payment'` (lifetime),
  `customer`, `client_reference_id: user_id`, `metadata.user_id`, `metadata.plan`, success/cancel
  URLs (above). Returns `{ url }`.
- Secrets used: `STRIPE_SECRET_KEY` (LB-set), plus the platform-provided `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`.

### 3. Edge Function `stripe-webhook` (`supabase/functions/stripe-webhook/index.ts`)

- Deployed with `--no-verify-jwt` (Stripe calls it; signature IS the auth).
- Verifies `stripe-signature` with `constructEventAsync` + `STRIPE_WEBHOOK_SECRET`. 400 on failure.
- Idempotency: `insert into stripe_events (id, type)`; on conflict do nothing + short-circuit 200.
- Events:
  - `checkout.session.completed`: resolve `user_id` from `metadata.user_id` (fallback
    `client_reference_id`), plan from `metadata.plan`. Lifetime belt-and-suspenders: if plan is
    lifetime and `lifetime_count() >= 100` (excluding this user), still honor the paid session but
    log loudly — the cap gate is create-checkout; a paid customer is never silently dropped.
    Set `is_pro = true, plan, stripe_customer_id` via service role.
  - `customer.subscription.updated`: `is_pro = (status in ('active','trialing'))` for the profile
    matched by `stripe_customer_id`; never demote a `lifetime` profile.
  - `customer.subscription.deleted`: `is_pro = false, plan = null` for the matched profile; never
    demote `lifetime`.
- This function is the ONLY writer of `is_pro`/`plan`/`stripe_customer_id` (migration 0001's
  `guard_profile_entitlement` trigger enforces it — everything else gets a DB error).

### 4. Extension: Upgrade flow (popup.js / popup.html / sync-config.js)

- `sync-config.js` gains `functionsBase` (`https://<ref>.supabase.co/functions/v1`) — public value.
- Account panel (signed in, not Pro): plan picker (3 radio rows, token-styled) + `Upgrade` button →
  `POST functionsBase + '/create-checkout'` with the session JWT → open `{ url }` in a new tab
  (`chrome.tabs.create`) → popup note: "Finish checkout in the new tab, then reopen Prompt Box."
- 409 `lifetime_sold_out` → hide lifetime row + note. 401 → prompt re-sign-in. Network error →
  status line, retry allowed. All async work guarded by `entitlementEpoch` (existing pattern).
- Unlock: on every popup open, `renderAccount()` → `refreshCloudOption()` already re-fetches the
  entitlement; when `is_pro` flips true the Cloud radio unlocks and the badge goes vivid (existing
  Phase 2 machinery — no new polling).
- Manifest: no new host permissions (functions live on the already-permitted Supabase host;
  checkout opens in a normal tab, not fetched).

### 5. Sync-state hygiene folds (Phase-3-tagged backlog)

- **store-user-id-with-sync-state:** sign-in captures the Supabase user id (from `/auth/v1/user`,
  already fetched for email) into `pb_session.user_id`. New local key `pb_sync_user` written when
  the cloud path engages. `loadPrompts` cloud path: if `pb_session.user_id !== pb_sync_user` (a
  DIFFERENT account signed in on this device), reconcile without any cross-account data movement:
  `resetSyncState()` (cursors, tombstones, pb_sync_user), **drop the uuid'd prompts** from the
  local cache (they are the previous account's cloud rows; their cloud copies are untouched),
  keep never-synced local prompts, and **flip storagePref to `local`** — cloud mode was the
  previous account's explicit arming. The new user gets the standard one-click cloud-sync offer;
  nothing is pulled from or pushed to either account until they click it. `backgroundPull` skips
  entirely while an unreconciled mismatch exists (the popup owns reconciliation). This closes both
  the cursor/tombstone contamination AND the silent cross-account upload/merge paths (review
  finding, 2026-07-10).
- **Badge vs silent expiry:** when `getSession()` definitively invalidates (refresh token rejected →
  session cleared), the caller (renderAccount) writes `pb_is_pro: false` + `renderProBadge()` so a
  vivid badge cannot survive a dead session.
- **retry-pending-push:** on popup open in cloud mode, after the initial pull settles, if
  `pb_tombstones` is non-empty or any prompt `updatedAt > pb_last_push`, fire one
  `pushLocalChanges` (fixes: failed first-migration push stayed queued until the next edit).

### 6. Docs debt (pre-4.0.0, ships with this build)

- `prompt-box-privacy-practices.md`: disclose the `pb_*` local keys (`pb_session`, `pb_is_pro`,
  `pb_sync_offer_dismissed`, `pb_last_push`, `pb_last_pull`, `pb_tombstones`, `pb_sync_user`) and
  the "sync or local" storage line; add Changelog table row.
- Project `CLAUDE.md` Data Schema section: same keys.
- Store listing: no permission changes this build (checkout is a plain tab) — verify and note.
- NOT here: CHANGELOG + 4.0.0 bump (only when the store upload is actually prepared).

### 7. Runbook `supabase/SETUP-stripe-billing.md` (LB-manual, pattern: SETUP-google-oauth.md)

1. `supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_…` (test keys).
2. Set function config `PRICE_MONTHLY/PRICE_ANNUAL/PRICE_LIFETIME` (public test price IDs).
3. Apply migration 0003 (dashboard SQL editor).
4. Deploy: `supabase functions deploy create-checkout` and
   `supabase functions deploy stripe-webhook --no-verify-jwt` (I can run these if the CLI is
   already authed; `supabase login` itself is LB's).
5. Stripe TEST dashboard → webhook endpoint → `https://<ref>.supabase.co/functions/v1/stripe-webhook`
   with the three event types; paste the signing secret into step 1's secret.
6. Local webhook smoke test option: `stripe listen --forward-to` + `stripe trigger`.

## Verification split

- **Machine (mine):** `deno check` on both functions; harness verification of the Upgrade UI
  (fetch shim routes for `functionsBase`), sync-hygiene stories, and docs assertions. After LB's
  secrets/deploy gate: drive checkout.stripe.com TEST page end-to-end with card 4242 4242 4242 4242,
  verify `is_pro`/`plan` flip via Supabase, `stripe trigger` the subscription events, curl the
  functions for 401/400/409 paths.
- **LB (hard gates):** secrets + deploy + webhook endpoint (runbook), real-extension checkout round
  trip, merge word.

## Security invariants (restated, non-negotiable)

- `is_pro` written only by the webhook via service role; client cannot self-promote (DB trigger).
- Price IDs validated server-side against the env allowlist; amounts live in Stripe, never client.
- Webhook signature verified before any read of the payload; idempotent by event id.
- No secrets in repo/chat; extension only ever sees a Checkout URL and its own entitlement row.
- All new rendered content (plan names, errors) goes through escapeHTML/textContent.

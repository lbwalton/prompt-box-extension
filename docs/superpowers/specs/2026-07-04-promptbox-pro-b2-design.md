# Prompt Box Pro (B2): Accounts, Cloud Sync, and Payments

**Date:** 2026-07-04
**Status:** Approved by LB. Infrastructure provisioned (see `docs/infra/promptbox-pro-config.md`).
**Parent spec:** `2026-07-03-prompt-box-pro-design.md` (this is the detailed design for its "B2" build).

## Goal

Turn Prompt Box's local extension into a freemium product: free users keep everything local exactly as
today; Pro users ($2.99/mo, $19/yr, or $39 Founding Lifetime) get an account, cloud sync across
browsers and devices, and (later) web-app access. Built in three phases, each independently testable.

## What stays free and unchanged

Everything local: unlimited prompts, text expansion, tags, favorites, search, import/export, and today's
Chrome Sync storage mode. Existing free users see zero difference. Local-only remains the default and the
privacy headline. Pro is a purely additive cloud layer, opt-in.

## Architecture at a glance

```
Extension (offline-first)                Supabase (promptbox-pro)              Stripe (test → live)
- chrome.storage.local = source of truth  - Auth (Google OAuth)                 - Checkout (3 prices)
- sync engine (push/pull deltas)   <--->   - profiles(user_id, is_pro)          - webhook --> Edge Fn
- Google sign-in via chrome.identity       - prompts(... , updated_at,               sets is_pro=true
- reads is_pro to gate Pro UI                deleted_at) + RLS
```

Two firm technical decisions (keep the extension's no-build-step simplicity and CSP intact):
1. **No SDK bundling.** Talk to Supabase Auth and PostgREST with plain `fetch()`. The Supabase
   publishable (anon) key is safe to embed; Row-Level Security is what protects data.
2. **Server holds all secrets.** The Stripe secret key and webhook secret live only in a Supabase Edge
   Function. The extension never sees them; it only opens a Checkout URL and reads `is_pro`.

## Supabase project

- Project `promptbox-pro`, ref `jmxmtiqkpegqywderwkt` (IDs in the infra config).
- `profiles` table: `user_id uuid PK references auth.users`, `is_pro boolean default false`,
  `stripe_customer_id text`, `plan text`, `updated_at timestamptz`. A trigger inserts a `profiles` row
  on new `auth.users`. RLS: a user can select/update only their own row; `is_pro` is only ever written by
  the service role (the webhook), never by the client.
- `prompts` table mirrors the extension schema: `id uuid PK`, `user_id uuid`, `title text`, `text text`,
  `tags jsonb`, `shortcut text`, `is_favorite boolean`, `is_sensitive boolean`, `created_at timestamptz`,
  `updated_at timestamptz`, `deleted_at timestamptz` (soft-delete tombstone). RLS: full CRUD scoped to
  `user_id = auth.uid()`. Index on `(user_id, updated_at)` for delta pulls.

## Phase 1: Accounts (Google sign-in)

- Manifest gains `identity` permission and host permission `https://jmxmtiqkpegqywderwkt.supabase.co/*`.
  (Permission change → store re-review; documented in privacy docs before shipping.)
- A `sync-auth.js` module: `signIn()` calls `chrome.identity.launchWebAuthFlow` against
  `https://<ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=https://<extension-id>.chromiumapp.org/`.
  Supabase returns access + refresh tokens in the redirect fragment. Store the session in
  `chrome.storage.local` under a dedicated key. `getSession()`, `signOut()`, and `refreshIfNeeded()`
  (refresh against `/auth/v1/token?grant_type=refresh_token` when the access token is near expiry).
- Supabase side: enable the Google provider (needs a Google Cloud OAuth client whose authorized redirect
  includes the Supabase callback and the extension's chromiumapp.org origin — a setup step LB does with
  guidance). Add the extension's chromiumapp.org URL to Supabase Auth's allowed redirect URLs.
- Popup UI: a small "Account" area in Settings. Signed out → "Sign in with Google". Signed in → email +
  sign-out. This is the only new auth surface for v1.
- Testable end state: sign in, see your Google email in Settings, a `profiles` row exists with
  `is_pro=false`, refresh works, sign-out clears the session.

## Phase 2: Cloud sync (offline-first)

- New storage mode "Prompt Box Cloud" alongside the existing local / Chrome-Sync modes. Selectable only
  when signed in AND `is_pro` is true. Choosing it makes Supabase the sync target; `chrome.storage.local`
  stays the immediate source of truth so the UI is instant and works offline.
- A `sync-engine.js` module with one public call each direction, hooked into the existing chokepoints:
  - `pushLocalChanges()`: after any `savePrompts`, upsert changed/new rows and set `deleted_at` on
    removed ones (by `id`, `updated_at`).
  - `pullRemoteChanges()`: on popup open and on a periodic `chrome.alarms` tick, fetch rows where
    `updated_at > lastSyncAt`, merge into local, drop tombstoned ids, update `lastSyncAt`.
  - Conflict resolution: last-write-wins by `updated_at`. Deletes win via tombstone so a delete on one
    device does not get resurrected by a stale copy on another.
- First Pro sign-in migration: push existing local prompts to the cloud (same shape as the current
  local→Chrome-Sync first-run migration). If the cloud already has rows (second device), merge instead of
  overwrite.
- Every prompt mutation stamps `updated_at = now` and generates a stable `id` (uuid) if missing (today's
  ids are timestamps; the engine backfills uuids on migration).
- Error handling: network failures are non-fatal — local stays authoritative, sync retries next tick, and
  a subtle "offline / last synced" indicator shows status. Never block editing on sync.
- Testable end state (before any billing): manually set `is_pro=true` on a test profile in Supabase, then
  verify create/edit/delete/favorite/tag round-trip across two Chrome profiles, offline edits reconcile,
  and deletes propagate.

## Phase 3: Billing (Stripe Checkout + webhook)

- Stripe test products/prices already exist (IDs in the infra config): Pro Monthly, Pro Annual, Founding
  Lifetime. Founding Lifetime enforces the 100-cap in the webhook (count paid lifetime rows; if ≥100,
  the extension hides that option; belt-and-suspenders check server-side).
- Two Supabase Edge Functions:
  - `create-checkout`: authenticated (verifies the user's Supabase JWT), creates a Stripe Checkout
    Session for the chosen price, returns the URL. Sets/reuses `stripe_customer_id` on the profile.
  - `stripe-webhook`: verifies the Stripe signature, and on `checkout.session.completed` /
    `customer.subscription.updated` / `customer.subscription.deleted`, sets `is_pro` and `plan` on the
    matching profile (via service role). This is the only writer of `is_pro`.
- Extension "Upgrade to Pro" flow: pick plan → call `create-checkout` → open the returned URL in a tab →
  on focus return, re-read the profile; when `is_pro` flips true, unlock the cloud sync mode.
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the Supabase `service_role` key are Edge
  Function secrets set by LB directly (never in git, never in chat).
- Testable end state: Stripe test card completes Checkout, the webhook flips `is_pro`, the extension
  unlocks cloud sync. Subscription cancel flips it back.

## Manifest / permission changes

Add `identity` and host permission for the Supabase URL. Update `prompt-box-privacy-practices.md`, the
site privacy page, and the store listing with a clear disclosure: "If you enable Pro cloud sync, your
prompts are stored on our Supabase server (encrypted in transit and at rest); local-only remains the
default and nothing leaves your device unless you turn on sync." Expect a Chrome Web Store re-review.

## File structure (new, in the extension repo)

- `sync-auth.js` — Google sign-in, session storage, token refresh.
- `sync-engine.js` — push/pull deltas, conflict resolution, migration.
- `sync-config.js` — Supabase URL + anon key + Stripe price IDs (public values from the infra config).
- `supabase/` — SQL migrations (schema + RLS) and the two Edge Functions.
- Hooks in `popup.js` (`loadPrompts`/`savePrompts`, new Account + Upgrade UI) and `manifest.json`.
Runtime JS stays unbundled and CSP-clean.

## Out of scope (later builds)

- The web app / PWA (B3) — reuses this same Supabase auth and `prompts` table.
- Hosted prompt improver, version history, team libraries (backlog).
- Passwordless/email auth, multiple auth providers (Google only for v1).

## Security invariants (non-negotiable)

- `is_pro` is only ever written by the webhook (service role); the client cannot self-promote.
- RLS on every table; no table is readable/writable across users.
- No secret keys in the extension, the repo, or chat — only in Edge Function secrets.
- Existing XSS/escapeHTML/sanitizeInput rules apply to any new rendered content (e.g., account email).

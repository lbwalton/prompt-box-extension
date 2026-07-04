# Prompt Box Pro: Infrastructure Config & Credentials

**Created:** 2026-07-04. Set up during B2 (accounts + sync + payments).

This file holds the **public, non-secret identifiers** for the Pro backend. It is safe to commit.
Secrets (anything that grants privileged access) are NOT stored here and never go in git; see the
Secrets section for where each one actually lives.

---

## Supabase (project: promptbox-pro)

| Field | Value | Sensitivity |
|-------|-------|-------------|
| Organization | Prompt Box (Supabase org, free) | public |
| Project name | promptbox-pro | public |
| Project ref | `jmxmtiqkpegqywderwkt` | public |
| Project URL | `https://jmxmtiqkpegqywderwkt.supabase.co` | public |
| Region | West US (Oregon), us-west-2 | public |
| Publishable (anon) key | `sb_publishable_vX5mvAVPmCnoebqDyPBRcw_vYS9JLMh` | public, safe to embed in the extension (RLS protects data) |

Dashboard: https://supabase.com/dashboard/project/jmxmtiqkpegqywderwkt

The extension will need a manifest host permission for `https://jmxmtiqkpegqywderwkt.supabase.co/*`.

## Stripe (TEST / sandbox mode)

Account: `acct_1TpZ8OGuSTSqtrBZ` (dedicated Prompt Box account). All values below are **test mode**.
Live-mode product/price IDs are created separately at launch and will differ.

| Item | ID | Amount |
|------|-----|--------|
| Product: Prompt Box Pro | `prod_UpDnaBehPQBYS1` | — |
| Price: Pro Monthly | `price_1TpZLQGuSTSqtrBZDOq0hOBv` | $2.99 / month (recurring) |
| Price: Pro Annual | `price_1TpZNQGuSTSqtrBZ94zcxFxR` | $19.00 / year (recurring) |
| Product: Prompt Box Founding Lifetime | `prod_UpDrdAJM6tVvdQ` | — |
| Price: Founding Lifetime | `price_1TpZQGGuSTSqtrBZ79zdYXR4` | $39.00 one-time |

Publishable key (test, `pk_test_...`): public, safe to commit once filled in here from the dashboard
(Developers → API keys). The extension itself does not strictly need it because Checkout Sessions are
created server-side, but it is harmless to record.

Dashboard: https://dashboard.stripe.com/test/products

---

## Secrets (NEVER in this file, never in git)

These grant privileged access. Each has exactly one home, set directly by LB. If any value ever
appears in this repo or a commit, rotate it immediately.

| Secret | Lives in | Notes |
|--------|----------|-------|
| Supabase `service_role` key | Supabase Edge Function env (`supabase secrets set`) | server-only; bypasses RLS |
| Supabase DB password | Supabase (resettable in dashboard) | not used by app code day-to-day |
| Stripe secret key (`sk_test_...` / `sk_live_...`) | Supabase Edge Function secret `STRIPE_SECRET_KEY` | LB pastes into the secret store during Phase 3; never in chat/git |
| Stripe webhook signing secret (`whsec_...`) | Supabase Edge Function secret `STRIPE_WEBHOOK_SECRET` | generated when the webhook endpoint is created |

**Pattern:** the webhook Edge Function is the only place the Stripe secret key and webhook secret exist.
The extension and web app never see them. The extension only ever opens a Checkout URL (created
server-side) and reads the resulting `is_pro` flag from Supabase.

## Launch checklist (test → live)

- [ ] Recreate the three products/prices in Stripe **live** mode; record live price IDs here.
- [ ] Set live `STRIPE_SECRET_KEY` and live `STRIPE_WEBHOOK_SECRET` in the Edge Function secrets.
- [ ] Point the extension's checkout at live price IDs (env/config swap, not code).
- [ ] Confirm Supabase project is on a paid tier if usage warrants (free tier is fine to start).

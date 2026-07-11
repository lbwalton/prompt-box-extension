# Stripe billing setup for Prompt Box Pro (TEST mode)

Done by LB. Wires the two Edge Functions to Stripe's TEST environment. Nothing here goes in git or
chat except the public price IDs (already in `docs/infra/promptbox-pro-config.md`). Everything below
is TEST mode; the live-mode pass at launch repeats these steps with live keys/prices and is tracked
in the infra config's launch checklist.

## 1. Edge Function secrets (Stripe secret key)

From the Stripe TEST dashboard (Developers → API keys), copy the **secret key** (`sk_test_…`), then:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...   --project-ref jmxmtiqkpegqywderwkt
```

(The webhook signing secret is set in §5 after the endpoint exists.)

## 2. Price ID config

Public TEST price IDs (from the infra config), stored as function env too:

```bash
supabase secrets set \
  PRICE_MONTHLY=price_1TpZLQGuSTSqtrBZDOq0hOBv \
  PRICE_ANNUAL=price_1TpZNQGuSTSqtrBZ94zcxFxR \
  PRICE_LIFETIME=price_1TpZQGGuSTSqtrBZ79zdYXR4 \
  --project-ref jmxmtiqkpegqywderwkt
```

## 3. Apply migration 0003

Dashboard → SQL editor → paste `supabase/migrations/0003_billing.sql` → run. Creates
`stripe_events`, the `is_pro` write predicate on `prompts`, and `lifetime_count()`.

Quick check afterwards (SQL editor):
```sql
select policyname from pg_policies where tablename = 'prompts';
-- expect: prompts_select_own, prompts_insert_own_pro, prompts_update_own_pro, prompts_delete_own
```

## 4. Deploy the functions

```bash
supabase functions deploy create-checkout --project-ref jmxmtiqkpegqywderwkt
supabase functions deploy stripe-webhook  --project-ref jmxmtiqkpegqywderwkt --no-verify-jwt
```

`--no-verify-jwt` on the webhook only: Stripe calls it; the signature check is its auth.
(Claude can run these two commands if the Supabase CLI is already logged in; `supabase login`
itself is yours.)

## 5. Stripe webhook endpoint

Stripe TEST dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://jmxmtiqkpegqywderwkt.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`
- After creating, reveal the **signing secret** (`whsec_…`) and store it:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref jmxmtiqkpegqywderwkt
```

## 6. Verify (tag-team: LB popup steps, Claude drives web/CLI)

1. `curl -X POST https://jmxmtiqkpegqywderwkt.supabase.co/functions/v1/create-checkout` → 401
   (no JWT).
2. Signed-in extension (or a captured test JWT): create-checkout returns a
   `https://checkout.stripe.com/...` URL.
3. Open the URL, pay with test card `4242 4242 4242 4242` (any future expiry, any CVC, any ZIP).
4. `profiles` row: `is_pro = true`, `plan` set, `stripe_customer_id` set. `stripe_events` has the
   event id exactly once.
5. `stripe trigger customer.subscription.deleted` (or cancel in the dashboard): `is_pro` flips
   back to false (lifetime profiles are never demoted).
6. Extension: reopen popup → Cloud unlocks (upgrade) / re-locks (cancel).

Optional local loop without the dashboard endpoint: `stripe listen --forward-to
https://jmxmtiqkpegqywderwkt.supabase.co/functions/v1/stripe-webhook` + `stripe trigger …`
(uses the CLI's own signing secret — set `STRIPE_WEBHOOK_SECRET` to the one `stripe listen`
prints while testing this way, then restore the dashboard endpoint's secret).

## Test cards

| Card | Result |
|------|--------|
| 4242 4242 4242 4242 | success |
| 4000 0000 0000 0002 | declined |
| 4000 0025 0000 3155 | requires 3-D Secure |

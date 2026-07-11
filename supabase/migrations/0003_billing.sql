-- Phase 3 (billing): webhook idempotency ledger, server-side is_pro write gate
-- on prompts, and the Founding Lifetime counter.
-- Applied by LB via the dashboard SQL editor (see SETUP-stripe-billing.md §3).

-- 1) Webhook idempotency: one row per processed Stripe event. Service-role only:
--    RLS enabled with no policies makes it invisible to anon/authenticated
--    clients (service role bypasses RLS).
create table if not exists public.stripe_events (
  id text primary key,
  type text,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;

-- 2) Caller-scoped entitlement probe used by the prompts write policies below.
--    security definer with a pinned search_path; it reveals only the CALLER's
--    own flag. Clients need execute because RLS policy expressions run with the
--    querying role's privileges.
create or replace function public.is_pro_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_pro from public.profiles where user_id = auth.uid()),
    false
  )
$$;
grant execute on function public.is_pro_user() to authenticated, anon;

-- 3) prompts: reads stay owner-scoped; writes additionally require is_pro.
--    An expired/free account can still read + export (and hard-delete) its own
--    cloud data, but can no longer push new or edited rows — including the
--    tombstone upserts (accepted: that account is not syncing anyway, and the
--    extension already handles a 403 push by keeping the queue for retry).
drop policy if exists prompts_all_own on public.prompts;
drop policy if exists prompts_select_own on public.prompts;
create policy prompts_select_own on public.prompts
  for select using (auth.uid() = user_id);
drop policy if exists prompts_insert_own_pro on public.prompts;
create policy prompts_insert_own_pro on public.prompts
  for insert with check (auth.uid() = user_id and public.is_pro_user());
drop policy if exists prompts_update_own_pro on public.prompts;
create policy prompts_update_own_pro on public.prompts
  for update using (auth.uid() = user_id and public.is_pro_user())
  with check (auth.uid() = user_id and public.is_pro_user());
drop policy if exists prompts_delete_own on public.prompts;
create policy prompts_delete_own on public.prompts
  for delete using (auth.uid() = user_id);

-- 4) Founding Lifetime cap counter, used by create-checkout (gate) and the
--    webhook (belt-and-suspenders). Service-role callable ONLY: the implicit
--    execute grant to PUBLIC is revoked so clients cannot probe the count.
create or replace function public.lifetime_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles where plan = 'lifetime' and is_pro
$$;
revoke execute on function public.lifetime_count() from public, anon, authenticated;
grant execute on function public.lifetime_count() to service_role;

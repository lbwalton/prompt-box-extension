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

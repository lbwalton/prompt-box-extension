-- Phase 2: let authenticated client inserts omit user_id.
-- RLS still enforces user_id = auth.uid(); this only provides the value on insert
-- so the extension's PostgREST upsert body doesn't need to carry it.
alter table public.prompts alter column user_id set default auth.uid();

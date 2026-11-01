-- Additive authorization for the quota RPC. Provision approved emails in
-- konklancer_private.managed_llm_members before enabling managed inference.
-- This is independent of the gateway's MANAGED_LLM_EMAILS / USER_IDS allowlist.
create table if not exists konklancer_private.managed_llm_members (
  email text primary key,
  added_at timestamptz not null default now(),
  constraint managed_llm_email_lowercase check (email = lower(email))
);
alter table konklancer_private.managed_llm_members enable row level security;
revoke all on konklancer_private.managed_llm_members from public, anon, authenticated;

create or replace function public.konklancer_reserve_managed_request() returns boolean
language plpgsql security definer set search_path = pg_catalog, konklancer_private as $$
declare new_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users u join konklancer_private.managed_llm_members m on m.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  ) then return false; end if;
  insert into konklancer_private.managed_llm_daily_quota(day, request_count)
  values ((now() at time zone 'UTC')::date, 1)
  on conflict(day) do update set request_count = konklancer_private.managed_llm_daily_quota.request_count + 1
    where konklancer_private.managed_llm_daily_quota.request_count < 100
  returning request_count into new_count;
  return new_count is not null;
end $$;
revoke all on function public.konklancer_reserve_managed_request() from public, anon;
grant execute on function public.konklancer_reserve_managed_request() to authenticated;

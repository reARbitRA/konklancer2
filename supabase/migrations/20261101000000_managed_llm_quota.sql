-- Additive quota for managed inference. The shared daily ceiling is 100 attempts UTC.
create schema if not exists konklancer_private;
create table if not exists konklancer_private.managed_llm_daily_quota (day date primary key, request_count integer not null default 0);
alter table konklancer_private.managed_llm_daily_quota enable row level security;
revoke all on schema konklancer_private from public, anon, authenticated;
revoke all on konklancer_private.managed_llm_daily_quota from public, anon, authenticated;
create or replace function public.konklancer_reserve_managed_request() returns boolean language plpgsql security definer set search_path = pg_catalog, konklancer_private as $$
declare new_count integer;
begin
  if auth.uid() is null then return false; end if;
  insert into konklancer_private.managed_llm_daily_quota(day, request_count) values ((now() at time zone 'UTC')::date, 1)
  on conflict(day) do update set request_count = konklancer_private.managed_llm_daily_quota.request_count + 1 where konklancer_private.managed_llm_daily_quota.request_count < 100
  returning request_count into new_count;
  return new_count is not null;
end $$;
revoke all on function public.konklancer_reserve_managed_request() from public, anon;
grant execute on function public.konklancer_reserve_managed_request() to authenticated;

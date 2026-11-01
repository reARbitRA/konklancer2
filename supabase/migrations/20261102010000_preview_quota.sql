-- Separate preview quota; this anonymous RPC does not expose credentials or start inference.
-- Anyone with the publishable key can exhaust this preview quota. Production quota is separate.
create table if not exists konklancer_private.managed_llm_preview_quota (
  day date primary key, request_count integer not null default 0
);
alter table konklancer_private.managed_llm_preview_quota enable row level security;
revoke all on konklancer_private.managed_llm_preview_quota from public, anon, authenticated;
create or replace function public.konklancer_reserve_preview_request() returns boolean
language plpgsql security definer set search_path = pg_catalog, konklancer_private as $$
declare new_count integer;
begin
  insert into konklancer_private.managed_llm_preview_quota(day, request_count)
  values ((now() at time zone 'UTC')::date, 1)
  on conflict(day) do update set request_count = konklancer_private.managed_llm_preview_quota.request_count + 1
    where konklancer_private.managed_llm_preview_quota.request_count < 20
  returning request_count into new_count;
  return new_count is not null;
end $$;
revoke all on function public.konklancer_reserve_preview_request() from public;
grant execute on function public.konklancer_reserve_preview_request() to anon, authenticated;

begin;
create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  service text not null check (char_length(trim(service)) between 3 and 120),
  preferred_date date not null,
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'cancelled')),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointment_requests_owner_idx on public.appointment_requests(user_id, created_at desc, id desc);
alter table public.appointment_requests enable row level security;
revoke all on public.appointment_requests from public, anon, authenticated;
revoke all on public.appointment_requests from service_role;
grant select, insert, update on public.appointment_requests to service_role;
create or replace trigger appointment_requests_updated_at before update on public.appointment_requests
for each row execute function public.set_updated_at();
create or replace function public.lavemais_health()
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  perform id, legacy_mongo_id from public.users limit 1;
  perform bucket_key from public.rate_limits limit 1;
  perform token_hash from public.session_revocations limit 1;
  perform id, user_id, revision from public.appointment_requests limit 1;
  return 1;
end;
$$;
revoke all on function public.lavemais_health() from public, anon, authenticated;
grant execute on function public.lavemais_health() to service_role;
commit;

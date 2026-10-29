begin;
create extension if not exists pgcrypto;
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 3 and 120),
  email text not null check (char_length(trim(email)) between 3 and 254),
  phone text not null check (char_length(trim(phone)) between 1 and 24),
  birth_date date not null check (birth_date <= current_date),
  password_hash text not null,
  password_reset_code_hash text,
  password_reset_expires_at timestamptz,
  password_reset_requested_at timestamptz,
  session_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A stable mapping for resumable Mongo imports. Never used as an API identity.
alter table public.users add column if not exists legacy_mongo_id text;
create unique index if not exists users_legacy_mongo_id_idx on public.users (legacy_mongo_id) where legacy_mongo_id is not null;
create unique index if not exists users_email_unique_idx on public.users (lower(email));
create index if not exists users_password_reset_idx on public.users (email, password_reset_expires_at);
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();

create table if not exists public.rate_limits (
  bucket_key text primary key,
  hits integer not null default 1,
  expires_at timestamptz not null
);
create index if not exists rate_limits_expiry_idx on public.rate_limits (expires_at);
create table if not exists public.session_revocations (
  token_hash text primary key,
  expires_at timestamptz not null
);
create index if not exists session_revocations_expiry_idx on public.session_revocations (expires_at);

alter table public.users enable row level security;
alter table public.rate_limits enable row level security;
alter table public.session_revocations enable row level security;
revoke all on public.users, public.rate_limits, public.session_revocations from public, anon, authenticated;
grant select, insert, update, delete on public.users, public.rate_limits, public.session_revocations to service_role;

create or replace function public.lavemais_request_reset(p_email text, p_hash text)
returns table(id uuid) language sql security invoker set search_path = '' as $$
  update public.users set password_reset_code_hash = p_hash,
    password_reset_requested_at = now(), password_reset_expires_at = now() + interval '10 minutes'
  where email = p_email and (password_reset_requested_at is null or password_reset_requested_at <= now() - interval '1 minute')
  returning id;
$$;
create or replace function public.lavemais_cancel_reset(p_email text, p_hash text)
returns void language sql security invoker set search_path = '' as $$
  update public.users set password_reset_code_hash = null, password_reset_expires_at = null, password_reset_requested_at = null
  where email = p_email and password_reset_code_hash = p_hash;
$$;
create or replace function public.lavemais_consume_reset(p_email text, p_hash text, p_password_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  update public.users set password_hash = p_password_hash, session_version = session_version + 1,
    password_reset_code_hash = null, password_reset_expires_at = null, password_reset_requested_at = null
  where email = p_email and password_reset_code_hash = p_hash and password_reset_expires_at > now();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
create or replace function public.lavemais_rate_limit(p_key text, p_expires_at timestamptz)
returns integer language plpgsql security invoker set search_path = '' as $$
declare counter integer;
begin
  delete from public.rate_limits where expires_at < now();
  delete from public.session_revocations where expires_at < now();
  insert into public.rate_limits as buckets (bucket_key, hits, expires_at) values (p_key, 1, p_expires_at)
    on conflict (bucket_key) do update set hits = buckets.hits + 1
    returning hits into counter;
  return counter;
end;
$$;
-- Readiness checks permissions, relation existence and schema revision, not just a client object.
create or replace function public.lavemais_health()
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  perform id, legacy_mongo_id from public.users limit 1;
  perform bucket_key from public.rate_limits limit 1;
  perform token_hash from public.session_revocations limit 1;
  return 1;
end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.lavemais_request_reset(text,text) from public, anon, authenticated;
revoke all on function public.lavemais_cancel_reset(text,text) from public, anon, authenticated;
revoke all on function public.lavemais_consume_reset(text,text,text) from public, anon, authenticated;
revoke all on function public.lavemais_rate_limit(text,timestamptz) from public, anon, authenticated;
revoke all on function public.lavemais_health() from public, anon, authenticated;
grant execute on function public.set_updated_at(), public.lavemais_request_reset(text,text), public.lavemais_cancel_reset(text,text), public.lavemais_consume_reset(text,text,text), public.lavemais_rate_limit(text,timestamptz), public.lavemais_health() to service_role;
commit;

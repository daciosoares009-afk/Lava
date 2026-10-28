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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists users_email_unique_idx
  on public.users (lower(email));

create index if not exists users_password_reset_idx
  on public.users (email, password_reset_expires_at);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

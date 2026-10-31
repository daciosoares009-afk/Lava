begin;
create table if not exists public.mfa_credentials (
  user_id uuid primary key references public.users(id),
  secret text not null,
  enabled boolean not null default false,
  version text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  last_counter bigint not null default -1,
  recovery_hashes text[] not null default '{}'
);
alter table public.mfa_credentials enable row level security;
revoke all on public.mfa_credentials from public,anon,authenticated;
grant select,insert,update on public.mfa_credentials to service_role;
create or replace function public.lavemais_mfa_begin(p_id uuid,p_secret text,p_version text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.mfa_credentials as c(user_id,secret,version) values(p_id,p_secret,p_version)
 on conflict(user_id) do update set secret=excluded.secret,version=excluded.version,expires_at=now()+interval '10 minutes',last_counter=-1,recovery_hashes='{}' where not c.enabled;
 get diagnostics n=row_count; return n=1;
end; $$;
create or replace function public.lavemais_mfa_activate(p_id uuid,p_version text,p_counter bigint,p_hashes text[])
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 update public.mfa_credentials set enabled=true,last_counter=p_counter,recovery_hashes=p_hashes where user_id=p_id and version=p_version and not enabled and expires_at>now();
 get diagnostics n=row_count; return n=1;
end; $$;
create or replace function public.lavemais_mfa_consume(p_id uuid,p_version text,p_counter bigint,p_recovery text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_recovery is not null then
 update public.mfa_credentials set recovery_hashes=array_remove(recovery_hashes,p_recovery) where user_id=p_id and version=p_version and enabled and p_recovery=any(recovery_hashes);
 else
 update public.mfa_credentials set last_counter=p_counter where user_id=p_id and version=p_version and enabled and last_counter<p_counter;
 end if;
 get diagnostics n=row_count; return n=1;
end; $$;
create or replace function public.lavemais_mfa_disable(p_id uuid,p_version text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 update public.mfa_credentials set enabled=false,secret='',version='',recovery_hashes='{}' where user_id=p_id and version=p_version and enabled;
 get diagnostics n=row_count;
 if n=1 then update public.users set session_version=session_version+1 where id=p_id; end if;
 return n=1;
end; $$;
revoke all on function public.lavemais_mfa_begin(uuid,text,text),public.lavemais_mfa_activate(uuid,text,bigint,text[]),public.lavemais_mfa_consume(uuid,text,bigint,text),public.lavemais_mfa_disable(uuid,text) from public,anon,authenticated;
grant execute on function public.lavemais_mfa_begin(uuid,text,text),public.lavemais_mfa_activate(uuid,text,bigint,text[]),public.lavemais_mfa_consume(uuid,text,bigint,text),public.lavemais_mfa_disable(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;

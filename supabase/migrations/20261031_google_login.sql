begin;
alter table public.users add column if not exists google_subject text;
create unique index if not exists users_google_subject_idx on public.users(google_subject) where google_subject is not null;
create or replace function public.lavemais_link_google(p_id uuid,p_subject text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 update public.users set google_subject=p_subject where id=p_id and (google_subject is null or google_subject=p_subject);
 get diagnostics n=row_count;return n=1;
end; $$;
revoke all on function public.lavemais_link_google(uuid,text) from public,anon,authenticated;
grant execute on function public.lavemais_link_google(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;

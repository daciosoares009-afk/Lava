begin;
alter table public.appointment_requests drop constraint if exists appointment_requests_status_check;
alter table public.appointment_requests add constraint appointment_requests_status_check check (status in ('pending','confirmed','cancelled','completed'));
alter table public.appointment_requests add column if not exists staff_message text not null default '' check (char_length(staff_message) <= 500);
alter table public.appointment_requests add column if not exists staff_history jsonb not null default '[]'::jsonb;
alter table public.appointment_requests add column if not exists notification_state text not null default 'pending' check (notification_state in ('pending','sending','sent','failed'));
alter table public.appointment_requests add column if not exists notification_attempts integer not null default 0;
alter table public.appointment_requests add column if not exists notification_lease uuid;
alter table public.appointment_requests add column if not exists notification_started_at timestamptz;
create index if not exists appointment_requests_status_idx on public.appointment_requests(status, created_at desc, id desc);
create or replace function public.lavemais_staff_transition(p_id uuid, p_revision integer, p_status text, p_message text, p_actor uuid)
returns setof public.appointment_requests language plpgsql security invoker set search_path = '' as $$
begin
  if p_status not in ('confirmed','cancelled','completed') or char_length(trim(p_message)) not between 3 and 500 then
    raise exception 'Invalid transition' using errcode = '23514';
  end if;
  return query update public.appointment_requests set status=p_status, staff_message=trim(p_message), revision=revision+1,
    staff_history=staff_history || jsonb_build_array(jsonb_build_object('actor',p_actor,'from',status,'to',p_status,'message',trim(p_message),'at',now()))
  where id=p_id and revision=p_revision and ((status='pending' and p_status in ('confirmed','cancelled')) or (status='confirmed' and p_status in ('cancelled','completed')))
  returning *;
end;
$$;
create or replace function public.lavemais_claim_notification(p_id uuid, p_lease uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  update public.appointment_requests set notification_state='sending',notification_lease=p_lease,notification_started_at=now(),notification_attempts=notification_attempts+1
  where id=p_id and status='pending' and notification_attempts<5 and (notification_state in ('pending','failed') or (notification_state='sending' and notification_started_at < now()-interval '5 minutes'));
  get diagnostics changed = row_count; return changed=1;
end;
$$;
create or replace function public.lavemais_finish_notification(p_id uuid,p_lease uuid,p_sent boolean)
returns void language sql security invoker set search_path = '' as $$
  update public.appointment_requests set notification_state=case when p_sent then 'sent' else 'failed' end,notification_lease=null
  where id=p_id and notification_lease=p_lease and notification_state='sending';
$$;
revoke all on function public.lavemais_staff_transition(uuid,integer,text,text,uuid),public.lavemais_claim_notification(uuid,uuid),public.lavemais_finish_notification(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.lavemais_staff_transition(uuid,integer,text,text,uuid),public.lavemais_claim_notification(uuid,uuid),public.lavemais_finish_notification(uuid,uuid,boolean) to service_role;
notify pgrst, 'reload schema';
commit;

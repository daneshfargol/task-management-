-- Turn personal reminder schedules into recurring task templates.
begin;

alter table public.sm_routine_alarms add column project_id uuid references public.sm_projects(id) on delete cascade;
alter table public.sm_routine_alarms add constraint sm_routine_alarm_project_required check (project_id is not null) not valid;
alter table sm_private.routine_alarm_deliveries add column task_id uuid references public.sm_tasks(id) on delete set null;

drop policy sm_routine_alarm_own on public.sm_routine_alarms;
create policy sm_routine_alarm_own on public.sm_routine_alarms for all to authenticated
 using (user_id = (select auth.uid()))
 with check (
   user_id = (select auth.uid())
   and project_id is not null
   and exists(select 1 from public.sm_members m where m.project_id=sm_routine_alarms.project_id and m.user_id=(select auth.uid()) and m.active and not m.external)
 );
alter table public.sm_routine_alarms validate constraint sm_routine_alarm_project_required;

create or replace function sm_private.send_routine_alarm_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare local_now timestamp := p_now at time zone 'Asia/Tehran'; r record; tid uuid; sent integer := 0;
begin
 for r in
   select a.id,a.user_id,a.project_id,a.title,a.note,m.id as member_id
   from public.sm_routine_alarms a
   join public.sm_members m on m.project_id=a.project_id and m.user_id=a.user_id and m.active and not m.external
   where a.active
     and extract(dow from local_now)::smallint = any(a.weekdays)
     and a.remind_at = date_trunc('minute', local_now)::time
 loop
   insert into sm_private.routine_alarm_deliveries(routine_id,local_date)
   values(r.id,local_now::date) on conflict do nothing;
   if found then
     insert into public.sm_tasks(project_id,title,description,owner_id,reviewer_id,creator_id)
     values(r.project_id,r.title,r.note,r.member_id,null,r.member_id)
     returning id into tid;
     update sm_private.routine_alarm_deliveries set task_id=tid where routine_id=r.id and local_date=local_now::date;
     insert into sm_private.push_queue(subscription_id,user_id,routine_id,task_id,notification_title,notification_body,notification_url)
     select s.id,r.user_id,r.id,tid,'کار روتین جدید',left(r.title || case when r.note='' then '' else ' — '||r.note end,240),'/shared.html?task='||tid
     from sm_private.push_subscriptions s where s.user_id=r.user_id and s.enabled;
     sent := sent + 1;
   end if;
 end loop;
 perform sm_private.push_wake();
 return sent;
end $$;

commit;

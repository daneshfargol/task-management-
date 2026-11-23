-- Put recurring tasks into the member's list at the start of the day;
-- only alert at the selected time when the daily task is still open.
begin;

alter table sm_private.routine_alarm_deliveries
  add column if not exists notified_at timestamptz;

create or replace function sm_private.send_routine_alarm_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare
  local_now timestamp := p_now at time zone 'Asia/Tehran';
  r record;
  tid uuid;
  sent integer := 0;
begin
  -- A daily occurrence is created as soon as the new local day is reached.
  -- The conflict key keeps this safe if the cron job retries.
  for r in
    select a.id,a.user_id,a.project_id,a.title,a.note,m.id as member_id
    from public.sm_routine_alarms a
    join public.sm_members m
      on m.project_id=a.project_id and m.user_id=a.user_id and m.active and not m.external
    where a.active
      and extract(dow from local_now)::smallint = any(a.weekdays)
  loop
    insert into sm_private.routine_alarm_deliveries(routine_id,local_date)
    values(r.id,local_now::date)
    on conflict do nothing;

    if found then
      insert into public.sm_tasks(project_id,title,description,owner_id,reviewer_id,creator_id)
      values(r.project_id,r.title,r.note,r.member_id,null,r.member_id)
      returning id into tid;

      update sm_private.routine_alarm_deliveries
      set task_id=tid
      where routine_id=r.id and local_date=local_now::date;
    end if;
  end loop;

  -- At the chosen minute, notify only if the daily occurrence has not been submitted/completed.
  for r in
    select a.id,a.user_id,a.title,a.note,d.task_id
    from public.sm_routine_alarms a
    join sm_private.routine_alarm_deliveries d
      on d.routine_id=a.id and d.local_date=local_now::date
    join public.sm_tasks t on t.id=d.task_id
    where a.active
      and a.remind_at=date_trunc('minute',local_now)::time
      and d.notified_at is null
      and t.status='open'
  loop
    update sm_private.routine_alarm_deliveries d
    set notified_at=p_now
    where d.routine_id=r.id
      and d.local_date=local_now::date
      and d.notified_at is null
      and exists(select 1 from public.sm_tasks t where t.id=d.task_id and t.status='open');

    if found then
      insert into sm_private.push_queue(subscription_id,user_id,routine_id,task_id,notification_title,notification_body,notification_url)
      select s.id,r.user_id,r.id,r.task_id,'کار روتین امروز',left(r.title || case when r.note='' then '' else ' — '||r.note end,240),'/shared.html?task='||r.task_id
      from sm_private.push_subscriptions s
      where s.user_id=r.user_id and s.enabled;
      sent := sent+1;
    end if;
  end loop;

  perform sm_private.push_wake();
  return sent;
end $$;

create or replace function public.sm_push_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update sm_private.push_queue set state='failed' where state in ('pending','sending') and (attempts>=8 or created_at<now()-interval '1 day');
 update sm_private.push_queue q set state='cancelled' where q.state in ('pending','sending') and not exists(
   select 1 from sm_private.push_subscriptions s where s.id=q.subscription_id and s.user_id=q.user_id and s.enabled
   and (
     (q.notice_id is null and q.routine_id is null)
     or exists(select 1 from public.sm_notices n join public.sm_members m on m.id=n.recipient_id join public.sm_tasks t on t.id=n.task_id
       where n.id=q.notice_id and m.user_id=q.user_id and m.active and not n.read and (m.role='director' or t.owner_id=m.id or m.id=any(t.collaborators)) and (n.reminder_days is null or (t.status='open' and t.due=n.reminder_due and not exists(select 1 from public.sm_task_trash x where x.task_id=t.id))))
     or exists(select 1 from public.sm_routine_alarms a join public.sm_tasks t on t.id=q.task_id
       where a.id=q.routine_id and a.user_id=q.user_id and a.active and t.status='open')
   )
 );
 with candidates as (
   select id from sm_private.push_queue where (state='pending' or (state='sending' and next_attempt<=now())) and next_attempt<=now() and attempts<8 order by created_at for update skip locked limit 20
 ), claimed as (
   update sm_private.push_queue q set state='sending',attempts=q.attempts+1,next_attempt=now()+interval '5 minutes' where q.id in(select id from candidates) returning q.*
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',q.id,'attempt',q.attempts,'taskId',q.task_id,'test',(q.notice_id is null and q.routine_id is null),
   'reminderDays',(select n.reminder_days from public.sm_notices n where n.id=q.notice_id),
   'notificationTitle',q.notification_title,'notificationBody',q.notification_body,'notificationUrl',q.notification_url,
   'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))
 )),'[]'::jsonb) into result from claimed q join sm_private.push_subscriptions s on s.id=q.subscription_id;
 return result;
end;
$$;

revoke execute on function sm_private.send_routine_alarm_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.sm_push_claim() from public, anon, authenticated;
grant execute on function public.sm_push_claim() to service_role;

commit;

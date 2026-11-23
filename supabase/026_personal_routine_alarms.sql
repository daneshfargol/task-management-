-- Personal recurring reminders. Each signed-in member owns only their own alarms.
begin;

create table public.sm_routine_alarms (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 160),
 note text not null default '' check (length(note) <= 800),
 remind_at time without time zone not null check (date_trunc('minute', remind_at) = remind_at),
 weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index sm_routine_alarms_user_active_time on public.sm_routine_alarms(user_id, active, remind_at);
alter table public.sm_routine_alarms enable row level security;
revoke all on public.sm_routine_alarms from public, anon, authenticated;
grant select, insert, update, delete on public.sm_routine_alarms to authenticated;
create policy sm_routine_alarm_own on public.sm_routine_alarms for all to authenticated
 using (user_id = (select auth.uid()))
 with check (
   user_id = (select auth.uid())
   and exists(select 1 from public.sm_members m where m.user_id = (select auth.uid()) and m.active and not m.external)
 );

create table sm_private.routine_alarm_deliveries (
 routine_id uuid not null references public.sm_routine_alarms(id) on delete cascade,
 local_date date not null,
 created_at timestamptz not null default now(),
 primary key(routine_id, local_date)
);
alter table sm_private.routine_alarm_deliveries enable row level security;
revoke all on sm_private.routine_alarm_deliveries from public, anon, authenticated;

alter table sm_private.push_queue
 add column routine_id uuid references public.sm_routine_alarms(id) on delete cascade,
 add column notification_title text check (notification_title is null or length(notification_title) <= 120),
 add column notification_body text check (notification_body is null or length(notification_body) <= 240),
 add column notification_url text check (notification_url is null or length(notification_url) <= 500);
create index sm_push_queue_routine_id_idx on sm_private.push_queue(routine_id) where routine_id is not null;

create or replace function sm_private.send_routine_alarm_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare local_now timestamp := p_now at time zone 'Asia/Tehran'; r record; sent integer := 0;
begin
 for r in
   select a.id,a.user_id,a.title,a.note
   from public.sm_routine_alarms a
   where a.active
     and extract(dow from local_now)::smallint = any(a.weekdays)
     and a.remind_at = date_trunc('minute', local_now)::time
 loop
   insert into sm_private.routine_alarm_deliveries(routine_id,local_date)
   values(r.id,local_now::date) on conflict do nothing;
   if found then
     insert into sm_private.push_queue(subscription_id,user_id,routine_id,notification_title,notification_body,notification_url)
     select s.id,r.user_id,r.id,'یادآور شخصی',left(r.title || case when r.note='' then '' else ' — '||r.note end,240),'/shared.html?routine='||r.id
     from sm_private.push_subscriptions s
     where s.user_id=r.user_id and s.enabled;
     sent := sent + 1;
   end if;
 end loop;
 perform sm_private.push_wake();
 return sent;
end $$;
revoke execute on function sm_private.send_routine_alarm_reminders(timestamptz) from public, anon, authenticated;
select cron.schedule('samandis-routine-alarms','* * * * *','select sm_private.send_routine_alarm_reminders()');

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
     or exists(select 1 from public.sm_routine_alarms a where a.id=q.routine_id and a.user_id=q.user_id and a.active)
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
revoke all on function public.sm_push_claim() from public, anon, authenticated;
grant execute on function public.sm_push_claim() to service_role;
commit;

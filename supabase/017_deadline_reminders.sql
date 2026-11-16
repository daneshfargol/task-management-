begin;
alter table public.sm_notices add column reminder_days smallint,add column reminder_due date;
create table sm_private.deadline_reminders(task_id uuid not null references public.sm_tasks(id),due date not null,days_before smallint not null check(days_before in(0,1,2)),recipient_id uuid not null references public.sm_members(id),created_at timestamptz not null default now(),primary key(task_id,due,days_before,recipient_id));
alter table sm_private.deadline_reminders enable row level security;
revoke all on sm_private.deadline_reminders from public,anon,authenticated;
create function sm_private.send_deadline_reminders(p_now timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=p_now at time zone 'Asia/Tehran';r record;sent integer:=0;
begin
if local_now::time<time '08:00' then return 0;end if;
for r in select distinct t.id,t.project_id,t.title,t.due,m.id as recipient_id,d.days_before from public.sm_tasks t cross join (values(2),(1),(0)) d(days_before) join public.sm_members m on m.project_id=t.project_id and m.active and not m.external and m.user_id is not null and (m.id=t.owner_id or m.id=any(t.collaborators)) where t.status='open' and t.due=local_now::date+d.days_before and not exists(select 1 from public.sm_task_trash x where x.task_id=t.id) loop
insert into sm_private.deadline_reminders(task_id,due,days_before,recipient_id) values(r.id,r.due,r.days_before,r.recipient_id) on conflict do nothing;
if found then
insert into public.sm_notices(project_id,task_id,recipient_id,text,reminder_days,reminder_due) values(r.project_id,r.id,r.recipient_id,case r.days_before when 2 then 'دو روز تا مهلت: ' when 1 then 'یک روز تا مهلت: ' else 'مهلت امروز: ' end||r.title,r.days_before,r.due);sent:=sent+1;
end if;
end loop;
return sent;
end $$;
revoke execute on function sm_private.send_deadline_reminders(timestamptz) from public,anon,authenticated;
select cron.schedule('samandis-deadline-reminders','* * * * *','select sm_private.send_deadline_reminders()');
commit;

begin;
create or replace function public.sm_push_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update sm_private.push_queue set state='failed' where state in ('pending','sending') and (attempts>=8 or created_at<now()-interval '1 day');
 update sm_private.push_queue q set state='cancelled' where q.state in ('pending','sending') and not exists(
 select 1 from sm_private.push_subscriptions s where s.id=q.subscription_id and s.user_id=q.user_id and s.enabled
 and (q.notice_id is null or exists(select 1 from public.sm_notices n join public.sm_members m on m.id=n.recipient_id join public.sm_tasks t on t.id=n.task_id
 where n.id=q.notice_id and m.user_id=q.user_id and m.active and not n.read and (m.role='director' or t.owner_id=m.id or m.id=any(t.collaborators)) and (n.reminder_days is null or (t.status='open' and t.due=n.reminder_due and not exists(select 1 from public.sm_task_trash x where x.task_id=t.id))))));
 with candidates as (
 select id from sm_private.push_queue where (state='pending' or (state='sending' and next_attempt<=now())) and next_attempt<=now() and attempts<8
 order by created_at for update skip locked limit 20
 ), claimed as (
 update sm_private.push_queue q set state='sending',attempts=q.attempts+1,next_attempt=now()+interval '5 minutes'
 where q.id in(select id from candidates) returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'attempt',q.attempts,'taskId',q.task_id,'test',q.notice_id is null,'reminderDays',(select n.reminder_days from public.sm_notices n where n.id=q.notice_id),
 'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb)
 into result from claimed q join sm_private.push_subscriptions s on s.id=q.subscription_id;
 return result;
end;
$$;
commit;

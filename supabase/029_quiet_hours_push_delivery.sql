begin;

-- All push notifications are held overnight and resume at 07:00 Tehran time.
create or replace function public.sm_push_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  result jsonb;
  local_now timestamp := now() at time zone 'Asia/Tehran';
begin
  if local_now::time < time '07:00' or local_now::time >= time '18:00' then
    return '[]'::jsonb;
  end if;

  update sm_private.push_queue
  set state='failed'
  where state in ('pending','sending')
    and (attempts>=8 or created_at<now()-interval '1 day');

  update sm_private.push_queue q
  set state='cancelled'
  where q.state in ('pending','sending') and not exists(
    select 1
    from sm_private.push_subscriptions s
    where s.id=q.subscription_id and s.user_id=q.user_id and s.enabled
      and (
        (q.notice_id is null and q.routine_id is null)
        or exists(
          select 1
          from public.sm_notices n
          join public.sm_members m on m.id=n.recipient_id
          join public.sm_tasks t on t.id=n.task_id
          where n.id=q.notice_id and m.user_id=q.user_id and m.active
            and not n.read
            and (m.role='director' or t.owner_id=m.id or m.id=any(t.collaborators))
            and (n.reminder_days is null or (t.status='open' and t.due=n.reminder_due and not exists(select 1 from public.sm_task_trash x where x.task_id=t.id)))
        )
        or exists(
          select 1
          from public.sm_routine_alarms a
          join public.sm_tasks t on t.id=q.task_id
          where a.id=q.routine_id and a.user_id=q.user_id and a.active and t.status='open'
        )
      )
  );

  with candidates as (
    select id
    from sm_private.push_queue
    where (state='pending' or (state='sending' and next_attempt<=now()))
      and next_attempt<=now() and attempts<8
    order by created_at
    for update skip locked
    limit 20
  ), claimed as (
    update sm_private.push_queue q
    set state='sending',attempts=q.attempts+1,next_attempt=now()+interval '5 minutes'
    where q.id in(select id from candidates)
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'attempt',q.attempts,'taskId',q.task_id,
    'test',(q.notice_id is null and q.routine_id is null),
    'reminderDays',(select n.reminder_days from public.sm_notices n where n.id=q.notice_id),
    'notificationTitle',q.notification_title,
    'notificationBody',q.notification_body,
    'notificationUrl',q.notification_url,
    'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))
  )),'[]'::jsonb)
  into result
  from claimed q
  join sm_private.push_subscriptions s on s.id=q.subscription_id;

  return result;
end;
$$;

revoke all on function public.sm_push_claim() from public, anon, authenticated;
grant execute on function public.sm_push_claim() to service_role;

commit;

-- Flexible personal task routines: daily, weekly, monthly and report-period titles.
begin;

alter table public.sm_routine_alarms
  add column if not exists schedule_type text not null default 'weekly'
    check (schedule_type in ('daily','weekly','monthly')),
  add column if not exists month_day smallint
    check (month_day is null or month_day between 1 and 31),
  add column if not exists date_context text not null default 'none'
    check (date_context in ('none','previous_day','previous_week','previous_month'));

alter table public.sm_routine_alarms
  add constraint sm_routine_month_day_required
  check (schedule_type <> 'monthly' or month_day is not null) not valid;
alter table public.sm_routine_alarms validate constraint sm_routine_month_day_required;

-- Convert a Gregorian date to its Jalali components without depending on a database extension.
create or replace function sm_private.jalali_parts(p_date date)
returns table(jy integer,jm integer,jd integer)
language plpgsql immutable strict set search_path='' as $$
declare
  gy integer:=extract(year from p_date)::integer;
  gm integer:=extract(month from p_date)::integer;
  gd integer:=extract(day from p_date)::integer;
  gy2 integer;
  days integer;
  g_days integer[]:=array[0,31,59,90,120,151,181,212,243,273,304,334];
begin
  if gy>1600 then jy:=979;gy:=gy-1600;else jy:=0;gy:=gy-621;end if;
  gy2:=case when gm>2 then gy+1 else gy end;
  days:=365*gy+(gy2+3)/4-(gy2+99)/100+(gy2+399)/400-80+gd+g_days[gm];
  jy:=jy+33*(days/12053);days:=days%12053;
  jy:=jy+4*(days/1461);days:=days%1461;
  if days>365 then jy:=jy+(days-1)/365;days:=(days-1)%365;end if;
  if days<186 then jm:=1+days/31;jd:=1+days%31;else jm:=7+(days-186)/30;jd:=1+(days-186)%30;end if;
  return next;
end;
$$;

create or replace function sm_private.jalali_day_label(p_date date)
returns text language plpgsql immutable strict set search_path='' as $$
declare p record; names text[]:=array['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
begin
  select * into p from sm_private.jalali_parts(p_date);
  return translate(p.jd::text||' '||names[p.jm]||' '||p.jy::text,'0123456789','۰۱۲۳۴۵۶۷۸۹');
end;
$$;

create or replace function sm_private.jalali_month_label(p_date date,p_previous boolean default false)
returns text language plpgsql immutable strict set search_path='' as $$
declare p record; names text[]:=array['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']; y integer;m integer;
begin
  select * into p from sm_private.jalali_parts(p_date);y:=p.jy;m:=p.jm;
  if p_previous then if m=1 then m:=12;y:=y-1;else m:=m-1;end if;end if;
  return translate(names[m]||' '||y::text,'0123456789','۰۱۲۳۴۵۶۷۸۹');
end;
$$;

create or replace function sm_private.routine_task_title(p_title text,p_context text,p_date date)
returns text language plpgsql immutable strict set search_path='' as $$
begin
  return case p_context
    when 'previous_day' then p_title||' — '||sm_private.jalali_day_label(p_date-1)
    when 'previous_week' then p_title||' — هفته منتهی به '||sm_private.jalali_day_label(p_date-1)
    when 'previous_month' then p_title||' — '||sm_private.jalali_month_label(p_date,true)
    else p_title
  end;
end;
$$;

create or replace function sm_private.send_routine_alarm_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare
  local_now timestamp:=p_now at time zone 'Asia/Tehran';
  routine_day date:=local_now::date;
  local_jalali record;
  r record;
  tid uuid;
  task_title text;
  sent integer:=0;
begin
  select * into local_jalali from sm_private.jalali_parts(routine_day);
  for r in
    select a.id,a.user_id,a.project_id,a.title,a.note,a.date_context,m.id as member_id
    from public.sm_routine_alarms a
    join public.sm_members m on m.project_id=a.project_id and m.user_id=a.user_id and m.active and not m.external
    where a.active and (
      a.schedule_type='daily'
      or (a.schedule_type='weekly' and extract(dow from local_now)::smallint=any(a.weekdays))
      or (a.schedule_type='monthly' and a.month_day=local_jalali.jd)
    )
  loop
    insert into sm_private.routine_alarm_deliveries(routine_id,local_date)
    values(r.id,routine_day) on conflict do nothing;
    if found then
      task_title:=sm_private.routine_task_title(r.title,r.date_context,routine_day);
      insert into public.sm_tasks(project_id,title,description,owner_id,reviewer_id,creator_id)
      values(r.project_id,task_title,r.note,r.member_id,null,r.member_id)
      returning id into tid;
      update sm_private.routine_alarm_deliveries set task_id=tid where routine_id=r.id and local_date=routine_day;
    end if;
  end loop;

  for r in
    select a.id,a.user_id,a.title,a.note,d.task_id
    from public.sm_routine_alarms a
    join sm_private.routine_alarm_deliveries d on d.routine_id=a.id and d.local_date=routine_day
    join public.sm_tasks t on t.id=d.task_id
    where a.active and a.remind_at=date_trunc('minute',local_now)::time and d.notified_at is null and t.status='open'
  loop
    update sm_private.routine_alarm_deliveries d set notified_at=p_now
    where d.routine_id=r.id and d.local_date=routine_day and d.notified_at is null
      and exists(select 1 from public.sm_tasks t where t.id=d.task_id and t.status='open');
    if found then
      insert into sm_private.push_queue(subscription_id,user_id,routine_id,task_id,notification_title,notification_body,notification_url)
      select s.id,r.user_id,r.id,r.task_id,'کار روتین امروز',left(r.title||case when r.note='' then '' else ' — '||r.note end,240),'/shared.html?task='||r.task_id
      from sm_private.push_subscriptions s where s.user_id=r.user_id and s.enabled;
      sent:=sent+1;
    end if;
  end loop;
  perform sm_private.push_wake();
  return sent;
end;
$$;

revoke execute on function sm_private.jalali_parts(date) from public,anon,authenticated;
revoke execute on function sm_private.jalali_day_label(date) from public,anon,authenticated;
revoke execute on function sm_private.jalali_month_label(date,boolean) from public,anon,authenticated;
revoke execute on function sm_private.routine_task_title(text,text,date) from public,anon,authenticated;
revoke execute on function sm_private.send_routine_alarm_reminders(timestamptz) from public,anon,authenticated;

commit;

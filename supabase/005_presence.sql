begin;
create table public.sm_presence_sessions(id uuid primary key,project_id uuid not null references public.sm_projects(id),member_id uuid not null references public.sm_members(id),started_at timestamptz not null default now(),last_seen timestamptz not null default now(),ended_at timestamptz,active boolean not null default false);
create table public.sm_presence_days(project_id uuid not null references public.sm_projects(id),member_id uuid not null references public.sm_members(id),day date not null,first_seen timestamptz not null,last_seen timestamptz not null,last_credit_at timestamptz not null,active_seconds numeric not null default 0 check(active_seconds>=0),primary key(project_id,member_id,day));
create index on public.sm_presence_sessions(project_id,member_id,last_seen);
alter table public.sm_presence_sessions enable row level security;
alter table public.sm_presence_days enable row level security;
revoke all on public.sm_presence_sessions,public.sm_presence_days from anon,authenticated;
grant select on public.sm_presence_sessions,public.sm_presence_days to authenticated;
create policy sm_presence_sessions_read on public.sm_presence_sessions for select to authenticated using(public.sm_has_access(project_id) and (sm_private.member(project_id)).role='director');
create policy sm_presence_days_read on public.sm_presence_days for select to authenticated using(public.sm_has_access(project_id) and (sm_private.member(project_id)).role='director');
create function public.sm_presence(p_project uuid,p_session uuid,p_event text) returns void language plpgsql security definer set search_path='' as $$
declare m public.sm_members;s public.sm_presence_sessions;d public.sm_presence_days;n timestamptz:=clock_timestamp();today date;delta numeric:=0;midnight timestamptz;
begin
 m:=sm_private.member(p_project);if m.id is null then raise exception 'Access denied';end if;
 if p_event not in ('beat','pause','end') then raise exception 'Invalid event';end if;
 today:=(n at time zone 'Asia/Tehran')::date;midnight:=today::timestamp at time zone 'Asia/Tehran';
 insert into public.sm_presence_sessions(id,project_id,member_id,started_at,last_seen,active) values(p_session,p_project,m.id,n,n,false) on conflict(id) do nothing;
 select * into s from public.sm_presence_sessions where id=p_session for update;
 if s.project_id<>p_project or s.member_id<>m.id then raise exception 'Access denied';end if;
 if s.ended_at is not null then return;end if;
 insert into public.sm_presence_days(project_id,member_id,day,first_seen,last_seen,last_credit_at) values(p_project,m.id,today,n,n,n) on conflict do nothing;
 select * into d from public.sm_presence_days where project_id=p_project and member_id=m.id and day=today for update;
 if s.active then delta:=greatest(0,least(75,extract(epoch from n-greatest(s.last_seen,d.last_credit_at,midnight))));end if;
 update public.sm_presence_days set last_seen=n,last_credit_at=n,active_seconds=active_seconds+delta where project_id=p_project and member_id=m.id and day=today;
 update public.sm_presence_sessions set last_seen=n,active=p_event='beat',ended_at=case when p_event='end' then n else null end where id=p_session;
end $$;
create function public.sm_presence_report(p_project uuid,p_day date) returns table(member_id uuid,first_seen timestamptz,last_seen timestamptz,active_seconds numeric,last_exit timestamptz,online boolean) language plpgsql stable security definer set search_path='' as $$
declare m public.sm_members;
begin
 m:=sm_private.member(p_project);if m.id is null or m.role<>'director' then raise exception 'Management only';end if;
 return query select d.member_id,d.first_seen,d.last_seen,d.active_seconds,
 (select max(s.ended_at) from public.sm_presence_sessions s where s.project_id=p_project and s.member_id=d.member_id and (s.ended_at at time zone 'Asia/Tehran')::date=p_day),
 exists(select 1 from public.sm_presence_sessions s where s.project_id=p_project and s.member_id=d.member_id and s.active and s.ended_at is null and s.last_seen>now()-interval '75 seconds')
 from public.sm_presence_days d where d.project_id=p_project and d.day=p_day order by d.first_seen;
end $$;
revoke execute on function public.sm_presence(uuid,uuid,text),public.sm_presence_report(uuid,date) from public,anon;
grant execute on function public.sm_presence(uuid,uuid,text),public.sm_presence_report(uuid,date) to authenticated;
commit;

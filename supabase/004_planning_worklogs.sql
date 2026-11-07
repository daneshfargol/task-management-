begin;
create table public.sm_milestones (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.sm_projects(id),title text not null check(length(trim(title)) between 1 and 200),description text not null default '',owner_id uuid not null references public.sm_members(id),starts_on date not null,due date not null,status text not null default 'planned' check(status in ('planned','active','delivered')),revision integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(starts_on<=due)
);
create table public.sm_milestone_history(id uuid primary key default gen_random_uuid(),milestone_id uuid not null references public.sm_milestones(id),project_id uuid not null references public.sm_projects(id),actor_id uuid not null references public.sm_members(id),snapshot jsonb not null,created_at timestamptz not null default now());
create table public.sm_worklogs(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.sm_projects(id),task_id uuid not null references public.sm_tasks(id),member_id uuid not null references public.sm_members(id),work_date date not null,hours numeric(5,2) not null check(hours>0 and hours<=24),description text not null check(length(trim(description)) between 1 and 4000),created_at timestamptz not null default now());
create index on public.sm_milestones(project_id,due);
create index on public.sm_worklogs(project_id,member_id,work_date);
alter table public.sm_milestones enable row level security;
alter table public.sm_milestone_history enable row level security;
alter table public.sm_worklogs enable row level security;
create policy sm_milestone_read on public.sm_milestones for select to authenticated using(public.sm_has_access(project_id));
create policy sm_milestone_history_read on public.sm_milestone_history for select to authenticated using(public.sm_has_access(project_id));
create policy sm_worklog_read on public.sm_worklogs for select to authenticated using(public.sm_has_access(project_id) and (member_id=(sm_private.member(project_id)).id or (sm_private.member(project_id)).role='director'));
revoke all on public.sm_milestones,public.sm_milestone_history,public.sm_worklogs from anon,authenticated;
grant select on public.sm_milestones,public.sm_milestone_history,public.sm_worklogs to authenticated;
create function public.sm_save_milestone(p_project uuid,p_id uuid,p_revision integer,p_title text,p_description text,p_owner uuid,p_start date,p_due date,p_status text) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.sm_members;v public.sm_milestones;mid uuid;
begin
 m:=sm_private.member(p_project);if m.id is null or m.role<>'director' then raise exception 'Access denied';end if;
 if not exists(select 1 from public.sm_members where id=p_owner and project_id=p_project and active) then raise exception 'Invalid owner';end if;
 if p_id is null then
 insert into public.sm_milestones(project_id,title,description,owner_id,starts_on,due,status) values(p_project,trim(p_title),left(coalesce(p_description,''),10000),p_owner,p_start,p_due,p_status) returning id into mid;
 else
 select * into v from public.sm_milestones where id=p_id and project_id=p_project for update;
 if not found or v.revision<>p_revision then raise exception 'Conflict: refresh and retry';end if;
 update public.sm_milestones set title=trim(p_title),description=left(coalesce(p_description,''),10000),owner_id=p_owner,starts_on=p_start,due=p_due,status=p_status,revision=revision+1,updated_at=now() where id=v.id;mid:=v.id;
 end if;
 insert into public.sm_milestone_history(milestone_id,project_id,actor_id,snapshot) select mid,p_project,m.id,to_jsonb(x) from public.sm_milestones x where id=mid;
 return mid;
end $$;
create function public.sm_log_work(p_task uuid,p_date date,p_hours numeric,p_description text) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks;m public.sm_members;lid uuid;total numeric;
begin
 select * into t from public.sm_tasks where id=p_task;m:=sm_private.member(t.project_id);
 if m.id is null or (m.id<>t.owner_id and not(m.id=any(t.collaborators))) then raise exception 'Only own work may be logged';end if;
 if p_date is null or p_date>(now() at time zone 'Asia/Tehran')::date then raise exception 'Future work date is not allowed';end if;
 perform pg_advisory_xact_lock(hashtextextended(m.id::text||p_date::text,0));
 select coalesce(sum(hours),0) into total from public.sm_worklogs where member_id=m.id and work_date=p_date;
 if p_hours is null or p_hours<=0 or total+p_hours>24 then raise exception 'Daily work hours exceed 24';end if;
 insert into public.sm_worklogs(project_id,task_id,member_id,work_date,hours,description) values(t.project_id,t.id,m.id,p_date,p_hours,trim(p_description)) returning id into lid;
 return lid;
end $$;
revoke execute on function public.sm_save_milestone(uuid,uuid,integer,text,text,uuid,date,date,text),public.sm_log_work(uuid,date,numeric,text) from public,anon;
grant execute on function public.sm_save_milestone(uuid,uuid,integer,text,text,uuid,date,date,text),public.sm_log_work(uuid,date,numeric,text) to authenticated;
commit;

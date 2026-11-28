-- Manually activated, finish-to-start workflow templates.
begin;

create table sm_private.workflow_templates (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.sm_projects(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=2000),
 creator_id uuid not null references public.sm_members(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table sm_private.workflow_steps (
 id uuid primary key default gen_random_uuid(),
 template_id uuid not null references sm_private.workflow_templates(id) on delete cascade,
 sequence smallint not null check(sequence between 1 and 30),
 title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=4000),
 owner_id uuid not null references public.sm_members(id),
 reviewer_id uuid references public.sm_members(id),
 duration_days smallint not null check(duration_days between 1 and 365),
 unique(template_id,sequence)
);
create table sm_private.workflow_runs (
 id uuid primary key default gen_random_uuid(),
 template_id uuid not null references sm_private.workflow_templates(id) on delete restrict,
 project_id uuid not null references public.sm_projects(id) on delete cascade,
 activated_by uuid not null references public.sm_members(id),
 created_at timestamptz not null default now()
);
create table sm_private.workflow_run_steps (
 run_id uuid not null references sm_private.workflow_runs(id) on delete cascade,
 step_id uuid not null references sm_private.workflow_steps(id) on delete restrict,
 task_id uuid not null unique references public.sm_tasks(id) on delete cascade,
 sequence smallint not null,
 duration_days smallint not null,
 state text not null check(state in ('blocked','active','done')),
 activated_at timestamptz,
 completed_at timestamptz,
 primary key(run_id,step_id),
 unique(run_id,sequence)
);
create index workflow_run_steps_task_idx on sm_private.workflow_run_steps(task_id);
alter table sm_private.workflow_templates enable row level security;
alter table sm_private.workflow_steps enable row level security;
alter table sm_private.workflow_runs enable row level security;
alter table sm_private.workflow_run_steps enable row level security;
revoke all on sm_private.workflow_templates,sm_private.workflow_steps,sm_private.workflow_runs,sm_private.workflow_run_steps from public,anon,authenticated;

create or replace function public.sm_workflow_list(p_project uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.sm_members;
begin
 m:=sm_private.member(p_project);
 if m.id is null or m.role not in ('director','supervisor') then raise exception 'Access denied';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'created_at',t.created_at,'steps',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'sequence',s.sequence,'title',s.title,'description',s.description,'owner_id',s.owner_id,'reviewer_id',s.reviewer_id,'duration_days',s.duration_days) order by s.sequence) from sm_private.workflow_steps s where s.template_id=t.id),'[]'::jsonb)) order by t.updated_at desc) from sm_private.workflow_templates t where t.project_id=p_project),'[]'::jsonb);
end;
$$;

create or replace function public.sm_workflow_save(p_project uuid,p_id uuid,p_title text,p_description text,p_steps jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.sm_members; tid uuid; x jsonb; n integer:=0; owner uuid; reviewer uuid; seq integer;
begin
 m:=sm_private.member(p_project);
 if m.id is null or m.role not in ('director','supervisor') then raise exception 'Access denied';end if;
 if length(trim(p_title)) not between 1 and 160 or jsonb_typeof(p_steps)<>'array' or jsonb_array_length(p_steps) not between 1 and 30 then raise exception 'Invalid workflow';end if;
 if p_id is null then
  insert into sm_private.workflow_templates(project_id,title,description,creator_id) values(p_project,trim(p_title),left(coalesce(p_description,''),2000),m.id) returning id into tid;
 else
  select id into tid from sm_private.workflow_templates where id=p_id and project_id=p_project for update;
  if tid is null then raise exception 'Workflow unavailable';end if;
  if exists(select 1 from sm_private.workflow_runs where template_id=tid) then raise exception 'برای حفظ سوابق، قالب فعال‌شده را ویرایش نکنید؛ یک قالب تازه بسازید.';end if;
  update sm_private.workflow_templates set title=trim(p_title),description=left(coalesce(p_description,''),2000),updated_at=now() where id=tid;
  delete from sm_private.workflow_steps where template_id=tid;
 end if;
 for x in select value from jsonb_array_elements(p_steps) loop
  n:=n+1;seq:=coalesce((x->>'sequence')::integer,n);owner:=nullif(x->>'owner_id','')::uuid;reviewer:=nullif(x->>'reviewer_id','')::uuid;
  if seq<>n or length(trim(coalesce(x->>'title',''))) not between 1 and 160 or coalesce((x->>'duration_days')::integer,0) not between 1 and 365 then raise exception 'Invalid workflow step';end if;
  if not exists(select 1 from public.sm_members where id=owner and project_id=p_project and active and not external and (m.role='director' or role<>'director')) then raise exception 'Invalid step owner';end if;
  if reviewer is not null and not exists(select 1 from public.sm_members where id=reviewer and project_id=p_project and active and role in ('director','supervisor')) then raise exception 'Invalid step reviewer';end if;
  insert into sm_private.workflow_steps(template_id,sequence,title,description,owner_id,reviewer_id,duration_days) values(tid,seq,trim(x->>'title'),left(coalesce(x->>'description',''),4000),owner,reviewer,(x->>'duration_days')::smallint);
 end loop;
 return tid;
end;
$$;

create or replace function public.sm_workflow_delete(p_template uuid)
returns void language plpgsql security definer set search_path='' as $$
declare t sm_private.workflow_templates;m public.sm_members;
begin
 select * into t from sm_private.workflow_templates where id=p_template for update;
 m:=sm_private.member(t.project_id);
 if t.id is null or m.id is null or m.role not in ('director','supervisor') then raise exception 'Access denied';end if;
 if exists(select 1 from sm_private.workflow_runs where template_id=t.id) then raise exception 'قالب فعال‌شده برای حفظ سوابق حذف نمی‌شود.';end if;
 delete from sm_private.workflow_templates where id=t.id;
end;
$$;

create or replace function public.sm_workflow_activate(p_template uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare t sm_private.workflow_templates;m public.sm_members;s sm_private.workflow_steps;r uuid;tid uuid;first_step boolean:=true;recipient uuid;
begin
 select * into t from sm_private.workflow_templates where id=p_template for update;
 m:=sm_private.member(t.project_id);
 if t.id is null or m.id is null or m.role not in ('director','supervisor') then raise exception 'Access denied';end if;
 insert into sm_private.workflow_runs(template_id,project_id,activated_by) values(t.id,t.project_id,m.id) returning id into r;
 for s in select * from sm_private.workflow_steps where template_id=t.id order by sequence loop
  insert into public.sm_tasks(project_id,title,description,owner_id,reviewer_id,creator_id,due)
  values(t.project_id,t.title||' · '||s.title,case when s.sequence=1 then concat_ws(E'\n\n',nullif(t.description,''),nullif(s.description,'')) else concat_ws(E'\n\n',nullif(t.description,''),nullif(s.description,''),'این مرحله پس از پایان مرحلهٔ قبل فعال می‌شود.') end,s.owner_id,s.reviewer_id,m.id,case when first_step then (now() at time zone 'Asia/Tehran')::date+s.duration_days else null end)
  returning id into tid;
  insert into sm_private.workflow_run_steps(run_id,step_id,task_id,sequence,duration_days,state,activated_at) values(r,s.id,tid,s.sequence,s.duration_days,case when first_step then 'active' else 'blocked' end,case when first_step then now() else null end);
  insert into public.sm_events(task_id,project_id,actor_id,kind,text) values(tid,t.project_id,m.id,'created',case when first_step then 'مرحلهٔ آغازین فرآیند فعال شد.' else 'مرحله در انتظار پایان مرحلهٔ قبل است.' end);
  for recipient in select distinct x from unnest(array[s.owner_id,s.reviewer_id]) x where x is not null and x<>m.id loop
   insert into public.sm_notices(project_id,task_id,recipient_id,text) values(t.project_id,tid,recipient,'فرآیند جدید آغاز شد · مرحلهٔ '||s.sequence||': '||t.title||' · '||s.title||case when first_step then '' else ' · در انتظار مرحلهٔ قبل' end);
  end loop;
  first_step:=false;
 end loop;
 return r;
end;
$$;

create or replace function sm_private.workflow_step_completed(p_task uuid,p_finished_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare current_step sm_private.workflow_run_steps;next_step sm_private.workflow_run_steps;run_row sm_private.workflow_runs;next_task public.sm_tasks;recipient uuid;due_day date;
begin
 select * into current_step from sm_private.workflow_run_steps where task_id=p_task and state='active' for update;
 if current_step.task_id is null then return;end if;
 update sm_private.workflow_run_steps set state='done',completed_at=p_finished_at where run_id=current_step.run_id and step_id=current_step.step_id;
 select * into next_step from sm_private.workflow_run_steps where run_id=current_step.run_id and state='blocked' order by sequence limit 1 for update;
 if next_step.task_id is null then return;end if;
 due_day:=(p_finished_at at time zone 'Asia/Tehran')::date+next_step.duration_days;
 update sm_private.workflow_run_steps set state='active',activated_at=p_finished_at where run_id=next_step.run_id and step_id=next_step.step_id;
 update public.sm_tasks set due=due_day,revision=revision+1,updated_at=now() where id=next_step.task_id returning * into next_task;
 select * into run_row from sm_private.workflow_runs where id=next_step.run_id;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text) values(next_task.id,next_task.project_id,run_row.activated_by,'workflow','مرحلهٔ قبل پایان یافت؛ این مرحله فعال شد.');
 for recipient in select distinct x from unnest(array[next_task.owner_id,next_task.reviewer_id]) x where x is not null and x<>run_row.activated_by loop
  insert into public.sm_notices(project_id,task_id,recipient_id,text) values(next_task.project_id,next_task.id,recipient,'مرحلهٔ بعدی آمادهٔ انجام است: '||next_task.title);
 end loop;
end;
$$;

create or replace function sm_private.workflow_before_task_update()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('review','done') and old.status='open' and exists(select 1 from sm_private.workflow_run_steps where task_id=old.id and state='blocked') then raise exception 'این مرحله تا پایان مرحلهٔ قبل قابل انجام نیست.';end if;
 return new;
end;
$$;
create or replace function sm_private.workflow_after_task_update()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status is distinct from 'done' and new.status='done' then perform sm_private.workflow_step_completed(new.id,coalesce(new.approved_at,now()));end if;
 return new;
end;
$$;
drop trigger if exists sm_workflow_before_task_update on public.sm_tasks;
create trigger sm_workflow_before_task_update before update of status on public.sm_tasks for each row execute function sm_private.workflow_before_task_update();
drop trigger if exists sm_workflow_after_task_update on public.sm_tasks;
create trigger sm_workflow_after_task_update after update of status on public.sm_tasks for each row execute function sm_private.workflow_after_task_update();

revoke all on function public.sm_workflow_list(uuid),public.sm_workflow_save(uuid,uuid,text,text,jsonb),public.sm_workflow_delete(uuid),public.sm_workflow_activate(uuid) from public,anon;
grant execute on function public.sm_workflow_list(uuid),public.sm_workflow_save(uuid,uuid,text,text,jsonb),public.sm_workflow_delete(uuid),public.sm_workflow_activate(uuid) to authenticated;
revoke execute on function sm_private.workflow_step_completed(uuid,timestamptz),sm_private.workflow_before_task_update(),sm_private.workflow_after_task_update() from public,anon,authenticated;

commit;

begin;
create function public.sm_can_read_task(p_task uuid) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.sm_tasks t join public.sm_members m on m.project_id=t.project_id and m.user_id=auth.uid() and m.active where t.id=p_task and (m.role='director' or t.owner_id=m.id or m.id=any(t.collaborators)))
$$;
revoke execute on function public.sm_can_read_task(uuid) from public,anon;
grant execute on function public.sm_can_read_task(uuid) to authenticated;
alter policy sm_task_read on public.sm_tasks using(public.sm_can_read_task(id));
alter policy sm_event_read on public.sm_events using(public.sm_can_read_task(task_id));
alter policy sm_file_read on public.sm_files using(public.sm_can_read_task(task_id) and (ready or author_id=(sm_private.member(project_id)).id));
alter policy sm_trash_read on public.sm_task_trash using(public.sm_can_read_task(task_id));
alter policy sm_notice_read on public.sm_notices using(recipient_id=(sm_private.member(project_id)).id and public.sm_can_read_task(task_id));
alter policy sm_milestone_read on public.sm_milestones using(public.sm_has_access(project_id) and ((sm_private.member(project_id)).role='director' or owner_id=(sm_private.member(project_id)).id));
alter policy sm_milestone_history_read on public.sm_milestone_history using(exists(select 1 from public.sm_milestones m where m.id=milestone_id));
create or replace function public.sm_storage_read(path text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.sm_files f where f.object_path=path and public.sm_can_read_task(f.task_id) and (f.ready or f.author_id=(sm_private.member(f.project_id)).id))
$$;
create index if not exists sm_tasks_owner_access on public.sm_tasks(project_id,owner_id);
create index if not exists sm_tasks_collaborator_access on public.sm_tasks using gin(collaborators);
commit;

begin;
create or replace function public.sm_edit_task(p_task uuid,p_revision integer,p_title text,p_description text,p_due date) returns void language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks;m public.sm_members;before_task jsonb;r uuid;
begin
select * into t from public.sm_tasks where id=p_task for update;if not found then raise exception 'Task unavailable';end if;
m:=sm_private.member(t.project_id);if not public.sm_can_read_task(t.id) or m.id is null or (m.id<>t.creator_id and m.role<>'director') then raise exception 'Only creator or management may edit';end if;
if t.revision<>p_revision then raise exception 'Conflict: refresh and retry';end if;
if length(trim(p_title)) not between 1 and 200 or length(coalesce(p_description,''))>10000 then raise exception 'Invalid task details';end if;
before_task:=to_jsonb(t);
update public.sm_tasks set title=trim(p_title),description=coalesce(p_description,''),due=p_due,revision=revision+1,updated_at=now(),status='open',submitted_at=null,approved_at=null where id=t.id;
insert into public.sm_events(task_id,project_id,actor_id,kind,text,payload) values(t.id,t.project_id,m.id,'edit','عنوان، شرح یا مهلت ویرایش شد؛ کار برای ادامه باز است.',jsonb_build_object('before',before_task,'after',(select to_jsonb(x) from public.sm_tasks x where x.id=t.id)));
for r in select distinct x from unnest(array[t.owner_id,t.reviewer_id]||t.collaborators) x where x<>m.id loop
insert into public.sm_notices(project_id,task_id,recipient_id,text) values(t.project_id,t.id,r,'ویرایش کار: '||trim(p_title));end loop;
end$$;
revoke execute on function public.sm_edit_task(uuid,integer,text,text,date) from public,anon;
grant execute on function public.sm_edit_task(uuid,integer,text,text,date) to authenticated;
commit;

begin;
create or replace function public.sm_task_action(p_task uuid,p_revision integer,p_action text,p_text text default '',p_owner uuid default null,p_collaborators uuid[] default null,p_due date default null) returns void language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks; m public.sm_members; manage boolean; r uuid; current_files uuid[]; before_task jsonb;
begin
 select * into t from public.sm_tasks where id=p_task for update;
 if not found then raise exception 'Task unavailable'; end if;
 m:=sm_private.member(t.project_id);if m.id is null then raise exception 'Access denied';end if;
 if t.revision<>p_revision then raise exception 'Conflict: refresh and retry';end if;
 manage:=sm_private.can_manage(t,m);before_task:=to_jsonb(t);
 if p_action='report' then
  if m.id<>t.owner_id and not(m.id=any(t.collaborators)) and not manage then raise exception 'Access denied';end if;
  if length(trim(p_text)) not between 1 and 4000 then raise exception 'Report required';end if;
 elsif p_action='request' then
  if m.role<>'member' or t.status='done' or (m.id<>t.owner_id and not(m.id=any(t.collaborators))) then raise exception 'Access denied';end if;
  if length(trim(p_text)) not between 1 and 2000 then raise exception 'Request required';end if;
 elsif p_action='submit' then
  if t.status not in ('open') or (m.id<>t.owner_id and not manage) then raise exception 'Cannot submit';end if;
  if not exists(select 1 from public.sm_members where id=t.reviewer_id and active and role in ('director','supervisor')) then raise exception 'Reviewer unavailable';end if;
  select coalesce(array_agg(id order by created_at),'{}') into current_files from public.sm_files where task_id=t.id and ready;
  update public.sm_tasks set status='review',submitted_at=now(),submitted_files=current_files where id=t.id;
 elsif p_action='approve' then
  if not manage or m.id<>t.reviewer_id or t.status<>'review' then raise exception 'Only assigning reviewer may approve';end if;
  update public.sm_tasks set status='done',approved_at=now(),final_files=submitted_files where id=t.id;
 elsif p_action='correct' then
  if not manage or m.id<>t.reviewer_id or t.status<>'review' or length(trim(p_text)) not between 1 and 4000 then raise exception 'Reviewer and feedback required';end if;
  update public.sm_tasks set status='open',submitted_at=null where id=t.id;
 elsif p_action='reopen' then
  if t.status='done' then
   if not manage or m.id<>t.reviewer_id then raise exception 'Only reviewer may reopen';end if;
  elsif t.status<>'review' or (m.id<>t.owner_id and not manage) then raise exception 'Cannot reopen';end if;
  update public.sm_tasks set status='open',submitted_at=null,approved_at=null where id=t.id;
 elsif p_action='assign' then
  if not manage or t.status='done' then raise exception 'Cannot assign';end if;
  if not exists(select 1 from public.sm_members where id=p_owner and project_id=t.project_id and active and (m.role='director' or role<>'director')) then raise exception 'Invalid owner';end if;
  if exists(select 1 from unnest(coalesce(p_collaborators,'{}')) c where not exists(select 1 from public.sm_members where id=c and project_id=t.project_id and active and (m.role='director' or role<>'director'))) then raise exception 'Invalid collaborator';end if;
  update public.sm_tasks set owner_id=p_owner,collaborators=array(select distinct x from unnest(coalesce(p_collaborators,'{}')) x where x<>p_owner),reviewer_id=case when p_owner<>t.owner_id then m.id else reviewer_id end,status='open',submitted_at=null where id=t.id;
 elsif p_action='edit' then
  if not manage or t.status='done' or length(trim(p_text)) not between 1 and 200 then raise exception 'Cannot edit';end if;
  update public.sm_tasks set title=trim(p_text),due=p_due where id=t.id;
 else raise exception 'Unknown action';end if;
 update public.sm_tasks set revision=revision+1,updated_at=now() where id=t.id;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text,payload) values(t.id,t.project_id,m.id,p_action,left(p_text,4000),jsonb_build_object('before',before_task,'after',(select to_jsonb(x) from public.sm_tasks x where x.id=t.id)));
 for r in select distinct x from unnest(array[t.owner_id,t.reviewer_id]||t.collaborators||case when p_action='assign' then array[p_owner]||coalesce(p_collaborators,'{}') else '{}'::uuid[] end) x where x is not null and x<>m.id loop
  insert into public.sm_notices(project_id,task_id,recipient_id,text) values(t.project_id,t.id,r,case when p_action='report' then 'گزارش یا بازخورد جدید: ' when p_action='approve' then 'تأیید نهایی: ' when p_action='submit' then 'منتظر بررسی: ' else 'به‌روزرسانی کار: ' end||t.title);
 end loop;
end $$;

commit;

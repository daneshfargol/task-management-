create or replace function public.sm_edit_task_with_review(p_task uuid,p_revision integer,p_title text,p_description text,p_due date,p_reviewer uuid,p_owner uuid default null,p_collaborators uuid[] default null)
returns void language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks; m public.sm_members; is_manager boolean; changed boolean;
begin
 select * into t from public.sm_tasks where id=p_task for update;
 if not found then raise exception 'Task unavailable';end if;
 m:=sm_private.member(t.project_id);
 if m.id is null then raise exception 'Access denied';end if;
 is_manager:=m.role in ('director','supervisor');
 changed:=p_reviewer is distinct from t.reviewer_id;
 if changed and not(is_manager or (m.id=t.creator_id and m.id=t.owner_id)) then raise exception 'Only management or self-task creator may change reviewer';end if;
 if p_reviewer is not null and not exists(select 1 from public.sm_members where id=p_reviewer and project_id=t.project_id and active and not external and role in ('director','supervisor')) then raise exception 'Invalid reviewer';end if;
 if is_manager then
 perform public.sm_edit_task_full(p_task,p_revision,p_title,p_description,p_due,coalesce(p_owner,t.owner_id),coalesce(p_collaborators,t.collaborators));
 else
 perform public.sm_edit_task(p_task,p_revision,p_title,p_description,p_due);
 end if;
 if (select reviewer_id from public.sm_tasks where id=t.id) is distinct from p_reviewer then
 update public.sm_tasks set reviewer_id=p_reviewer,revision=revision+1,updated_at=now() where id=t.id;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text,payload) values(t.id,t.project_id,m.id,'edit','تغییر تأییدکنندهٔ کار',jsonb_build_object('before',to_jsonb(t),'after',(select to_jsonb(x) from public.sm_tasks x where x.id=t.id)));
 insert into public.sm_notices(project_id,task_id,recipient_id,text) select t.project_id,t.id,x,'تغییر تأییدکننده: '||p_title from (select distinct unnest(array[t.owner_id,t.reviewer_id,p_reviewer]||t.collaborators) x) a where x is not null and x<>m.id;
 end if;
end $$;
revoke all on function public.sm_edit_task_with_review(uuid,integer,text,text,date,uuid,uuid,uuid[]) from public,anon;
grant execute on function public.sm_edit_task_with_review(uuid,integer,text,text,date,uuid,uuid,uuid[]) to authenticated;

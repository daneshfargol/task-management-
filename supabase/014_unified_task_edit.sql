begin;
create function public.sm_edit_task_full(p_task uuid,p_revision integer,p_title text,p_description text,p_due date,p_owner uuid,p_collaborators uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks;m public.sm_members;
begin
select * into t from public.sm_tasks where id=p_task for update;if not found then raise exception 'Task unavailable';end if;
m:=sm_private.member(t.project_id);
if m.id is null or m.role<>'director' then raise exception 'Management only';end if;
perform public.sm_edit_task(p_task,p_revision,p_title,p_description,p_due);
if p_owner is distinct from t.owner_id or not(coalesce(p_collaborators,'{}') @> t.collaborators and coalesce(p_collaborators,'{}') <@ t.collaborators) then
perform public.sm_task_action(p_task,p_revision+1,'assign','',p_owner,p_collaborators,null);
end if;
end $$;
revoke execute on function public.sm_edit_task_full(uuid,integer,text,text,date,uuid,uuid[]) from public,anon;
grant execute on function public.sm_edit_task_full(uuid,integer,text,text,date,uuid,uuid[]) to authenticated;
commit;

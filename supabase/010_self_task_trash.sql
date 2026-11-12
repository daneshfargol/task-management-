begin;
create or replace function public.sm_trash_task(p_task uuid,p_revision integer,p_restore boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks;m public.sm_members;
begin
 select * into t from public.sm_tasks where id=p_task for update;
 if not found then raise exception 'Task unavailable';end if;
 m:=sm_private.member(t.project_id);
 if m.id is null or (m.role<>'director' and (t.creator_id is distinct from m.id or t.owner_id is distinct from m.id)) then raise exception 'Only management or self-task creator may delete';end if;
 if t.revision<>p_revision then raise exception 'Conflict: refresh and retry';end if;
 if p_restore then delete from public.sm_task_trash where task_id=t.id;
 else insert into public.sm_task_trash(task_id,project_id,deleted_by) values(t.id,t.project_id,m.id) on conflict do nothing;end if;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text) values(t.id,t.project_id,m.id,case when p_restore then 'restore' else 'trash' end,case when p_restore then 'کار بازیابی شد' else 'کار به حذف‌شده‌ها منتقل شد' end);
end $$;
commit;

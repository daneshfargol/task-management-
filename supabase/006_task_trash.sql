begin;
create table public.sm_task_trash(task_id uuid primary key references public.sm_tasks(id),project_id uuid not null references public.sm_projects(id),deleted_by uuid not null references public.sm_members(id),deleted_at timestamptz not null default now());
alter table public.sm_task_trash enable row level security;
revoke all on public.sm_task_trash from anon,authenticated;
grant select on public.sm_task_trash to authenticated;
create policy sm_trash_read on public.sm_task_trash for select to authenticated using(public.sm_has_access(project_id));
create function public.sm_trash_task(p_task uuid,p_revision integer,p_restore boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks;m public.sm_members;
begin
 select * into t from public.sm_tasks where id=p_task for update;
 if not found then raise exception 'Task unavailable';end if;
 m:=sm_private.member(t.project_id);
 if m.id is null or m.role<>'director' then raise exception 'Management only';end if;
 if t.revision<>p_revision then raise exception 'Conflict: refresh and retry';end if;
 if p_restore then delete from public.sm_task_trash where task_id=t.id;
 else insert into public.sm_task_trash(task_id,project_id,deleted_by) values(t.id,t.project_id,m.id) on conflict do nothing;end if;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text) values(t.id,t.project_id,m.id,case when p_restore then 'restore' else 'trash' end,case when p_restore then 'کار بازیابی شد' else 'کار به حذف‌شده‌ها منتقل شد' end);
end $$;
create function sm_private.guard_trashed_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.sm_task_trash where task_id=old.id) then raise exception 'Task is deleted; restore it first';end if;
 return new;
end $$;
create trigger sm_task_trash_guard before update on public.sm_tasks for each row execute function sm_private.guard_trashed_task();
revoke execute on function public.sm_trash_task(uuid,integer,boolean) from public,anon;
grant execute on function public.sm_trash_task(uuid,integer,boolean) to authenticated;
revoke execute on function sm_private.guard_trashed_task() from public,anon,authenticated;
commit;

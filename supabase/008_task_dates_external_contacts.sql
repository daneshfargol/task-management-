begin;
alter table public.sm_personal_tasks add column starts_on date;
alter table public.sm_personal_tasks add constraint personal_task_date_order check(starts_on is null or due is null or starts_on<=due);
grant insert(starts_on),update(starts_on) on public.sm_personal_tasks to authenticated;
alter table public.sm_members add column external boolean not null default false;
create function sm_private.guard_external_member() returns trigger language plpgsql set search_path='' as $$begin if new.external and (new.user_id is not null or new.email is not null or new.role<>'member') then raise exception 'External contacts cannot have login credentials or management roles';end if;return new;end$$;
create trigger sm_external_member_guard before insert or update on public.sm_members for each row execute function sm_private.guard_external_member();
create function public.sm_save_external_member(p_project uuid,p_id uuid,p_name text,p_title text,p_active boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.sm_members;old public.sm_members;result uuid;
begin
actor:=sm_private.member(p_project);if actor.id is null or actor.role<>'director' then raise exception 'Management only';end if;
if length(trim(p_name)) not between 1 and 100 or length(trim(p_title)) not between 1 and 100 then raise exception 'Name and title required';end if;
if p_id is null then insert into public.sm_members(project_id,name,title,role,active,external) values(p_project,trim(p_name),trim(p_title),'member',p_active,true) returning id into result;
else select * into old from public.sm_members where id=p_id and project_id=p_project for update;if not found or not old.external or old.user_id is not null then raise exception 'External contact unavailable';end if;
update public.sm_members set name=trim(p_name),title=trim(p_title),active=p_active where id=old.id returning id into result;end if;
return result;
end$$;
revoke execute on function sm_private.guard_external_member() from public,anon,authenticated;
revoke execute on function public.sm_save_external_member(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.sm_save_external_member(uuid,uuid,text,text,boolean) to authenticated;
commit;

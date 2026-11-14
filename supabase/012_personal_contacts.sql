begin;
alter table public.sm_personal_projects add column contact_names text[] not null default '{}';
alter table public.sm_personal_tasks add column responsible_name text not null default '' check(length(responsible_name)<=120);
grant insert(responsible_name),update(responsible_name) on public.sm_personal_tasks to authenticated;
create function public.sm_personal_add_contact(p_project uuid,p_name text) returns text[] language plpgsql security definer set search_path='' as $$
declare names text[];
begin
if not sm_private.personal_project(p_project) then raise exception 'Personal project unavailable';end if;
if length(trim(p_name)) not between 1 and 120 then raise exception 'Invalid contact name';end if;
update public.sm_personal_projects set contact_names=case when trim(p_name)=any(contact_names) then contact_names else array_append(contact_names,trim(p_name)) end where id=p_project returning contact_names into names;
return names;
end $$;
revoke execute on function public.sm_personal_add_contact(uuid,text) from public,anon;
grant execute on function public.sm_personal_add_contact(uuid,text) to authenticated;
commit;

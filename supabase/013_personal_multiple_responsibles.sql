begin;
alter table public.sm_personal_tasks add column responsible_names text[] not null default '{}';
-- Preserve the current single-name selections, including the revision guard.
update public.sm_personal_tasks set responsible_names=array[responsible_name],revision=revision+1 where responsible_name<>'';
grant insert(responsible_names),update(responsible_names) on public.sm_personal_tasks to authenticated;
commit;

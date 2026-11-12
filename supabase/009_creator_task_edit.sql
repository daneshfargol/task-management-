begin;
create function public.sm_edit_task(p_task uuid,p_revision integer,p_title text,p_description text,p_due date) returns void language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks;m public.sm_members;before_task jsonb;r uuid;
begin
select * into t from public.sm_tasks where id=p_task for update;if not found then raise exception 'Task unavailable';end if;
m:=sm_private.member(t.project_id);if m.id is null or (m.id<>t.creator_id and m.role<>'director') then raise exception 'Only creator or management may edit';end if;
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

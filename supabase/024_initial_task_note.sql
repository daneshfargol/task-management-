create function public.sm_create_task_with_note(p_project uuid,p_title text,p_description text,p_owner uuid,p_reviewer uuid,p_due date,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid; actor uuid; note text:=trim(coalesce(p_note,''));
begin
 if length(note)>4000 then raise exception 'Note too long';end if;
 tid:=public.sm_create_task(p_project,p_title,p_description,p_owner,p_reviewer,p_due);
 if note<>'' then
 select creator_id into actor from public.sm_tasks where id=tid;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text) values(tid,p_project,actor,'report',note);
 end if;
 return tid;
end $$;
revoke all on function public.sm_create_task_with_note(uuid,text,text,uuid,uuid,date,text) from public,anon;
grant execute on function public.sm_create_task_with_note(uuid,text,text,uuid,uuid,date,text) to authenticated;

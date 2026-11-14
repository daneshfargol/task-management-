begin;
insert into auth.users(id,email,email_confirmed_at) values('60000000-0000-4000-8000-000000000001','manager@trash-test.invalid',now()),('60000000-0000-4000-8000-000000000002','member@trash-test.invalid',now());
insert into public.sm_projects(id,slug,name) values('60000000-0000-4000-8000-000000000003','trash-test-isolated','TEST');
insert into public.sm_members(id,project_id,user_id,name,title,role) values('60000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','TEST manager','TEST','director'),('60000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000002','TEST member','TEST','member');
set local role authenticated;
do $$declare t uuid;blocked boolean;begin
perform set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
t:=public.sm_create_task('60000000-0000-4000-8000-000000000003','BEFORE','','60000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000004',null);
perform public.sm_edit_task_full(t,0,'AFTER','description','2026-12-01','60000000-0000-4000-8000-000000000005',array['60000000-0000-4000-8000-000000000004'::uuid]);
if not exists(select 1 from public.sm_tasks where id=t and title='AFTER' and revision=2 and owner_id='60000000-0000-4000-8000-000000000005' and cardinality(collaborators)=1) then raise exception 'Unified save failed';end if;
blocked:=false;begin perform public.sm_edit_task_full(t,2,'MUST ROLLBACK','',null,'60000000-0000-4000-8000-000000000099','{}');exception when others then blocked:=true;end;if not blocked then raise exception 'Invalid assignment accepted';end if;
if not exists(select 1 from public.sm_tasks where id=t and title='AFTER' and revision=2) then raise exception 'Partial save occurred';end if;
perform set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
blocked:=false;begin perform public.sm_edit_task_full(t,2,'ATTACK','',null,'60000000-0000-4000-8000-000000000005','{}');exception when others then blocked:=true;end;if not blocked then raise exception 'Member assigned task';end if;
end $$;
rollback;
select 'PASS: details and assignment saved together; invalid assignment rolls back everything; member denied; test fixtures rolled back' as result;

begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000001','director@samandis-test.invalid',now()),
 ('10000000-0000-4000-8000-000000000002','supervisor@samandis-test.invalid',now()),
 ('10000000-0000-4000-8000-000000000003','member@samandis-test.invalid',now());
update public.sm_members set user_id='10000000-0000-4000-8000-000000000001' where name='رضا افشار';
update public.sm_members set user_id='10000000-0000-4000-8000-000000000002' where name='احسان شاهین زاده';
update public.sm_members set user_id='10000000-0000-4000-8000-000000000003' where name='فرگل دانش';
set local role authenticated;
do $$
declare p uuid;d uuid;s uuid;m uuid;t uuid;pm_task uuid;f public.sm_files;v integer;blocked boolean;cnt integer;
begin
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
 select id into p from public.sm_projects where slug='darayi';
 select id into d from public.sm_members where project_id=p and name='رضا افشار';
 select id into s from public.sm_members where project_id=p and name='احسان شاهین زاده';
 select id into m from public.sm_members where project_id=p and name='فرگل دانش';
 if p is null then raise exception 'TEST: member cannot see project';end if;
 t:=public.sm_create_task(p,'TEST rollback','integration test',m,d,null);
 pm_task:=public.sm_create_task(p,'TEST protected','integration test',d,d,null);
 blocked:=false;begin update public.sm_tasks set title='bypass' where id=t;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST: direct write allowed';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
 blocked:=false;begin perform public.sm_task_action(t,0,'assign','',s,'{}',null);exception when others then blocked:=true;end;
 if not blocked then raise exception 'TEST: member assigned task';end if;
 f:=public.sm_reserve_file(t,0,'test.txt',5,'text/plain','test');
 insert into storage.objects(bucket_id,name,metadata) values('samandis-files',f.object_path,'{"size":5}');
 perform public.sm_finalize_file(f.id);
 perform public.sm_task_action(t,1,'report','work report');
 perform public.sm_task_action(t,2,'submit');
 if (select status from public.sm_tasks where id=t)<>'review' then raise exception 'TEST: submit did not remain review';end if;
 blocked:=false;begin perform public.sm_task_action(t,3,'approve');exception when others then blocked:=true;end;
 if not blocked then raise exception 'TEST: owner approved';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
 blocked:=false;begin perform public.sm_task_action(t,3,'approve');exception when others then blocked:=true;end;
 if not blocked then raise exception 'TEST: wrong reviewer approved';end if;
 perform public.sm_task_action(pm_task,0,'report','equal management access');
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
 blocked:=false;begin perform public.sm_task_action(t,0,'approve');exception when others then blocked:=true;end;
 if not blocked then raise exception 'TEST: stale revision accepted';end if;
 perform public.sm_task_action(t,3,'approve');
 if (select final_files from public.sm_tasks where id=t)<>array[f.id] then raise exception 'TEST: final file snapshot missing';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
 blocked:=false;begin perform public.sm_reserve_file(t,4,'late.txt',5,'text/plain','late');exception when others then blocked:=true;end;
 if not blocked then raise exception 'TEST: upload into closed task';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
 perform public.sm_task_action(t,4,'reopen');
 if not exists(select 1 from public.sm_events where task_id=t and kind='approve') then raise exception 'TEST: approval history lost';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
 select count(*) into cnt from public.sm_tasks;if cnt<>0 then raise exception 'TEST: outsider reads tasks';end if;
 blocked:=false;begin perform public.sm_create_task(p,'outsider','',m,d,null);exception when others then blocked:=true;end;
 if not blocked then raise exception 'TEST: outsider created task';end if;
end $$;
reset role;
rollback;
select 'PASS: server permissions, stale-write rejection, private uploads, correct-reviewer approval, immutable final files, history and outsider denial; all fixtures rolled back' as result;

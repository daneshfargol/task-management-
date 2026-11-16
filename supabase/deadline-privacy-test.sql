begin;
insert into auth.users(id,email,email_confirmed_at) values('60000000-0000-4000-8000-000000000001','manager@trash-test.invalid',now()),('60000000-0000-4000-8000-000000000002','member@trash-test.invalid',now());
insert into public.sm_projects(id,slug,name) values('60000000-0000-4000-8000-000000000003','trash-test-isolated','TEST');
insert into public.sm_members(id,project_id,user_id,name,title,role) values('60000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','TEST manager','TEST','director'),('60000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000002','TEST member','TEST','member');
update sm_private.push_config set enabled=false where singleton;
insert into auth.users(id,email,email_confirmed_at) values('60000000-0000-4000-8000-000000000007','collaborator@test.invalid',now());
insert into public.sm_members(id,project_id,user_id,name,title,role) values('60000000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000007','TEST collaborator','TEST','member');
insert into public.sm_tasks(id,project_id,title,owner_id,reviewer_id,creator_id,due,collaborators) values
('60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000003','VISIBLE','60000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000004','2098-09-12',array['60000000-0000-4000-8000-000000000006'::uuid]),
('60000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000003','PRIVATE','60000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000004',null,'{}');
insert into public.sm_events(task_id,project_id,actor_id,kind,text) values('60000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000004','report','PRIVATE EVENT');
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
do $$begin if (select count(*) from public.sm_tasks where project_id='60000000-0000-4000-8000-000000000003')<>1 then raise exception 'Owner privacy failed';end if;if exists(select 1 from public.sm_events where task_id='60000000-0000-4000-8000-000000000011') then raise exception 'Other task history leaked';end if;end$$;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000007',true);
do $$begin if (select count(*) from public.sm_tasks where project_id='60000000-0000-4000-8000-000000000003')<>1 then raise exception 'Collaborator access failed';end if;end$$;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
do $$begin if (select count(*) from public.sm_tasks where project_id='60000000-0000-4000-8000-000000000003')<>2 then raise exception 'Management access failed';end if;end$$;
reset role;
select sm_private.send_deadline_reminders('2098-09-10T04:29:00Z');
do $$begin if exists(select 1 from sm_private.deadline_reminders where task_id='60000000-0000-4000-8000-000000000010') then raise exception 'Reminder before Tehran 08';end if;end$$;
select sm_private.send_deadline_reminders('2098-09-10T04:30:00Z');
select sm_private.send_deadline_reminders('2098-09-10T05:00:00Z');
select sm_private.send_deadline_reminders('2098-09-11T04:30:00Z');
select sm_private.send_deadline_reminders('2098-09-12T04:30:00Z');
do $$begin if (select count(*) from sm_private.deadline_reminders where task_id='60000000-0000-4000-8000-000000000010')<>6 then raise exception 'Expected three reminders each for owner and collaborator without duplicates';end if;if (select count(*) from public.sm_notices where task_id='60000000-0000-4000-8000-000000000010' and reminder_days in(0,1,2))<>6 then raise exception 'Notices missing';end if;end$$;
rollback;
select 'PASS: owner/collaborator access, other-task history denied, management overview, Tehran 08:00, all three stages, deduplication; fixtures rolled back' as result;

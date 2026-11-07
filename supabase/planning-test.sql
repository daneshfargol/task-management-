begin;
insert into auth.users(id,email,email_confirmed_at) values('20000000-0000-4000-8000-000000000001','planning-director@test.invalid',now()),('20000000-0000-4000-8000-000000000002','planning-member@test.invalid',now());
update public.sm_members set user_id='20000000-0000-4000-8000-000000000001' where name='رضا افشار';
update public.sm_members set user_id='20000000-0000-4000-8000-000000000002' where name='فرگل دانش';
set local role authenticated;
do $$
declare p uuid;d uuid;m uuid;mid uuid;tid uuid;blocked boolean;
begin
perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select id into p from public.sm_projects where slug='darayi';select id into d from public.sm_members where project_id=p and name='رضا افشار';select id into m from public.sm_members where project_id=p and name='فرگل دانش';
mid:=public.sm_save_milestone(p,null,0,'test delivery','',m,current_date,current_date+1,'planned');
perform public.sm_save_milestone(p,mid,0,'test delivery updated','',m,current_date,current_date+2,'active');
blocked:=false;begin perform public.sm_save_milestone(p,mid,0,'stale','',m,current_date,current_date+1,'planned');exception when others then blocked:=true;end;if not blocked then raise exception 'Stale milestone accepted';end if;
if (select count(*) from public.sm_milestone_history where milestone_id=mid)<>2 then raise exception 'History lost';end if;
perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
blocked:=false;begin perform public.sm_save_milestone(p,null,0,'unauthorized','',m,current_date,current_date+1,'planned');exception when others then blocked:=true;end;if not blocked then raise exception 'Member edited plan';end if;
tid:=public.sm_create_task(p,'test worklog','',m,d,null);
perform public.sm_log_work(tid,current_date-1,23,'test own work');
blocked:=false;begin perform public.sm_log_work(tid,current_date-1,2,'excess');exception when others then blocked:=true;end;if not blocked then raise exception 'Daily limit bypassed';end if;
perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
blocked:=false;begin perform public.sm_log_work(tid,current_date-1,1,'other person');exception when others then blocked:=true;end;if not blocked then raise exception 'Logged work for another person';end if;
perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000099',true);
if exists(select 1 from public.sm_milestones) or exists(select 1 from public.sm_worklogs) then raise exception 'Outsider reads data';end if;
end $$;
reset role;
rollback;
select 'PASS: management-only planning, history, stale-write protection, own-work logging, daily hour limit, outsider denial; fixtures rolled back' as result;

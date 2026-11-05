-- Samandis shared workspace. No client may directly change task or access records.
begin;
create table public.sm_projects (
 id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
 created_at timestamptz not null default now()
);
create table public.sm_members (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.sm_projects(id),
 user_id uuid references auth.users(id), email text, name text not null, title text not null,
 role text not null check(role in ('director','supervisor','member')), active boolean not null default true,
 unique(project_id,user_id), unique(project_id,email), check(email is null or email=lower(trim(email)))
);
create table public.sm_tasks (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.sm_projects(id),
 title text not null check(length(trim(title)) between 1 and 200), description text not null default '',
 owner_id uuid not null references public.sm_members(id), reviewer_id uuid not null references public.sm_members(id),
 creator_id uuid not null references public.sm_members(id), collaborators uuid[] not null default '{}',
 status text not null default 'open' check(status in ('open','review','done')), due date,
 revision integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 submitted_at timestamptz, approved_at timestamptz, submitted_files uuid[] not null default '{}', final_files uuid[] not null default '{}'
);
create table public.sm_events (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.sm_tasks(id),
 project_id uuid not null references public.sm_projects(id), actor_id uuid not null references public.sm_members(id),
 kind text not null, text text not null default '', payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.sm_files (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.sm_tasks(id),
 project_id uuid not null references public.sm_projects(id), author_id uuid not null references public.sm_members(id),
 name text not null, label text not null default '', size bigint not null check(size between 1 and 20971520),
 content_type text not null default 'application/octet-stream', object_path text unique not null,
 ready boolean not null default false, base_revision integer not null, created_at timestamptz not null default now()
);
create table public.sm_notices (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.sm_projects(id),
 task_id uuid not null references public.sm_tasks(id), recipient_id uuid not null references public.sm_members(id),
 text text not null, read boolean not null default false, created_at timestamptz not null default now()
);
create index on public.sm_members(user_id,project_id);
create index on public.sm_tasks(project_id,updated_at desc);
create index on public.sm_events(task_id,created_at);
create index on public.sm_files(task_id,created_at);
create index on public.sm_notices(recipient_id,created_at desc);
create schema if not exists sm_private;
revoke all on schema sm_private from public;
create function sm_private.member(p uuid) returns public.sm_members language sql stable security definer set search_path='' as $$
 select m from public.sm_members m where m.project_id=p and m.user_id=auth.uid() and m.active
$$;
create function sm_private.can_manage(t public.sm_tasks,m public.sm_members) returns boolean language sql stable set search_path='' as $$
 select m.role='director' or (m.role='supervisor' and not exists(select 1 from public.sm_members x where x.id=t.owner_id and x.role='director'))
$$;
create function public.sm_has_access(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sm_members where project_id=p and user_id=auth.uid() and active)
$$;
alter table public.sm_projects enable row level security;
alter table public.sm_members enable row level security;
alter table public.sm_tasks enable row level security;
alter table public.sm_events enable row level security;
alter table public.sm_files enable row level security;
alter table public.sm_notices enable row level security;
create policy sm_project_read on public.sm_projects for select to authenticated using(public.sm_has_access(id));
create policy sm_member_read on public.sm_members for select to authenticated using(public.sm_has_access(project_id));
create policy sm_task_read on public.sm_tasks for select to authenticated using(public.sm_has_access(project_id));
create policy sm_event_read on public.sm_events for select to authenticated using(public.sm_has_access(project_id));
create policy sm_file_read on public.sm_files for select to authenticated using(public.sm_has_access(project_id) and (ready or author_id=(sm_private.member(project_id)).id));
create policy sm_notice_read on public.sm_notices for select to authenticated using(recipient_id=(sm_private.member(project_id)).id);
revoke all on public.sm_projects,public.sm_members,public.sm_tasks,public.sm_events,public.sm_files,public.sm_notices from anon,authenticated;
grant select on public.sm_projects,public.sm_members,public.sm_tasks,public.sm_events,public.sm_files,public.sm_notices to authenticated;
-- Only a verified Supabase email may claim an administrator-provisioned membership.
create function public.sm_claim_membership() returns void language plpgsql security definer set search_path='' as $$
declare e text;
begin
 select lower(email) into e from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if e is null then raise exception 'Verified sign-in required'; end if;
 update public.sm_members set user_id=auth.uid() where email=e and user_id is null and active;
end $$;
create function public.sm_create_task(p_project uuid,p_title text,p_description text,p_owner uuid,p_reviewer uuid,p_due date) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.sm_members; o public.sm_members; r public.sm_members; tid uuid;
begin
 m:=sm_private.member(p_project); if m.id is null then raise exception 'Access denied'; end if;
 select * into o from public.sm_members where id=p_owner and project_id=p_project and active;
 select * into r from public.sm_members where id=p_reviewer and project_id=p_project and active and role in ('director','supervisor');
 if o.id is null or r.id is null then raise exception 'Invalid owner or reviewer'; end if;
 if m.role='member' and p_owner<>m.id then raise exception 'Only own tasks may be created'; end if;
 if m.role='supervisor' and o.role='director' then raise exception 'Project manager is protected'; end if;
 if m.role<>'member' and p_reviewer<>m.id then raise exception 'Assigning manager must be reviewer'; end if;
 insert into public.sm_tasks(project_id,title,description,owner_id,reviewer_id,creator_id,due)
 values(p_project,trim(p_title),left(coalesce(p_description,''),10000),p_owner,p_reviewer,m.id,p_due) returning id into tid;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text) values(tid,p_project,m.id,'created','کار تعریف شد');
 insert into public.sm_notices(project_id,task_id,recipient_id,text) select p_project,tid,x,'کار جدید: '||p_title from (select distinct unnest(array[p_owner,p_reviewer]) x) a where x<>m.id;
 return tid;
end $$;
create function public.sm_task_action(p_task uuid,p_revision integer,p_action text,p_text text default '',p_owner uuid default null,p_collaborators uuid[] default null,p_due date default null) returns void language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks; m public.sm_members; manage boolean; r uuid; current_files uuid[]; before_task jsonb;
begin
 select * into t from public.sm_tasks where id=p_task for update;
 if not found then raise exception 'Task unavailable'; end if;
 m:=sm_private.member(t.project_id);if m.id is null then raise exception 'Access denied';end if;
 if t.revision<>p_revision then raise exception 'Conflict: refresh and retry';end if;
 manage:=sm_private.can_manage(t,m);before_task:=to_jsonb(t);
 if p_action='report' then
  if m.id<>t.owner_id and not(m.id=any(t.collaborators)) and not manage then raise exception 'Access denied';end if;
  if length(trim(p_text)) not between 1 and 4000 then raise exception 'Report required';end if;
 elsif p_action='request' then
  if m.role<>'member' or t.status='done' or (m.id<>t.owner_id and not(m.id=any(t.collaborators))) then raise exception 'Access denied';end if;
  if length(trim(p_text)) not between 1 and 2000 then raise exception 'Request required';end if;
 elsif p_action='submit' then
  if t.status not in ('open') or (m.id<>t.owner_id and not manage) then raise exception 'Cannot submit';end if;
  if not exists(select 1 from public.sm_members where id=t.reviewer_id and active and role in ('director','supervisor')) then raise exception 'Reviewer unavailable';end if;
  select coalesce(array_agg(id order by created_at),'{}') into current_files from public.sm_files where task_id=t.id and ready;
  update public.sm_tasks set status='review',submitted_at=now(),submitted_files=current_files where id=t.id;
 elsif p_action='approve' then
  if not manage or m.id<>t.reviewer_id or t.status<>'review' then raise exception 'Only assigning reviewer may approve';end if;
  update public.sm_tasks set status='done',approved_at=now(),final_files=submitted_files where id=t.id;
 elsif p_action='correct' then
  if not manage or m.id<>t.reviewer_id or t.status<>'review' or length(trim(p_text)) not between 1 and 4000 then raise exception 'Reviewer and feedback required';end if;
  update public.sm_tasks set status='open',submitted_at=null where id=t.id;
 elsif p_action='reopen' then
  if t.status='done' then
   if not manage or m.id<>t.reviewer_id then raise exception 'Only reviewer may reopen';end if;
  elsif t.status<>'review' or (m.id<>t.owner_id and not manage) then raise exception 'Cannot reopen';end if;
  update public.sm_tasks set status='open',submitted_at=null,approved_at=null where id=t.id;
 elsif p_action='assign' then
  if not manage or t.status='done' then raise exception 'Cannot assign';end if;
  if not exists(select 1 from public.sm_members where id=p_owner and project_id=t.project_id and active and (m.role='director' or role<>'director')) then raise exception 'Invalid owner';end if;
  if exists(select 1 from unnest(coalesce(p_collaborators,'{}')) c where not exists(select 1 from public.sm_members where id=c and project_id=t.project_id and active and (m.role='director' or role<>'director'))) then raise exception 'Invalid collaborator';end if;
  update public.sm_tasks set owner_id=p_owner,collaborators=array(select distinct x from unnest(coalesce(p_collaborators,'{}')) x where x<>p_owner),reviewer_id=case when p_owner<>t.owner_id then m.id else reviewer_id end,status='open',submitted_at=null where id=t.id;
 elsif p_action='edit' then
  if not manage or t.status='done' or length(trim(p_text)) not between 1 and 200 then raise exception 'Cannot edit';end if;
  update public.sm_tasks set title=trim(p_text),due=p_due where id=t.id;
 else raise exception 'Unknown action';end if;
 update public.sm_tasks set revision=revision+1,updated_at=now() where id=t.id;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text,payload) values(t.id,t.project_id,m.id,p_action,left(p_text,4000),jsonb_build_object('before',before_task,'after',(select to_jsonb(x) from public.sm_tasks x where x.id=t.id)));
 for r in select distinct x from unnest(array[t.owner_id,t.reviewer_id,p_owner]||t.collaborators||coalesce(p_collaborators,'{}')) x where x is not null and x<>m.id loop
  insert into public.sm_notices(project_id,task_id,recipient_id,text) values(t.project_id,t.id,r,case when p_action='report' then 'گزارش یا بازخورد جدید: ' when p_action='approve' then 'تأیید نهایی: ' when p_action='submit' then 'منتظر بررسی: ' else 'به‌روزرسانی کار: ' end||t.title);
 end loop;
end $$;
create function public.sm_reserve_file(p_task uuid,p_revision integer,p_name text,p_size bigint,p_type text,p_label text) returns public.sm_files language plpgsql security definer set search_path='' as $$
declare t public.sm_tasks; m public.sm_members; f public.sm_files; fid uuid:=gen_random_uuid();
begin
 select * into t from public.sm_tasks where id=p_task for update;m:=sm_private.member(t.project_id);
 if m.id is null or t.status='done' or (m.id<>t.owner_id and not(m.id=any(t.collaborators)) and not sm_private.can_manage(t,m)) then raise exception 'Cannot upload';end if;
 if t.revision<>p_revision then raise exception 'Conflict: refresh and retry';end if;
 if length(p_name) not between 1 and 200 then raise exception 'Filename required';end if;
 insert into public.sm_files(id,task_id,project_id,author_id,name,label,size,content_type,object_path,base_revision)
 values(fid,t.id,t.project_id,m.id,p_name,left(coalesce(p_label,''),120),p_size,left(coalesce(p_type,'application/octet-stream'),150),t.project_id||'/'||t.id||'/'||fid,t.revision) returning * into f;
 return f;
end $$;
create function public.sm_finalize_file(p_file uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.sm_files;t public.sm_tasks;m public.sm_members;
begin
 select * into f from public.sm_files where id=p_file for update;
 select * into t from public.sm_tasks where id=f.task_id for update;m:=sm_private.member(t.project_id);
 if m.id is null or f.author_id<>m.id or f.ready or t.status='done' or t.revision<>f.base_revision or (m.id<>t.owner_id and not(m.id=any(t.collaborators)) and not sm_private.can_manage(t,m)) then raise exception 'Cannot finalize file; refresh task';end if;
 if not exists(select 1 from storage.objects where bucket_id='samandis-files' and name=f.object_path and (metadata->>'size')::bigint=f.size) then raise exception 'Upload incomplete';end if;
 update public.sm_files set ready=true where id=f.id;
 update public.sm_tasks set status='open',submitted_at=null,revision=revision+1,updated_at=now() where id=t.id;
 insert into public.sm_events(task_id,project_id,actor_id,kind,text,payload) values(t.id,t.project_id,m.id,'file',f.name,jsonb_build_object('file_id',f.id));
 insert into public.sm_notices(project_id,task_id,recipient_id,text) select t.project_id,t.id,x,'فایل جدید: '||t.title from (select distinct unnest(array[t.owner_id,t.reviewer_id]||t.collaborators) x) a where x<>m.id;
end $$;
create function public.sm_read_notice(p_notice uuid) returns void language sql security definer set search_path='' as $$
 update public.sm_notices set read=true where id=p_notice and recipient_id in (select id from public.sm_members where user_id=auth.uid() and active)
$$;
create function public.sm_save_member(p_project uuid,p_id uuid,p_name text,p_title text,p_email text,p_role text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare m public.sm_members;old public.sm_members;
begin
 m:=sm_private.member(p_project);if m.id is null or m.role not in ('director','supervisor') then raise exception 'Access denied';end if;
 select * into old from public.sm_members where id=p_id and project_id=p_project for update;
 if m.role='supervisor' and (p_role='director' or old.role='director') then raise exception 'Project manager is protected';end if;
 if old.role='director' and old.active and (not p_active or p_role<>'director') and not exists(select 1 from public.sm_members where project_id=p_project and id<>old.id and role='director' and active) then raise exception 'Keep one active director';end if;
 if old.user_id is not null and lower(trim(p_email)) is distinct from old.email then raise exception 'Bound email cannot be changed';end if;
 if length(trim(p_name)) not between 1 and 100 or length(trim(p_title)) not between 1 and 100 then raise exception 'Name and title required';end if;
 if old.id is null then insert into public.sm_members(project_id,name,title,email,role,active) values(p_project,trim(p_name),trim(p_title),nullif(lower(trim(p_email)),''),p_role,p_active);
 else update public.sm_members set name=trim(p_name),title=trim(p_title),email=nullif(lower(trim(p_email)),''),role=p_role,active=p_active where id=old.id;end if;
end $$;
insert into public.sm_projects(slug,name) values('darayi','پروژه دارایی');
insert into public.sm_members(project_id,name,title,role) select p.id,x.name,x.title,x.role from public.sm_projects p cross join (values
 ('رضا افشار','مدیر پروژه','director'),('احسان شاهین زاده','سرپرست کارگاه','supervisor'),('فرگل دانش','کارشناس کنترل پروژه','member'),('عرفان افشار','کارشناس کنترل پروژه','member'),('احمدرضا محمدامری','سرپرست دفتر فنی','member')) x(name,title,role) where p.slug='darayi';
insert into storage.buckets(id,name,public,file_size_limit) values('samandis-files','samandis-files',false,20971520);
create function public.sm_storage_read(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sm_files f join public.sm_members m on m.project_id=f.project_id and m.user_id=auth.uid() and m.active where f.object_path=path and (f.ready or f.author_id=m.id))
$$;
create function public.sm_storage_write(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sm_files f join public.sm_tasks t on t.id=f.task_id join public.sm_members m on m.id=f.author_id and m.user_id=auth.uid() and m.active where f.object_path=path and not f.ready and t.status<>'done' and f.base_revision=t.revision and (t.owner_id=m.id or m.id=any(t.collaborators) or sm_private.can_manage(t,m)))
$$;
create policy sm_storage_read on storage.objects for select to authenticated using(bucket_id='samandis-files' and public.sm_storage_read(name));
create policy sm_storage_write on storage.objects for insert to authenticated with check(bucket_id='samandis-files' and public.sm_storage_write(name));
-- No updates/deletes on files: final and earlier versions remain immutable.
revoke execute on all functions in schema sm_private from public,anon,authenticated;
grant usage on schema sm_private to authenticated;
grant execute on function sm_private.member(uuid) to authenticated;
revoke execute on function public.sm_has_access(uuid),public.sm_claim_membership(),public.sm_create_task(uuid,text,text,uuid,uuid,date),public.sm_task_action(uuid,integer,text,text,uuid,uuid[],date),public.sm_reserve_file(uuid,integer,text,bigint,text,text),public.sm_finalize_file(uuid),public.sm_read_notice(uuid),public.sm_save_member(uuid,uuid,text,text,text,text,boolean),public.sm_storage_read(text),public.sm_storage_write(text) from public,anon;
grant execute on function public.sm_has_access(uuid),public.sm_claim_membership(),public.sm_create_task(uuid,text,text,uuid,uuid,date),public.sm_task_action(uuid,integer,text,text,uuid,uuid[],date),public.sm_reserve_file(uuid,integer,text,bigint,text,text),public.sm_finalize_file(uuid),public.sm_read_notice(uuid),public.sm_save_member(uuid,uuid,text,text,text,text,boolean),public.sm_storage_read(text),public.sm_storage_write(text) to authenticated;
commit;

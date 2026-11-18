create table sm_private.feedback_receivers(user_id uuid primary key references auth.users(id));
alter table sm_private.feedback_receivers enable row level security;
-- Receiver access is provisioned privately by a trusted administrator.
create function public.sm_feedback_access() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from sm_private.feedback_receivers where user_id=(select auth.uid()))$$;
revoke all on function public.sm_feedback_access() from public,anon;
grant execute on function public.sm_feedback_access() to authenticated;
create table public.sm_feedback(
 id uuid primary key default gen_random_uuid(),sender_id uuid not null references auth.users(id),
 sender_name text not null,body text not null check(length(trim(body)) between 1 and 4000),
 image_path text,created_at timestamptz not null default now(),read boolean not null default false
);
alter table public.sm_feedback enable row level security;
revoke all on public.sm_feedback from public,anon,authenticated;
grant select on public.sm_feedback to authenticated;
grant update(read) on public.sm_feedback to authenticated;
create policy feedback_receiver_read on public.sm_feedback for select to authenticated using((select public.sm_feedback_access()));
create policy feedback_receiver_mark on public.sm_feedback for update to authenticated using((select public.sm_feedback_access())) with check((select public.sm_feedback_access()));
create function public.sm_send_feedback(p_body text,p_image text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); n text; result uuid;
begin
 select name into n from public.sm_members where user_id=u and active and not external limit 1;
 if n is null then raise exception 'Access denied';end if;
 if length(trim(p_body)) not between 1 and 4000 then raise exception 'Description required';end if;
 if p_image is not null and (split_part(p_image,'/',1)<>u::text or not exists(select 1 from storage.objects where bucket_id='samandis-feedback' and name=p_image)) then raise exception 'Image unavailable';end if;
 insert into public.sm_feedback(sender_id,sender_name,body,image_path) values(u,n,trim(p_body),p_image) returning id into result;
 return result;
end $$;
revoke all on function public.sm_send_feedback(text,text) from public,anon;
grant execute on function public.sm_send_feedback(text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('samandis-feedback','samandis-feedback',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy feedback_image_upload on storage.objects for insert to authenticated with check(bucket_id='samandis-feedback' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.sm_members where user_id=(select auth.uid()) and active and not external));
create policy feedback_image_read on storage.objects for select to authenticated using(bucket_id='samandis-feedback' and (select public.sm_feedback_access()) and exists(select 1 from public.sm_feedback where image_path=name));


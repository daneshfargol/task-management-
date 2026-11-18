insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('samandis-avatars','samandis-avatars',false,1048576,array['image/jpeg']);
create policy avatar_owner_upload on storage.objects for insert to authenticated with check(bucket_id='samandis-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy avatar_owner_read on storage.objects for select to authenticated using(bucket_id='samandis-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

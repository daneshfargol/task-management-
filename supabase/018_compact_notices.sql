begin;
create function sm_private.compact_task_notices() returns trigger language plpgsql security definer set search_path='' as $$
declare existing uuid;
begin
if new.reminder_days is not null then return new;end if;
perform pg_advisory_xact_lock(hashtextextended(new.task_id::text||new.recipient_id::text,17));
select id into existing from public.sm_notices where task_id=new.task_id and recipient_id=new.recipient_id and not read and reminder_days is null and created_at>=now()-interval '2 minutes' order by created_at desc limit 1 for update;
if existing is not null then update public.sm_notices set text=new.text,created_at=new.created_at where id=existing;return null;end if;
return new;
end $$;
revoke execute on function sm_private.compact_task_notices() from public,anon,authenticated;
create trigger sm_compact_notices before insert on public.sm_notices for each row execute function sm_private.compact_task_notices();
-- Keep the most recent unread update per task; retain all older rows as read history.
with ranked as(select id,row_number() over(partition by task_id,recipient_id order by created_at desc,id desc) n from public.sm_notices where not read and reminder_days is null) update public.sm_notices set read=true where id in(select id from ranked where n>1);
commit;

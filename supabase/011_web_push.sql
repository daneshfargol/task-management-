-- Durable, account-scoped Web Push. Apply once, then configure private keys separately.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table sm_private.push_config (
 singleton boolean primary key default true check(singleton),
 public_key text not null, private_key text not null, webhook_secret text not null,
 subject text not null default 'https://task-management-nine-red.vercel.app',
 worker_url text not null default 'https://bcuwezoedmxtuxzvgucl.supabase.co/functions/v1/samandis-push',
 enabled boolean not null default false
);
create table sm_private.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text unique not null, p256dh text not null, auth text not null,
 device_name text not null default '', updated_at timestamptz not null default now(),
 enabled boolean not null default true
);
create index on sm_private.push_subscriptions(user_id) where enabled;
create table sm_private.push_queue (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references sm_private.push_subscriptions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 notice_id uuid references public.sm_notices(id) on delete cascade,
 task_id uuid references public.sm_tasks(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0, next_attempt timestamptz not null default now(),
 created_at timestamptz not null default now(), sent_at timestamptz,
 unique(subscription_id,notice_id)
);
create index on sm_private.push_queue(next_attempt) where state in ('pending','sending');
revoke all on sm_private.push_config,sm_private.push_subscriptions,sm_private.push_queue from public,anon,authenticated;

create function public.sm_push_settings() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ready',coalesce((select enabled from sm_private.push_config where singleton),false),
 'publicKey',(select public_key from sm_private.push_config where singleton and enabled))
 where auth.uid() is not null;
$$;
create function public.sm_push_subscribe(p_endpoint text,p_p256dh text,p_auth text,p_device text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.sm_members where user_id=auth.uid() and active) then raise exception 'Access denied'; end if;
 if not exists(select 1 from sm_private.push_config where singleton and enabled) then raise exception 'Push is not configured'; end if;
 if length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|([a-zA-Z0-9-]+[.])*push[.]apple[.]com|([a-zA-Z0-9-]+[.])+notify[.]windows[.]com)/' then raise exception 'Invalid push endpoint'; end if;
 if p_p256dh !~ '^[A-Za-z0-9_-]{87}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{22}={0,2}$' then raise exception 'Invalid subscription keys'; end if;
 -- A browser may switch accounts. Cancel deliveries from its earlier account first.
 update sm_private.push_queue q set state='cancelled' from sm_private.push_subscriptions s
 where q.subscription_id=s.id and s.endpoint=p_endpoint and s.user_id<>auth.uid() and q.state in ('pending','sending');
 insert into sm_private.push_subscriptions(user_id,endpoint,p256dh,auth,device_name)
 values(auth.uid(),p_endpoint,p_p256dh,p_auth,left(p_device,100))
 on conflict(endpoint) do update set user_id=auth.uid(),p256dh=excluded.p256dh,auth=excluded.auth,device_name=excluded.device_name,enabled=true,updated_at=now()
 returning id into result;
 return result;
end;
$$;
create function public.sm_push_unsubscribe(p_endpoint text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update sm_private.push_subscriptions set enabled=false where user_id=auth.uid() and endpoint=p_endpoint;
 update sm_private.push_queue q set state='cancelled' from sm_private.push_subscriptions s
 where q.subscription_id=s.id and s.user_id=auth.uid() and s.endpoint=p_endpoint and q.state in ('pending','sending');
end;
$$;
create function sm_private.push_wake() returns void language plpgsql security definer set search_path='' as $$
declare c sm_private.push_config;
begin
 select * into c from sm_private.push_config where singleton and enabled;
 if c.singleton is null or not exists(select 1 from sm_private.push_queue where state in ('pending','sending') and next_attempt<=now() and created_at>now()-interval '1 day') then return; end if;
 perform net.http_post(url:=c.worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||c.webhook_secret),body:='{}'::jsonb,timeout_milliseconds:=10000);
end;
$$;
create function sm_private.push_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into sm_private.push_queue(subscription_id,user_id,notice_id,task_id)
 select s.id,s.user_id,new.id,new.task_id from sm_private.push_subscriptions s
 join public.sm_members m on m.user_id=s.user_id and m.id=new.recipient_id and m.project_id=new.project_id and m.active
 where s.enabled;
 perform sm_private.push_wake();
 return new;
end;
$$;
create trigger sm_notice_web_push after insert on public.sm_notices for each row execute function sm_private.push_notice();
create function public.sm_push_test(p_endpoint text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 select id into sid from sm_private.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid() and enabled;
 if sid is null then raise exception 'No active subscription'; end if;
 if exists(select 1 from sm_private.push_queue where subscription_id=sid and notice_id is null and created_at>now()-interval '30 seconds') then raise exception 'Please wait 30 seconds'; end if;
 insert into sm_private.push_queue(subscription_id,user_id) values(sid,auth.uid());
 perform sm_private.push_wake();
end;
$$;
-- Worker-only RPCs. Private keys, subscription keys and queues are never readable by clients.
create function public.sm_push_worker_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('publicKey',public_key,'privateKey',private_key,'secret',webhook_secret,'subject',subject,'enabled',enabled)
 from sm_private.push_config where singleton;
$$;
create function public.sm_push_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update sm_private.push_queue set state='failed' where state in ('pending','sending') and (attempts>=8 or created_at<now()-interval '1 day');
 update sm_private.push_queue q set state='cancelled' where q.state in ('pending','sending') and not exists(
 select 1 from sm_private.push_subscriptions s where s.id=q.subscription_id and s.user_id=q.user_id and s.enabled
 and (q.notice_id is null or exists(select 1 from public.sm_notices n join public.sm_members m on m.id=n.recipient_id
 where n.id=q.notice_id and m.user_id=q.user_id and m.active and not n.read)));
 with candidates as (
 select id from sm_private.push_queue where (state='pending' or (state='sending' and next_attempt<=now())) and next_attempt<=now() and attempts<8
 order by created_at for update skip locked limit 20
 ), claimed as (
 update sm_private.push_queue q set state='sending',attempts=q.attempts+1,next_attempt=now()+interval '5 minutes'
 where q.id in(select id from candidates) returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'attempt',q.attempts,'taskId',q.task_id,'test',q.notice_id is null,
 'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb)
 into result from claimed q join sm_private.push_subscriptions s on s.id=q.subscription_id;
 return result;
end;
$$;
create function public.sm_push_complete(p_id uuid,p_attempt integer,p_status integer) returns void language plpgsql security definer set search_path='' as $$
declare row sm_private.push_queue;
begin
 select * into row from sm_private.push_queue where id=p_id and attempts=p_attempt and state='sending' for update;
 if row.id is null then return; end if;
 if p_status in (404,410) then
 update sm_private.push_subscriptions set enabled=false where id=row.subscription_id;
 update sm_private.push_queue set state='cancelled' where subscription_id=row.subscription_id and state in ('pending','sending');
 elsif p_status between 200 and 299 then
 update sm_private.push_queue set state='sent',sent_at=now() where id=p_id;
 else
 update sm_private.push_queue set state=case when attempts>=8 then 'failed' else 'pending' end,next_attempt=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) where id=p_id;
 end if;
end;
$$;
revoke all on function public.sm_push_settings(),public.sm_push_subscribe(text,text,text,text),public.sm_push_unsubscribe(text),public.sm_push_test(text) from public,anon;
grant execute on function public.sm_push_settings(),public.sm_push_subscribe(text,text,text,text),public.sm_push_unsubscribe(text),public.sm_push_test(text) to authenticated;
revoke all on function public.sm_push_worker_config(),public.sm_push_claim(),public.sm_push_complete(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.sm_push_worker_config(),public.sm_push_claim(),public.sm_push_complete(uuid,integer,integer) to service_role;
revoke all on function sm_private.push_wake(),sm_private.push_notice() from public,anon,authenticated;
select cron.schedule('samandis-web-push-retry','* * * * *','select sm_private.push_wake()');
commit;

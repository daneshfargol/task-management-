create table public.sm_user_preferences (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null check (length(key) between 1 and 200),
  value jsonb not null check (octet_length(value::text) <= 4096),
  primary key (user_id, key)
);
alter table public.sm_user_preferences enable row level security;
create policy account_preferences_read on public.sm_user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy account_preferences_insert on public.sm_user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy account_preferences_update on public.sm_user_preferences
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.sm_user_preferences from public, anon, authenticated;
grant select, insert, update on public.sm_user_preferences to authenticated;
comment on table public.sm_user_preferences is 'Per-user layout, project selection and sorting. No business records are replaced.';

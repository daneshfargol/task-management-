begin;
-- Job titles stay unchanged. Both management positions use one permission role.
create function sm_private.normalize_management_role() returns trigger language plpgsql set search_path='' as $$
begin
 if new.role='supervisor' then new.role:='director'; end if;
 return new;
end $$;
create trigger sm_equal_management before insert or update of role on public.sm_members for each row execute function sm_private.normalize_management_role();
update public.sm_members set role='director' where role='supervisor';
commit;

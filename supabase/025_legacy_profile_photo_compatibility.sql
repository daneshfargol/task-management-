alter table public.sm_user_preferences drop constraint sm_user_preferences_value_check;
alter table public.sm_user_preferences add constraint sm_user_preferences_value_check check(
 octet_length(value::text)<=4096 or
 (key='profile-avatar' and octet_length(value::text)<=262144 and value->'data'->>'kind'='photo' and coalesce(value->'data'->>'src','') ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$')
);

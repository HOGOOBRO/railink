-- Persist the visibility choice made on the signup screen.
--
-- The applied 20260526000000 migration added profiles.visibility (default
-- 'public') and backfilled it from the legacy share_schedule flag, but left the
-- new-user trigger untouched — so a signup's chosen visibility never reached
-- the profiles row. This redefines handle_new_user_profile() to read
-- raw_user_meta_data->>'visibility' and write it when it is a valid value
-- ('public'/'private'); otherwise the column keeps its default.
--
-- Every other column's logic is unchanged from 20260524000000_admin_accounts.sql.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, employee_id, part, photo, is_admin, visibility)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'employee_id', ''),
    nullif(new.raw_user_meta_data ->> 'part', ''),
    nullif(new.raw_user_meta_data ->> 'photo', ''),
    lower(new.email) in ('wlsgus23@nate.com', 'wlsgus23@naver.com', 'wlsgus11117@gmail.com'),
    case
      when new.raw_user_meta_data ->> 'visibility' in ('public', 'private')
        then new.raw_user_meta_data ->> 'visibility'
      else 'public'
    end
  )
  on conflict (id) do update set
    name = excluded.name,
    employee_id = excluded.employee_id,
    part = excluded.part,
    photo = excluded.photo,
    is_admin = excluded.is_admin,
    -- Only overwrite an existing row's visibility when valid metadata is given;
    -- otherwise keep whatever's already there (e.g. a value already backfilled
    -- from share_schedule before the auth row was created).
    visibility = case
      when new.raw_user_meta_data ->> 'visibility' in ('public', 'private')
        then new.raw_user_meta_data ->> 'visibility'
      else profiles.visibility
    end;
  return new;
end;
$$;

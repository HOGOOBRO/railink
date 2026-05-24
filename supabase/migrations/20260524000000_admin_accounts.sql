-- Admin (operations) accounts: hidden from the colleague directory and
-- comparison for every other user, enforced at the RLS level.

-- 1) Flag column
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- 2) Auto-flag admin emails on signup (preserve existing profile-sync behavior).
--    security definer + search_path are REQUIRED (trigger runs from the auth schema).
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, employee_id, part, photo, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'employee_id', ''),
    nullif(new.raw_user_meta_data ->> 'part', ''),
    nullif(new.raw_user_meta_data ->> 'photo', ''),
    lower(new.email) in ('wlsgus23@nate.com', 'wlsgus23@naver.com', 'wlsgus11117@gmail.com')
  )
  on conflict (id) do update set
    name = excluded.name,
    employee_id = excluded.employee_id,
    part = excluded.part,
    photo = excluded.photo,
    is_admin = excluded.is_admin;
  return new;
end;
$$;

-- 3) Backfill: flag any of the three that already signed up (covers both
--    "profile row exists" and "missing profile row" cases).
insert into public.profiles (id, name, employee_id, is_admin)
select au.id,
       coalesce(au.raw_user_meta_data ->> 'name', ''),
       coalesce(au.raw_user_meta_data ->> 'employee_id', ''),
       true
from auth.users au
where lower(au.email) in ('wlsgus23@nate.com', 'wlsgus23@naver.com', 'wlsgus11117@gmail.com')
on conflict (id) do update set is_admin = true;

-- 4) Strengthen profiles SELECT RLS: regular users can read non-admin profiles
--    and their own; admin profiles are invisible to everyone else. This removes
--    admins from search/compare at the database level (not just the UI).
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (is_admin = false or auth.uid() = id);

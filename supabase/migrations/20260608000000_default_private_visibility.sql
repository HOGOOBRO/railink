-- Make every profile private, and make 'private' the default for new signups.
--
-- Requested change: flip the whole user base to search-hidden, and ensure
-- anyone signing up from now on also starts private (instead of the historical
-- 'public' default). Three parts:
--   1) backfill every existing row to 'private'
--   2) change profiles.visibility column DEFAULT 'public' -> 'private'
--   3) redefine handle_new_user_profile() so the no-metadata fallback is
--      'private' instead of 'public'
--
-- This affects ALL rows, including is_admin accounts. Admin profiles are
-- already hidden from the directory by the profiles SELECT policy
-- (is_admin = false AND visibility = 'public'), so this is harmless for them
-- but keeps the column internally consistent.
--
-- Data access is unaffected: visibility only governs search/listing. Existing
-- accepted schedule_shares keep working — 'private' does not revoke them.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Backfill: everyone private
-- ─────────────────────────────────────────────────────────────────────────────
update public.profiles
set visibility = 'private'
where visibility <> 'private';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) New default for future inserts
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  alter column visibility set default 'private';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Trigger: no-metadata fallback becomes 'private'
--
-- Identical to the deployed 20260606000000_oauth_google_personal.sql trigger
-- EXCEPT the final visibility fallback on insert: coalesce(meta_visibility,
-- 'private') instead of '...'public'). is_admin flagging, profile_type
-- classification (Google -> personal), the personal->private clamp, and the
-- on-conflict behavior are all preserved exactly.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_profile_type text := case
    when new.raw_user_meta_data ->> 'profile_type' in ('ktx_attendant', 'personal')
      then new.raw_user_meta_data ->> 'profile_type'
    when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
      then 'personal'
    else 'ktx_attendant'
  end;
  meta_visibility text := case
    when new.raw_user_meta_data ->> 'visibility' in ('public', 'private')
      then new.raw_user_meta_data ->> 'visibility'
    else null
  end;
begin
  if meta_profile_type = 'personal' then
    meta_visibility := 'private';
  end if;

  insert into public.profiles (id, name, employee_id, part, photo, is_admin, profile_type, visibility)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'employee_id', ''),
    nullif(new.raw_user_meta_data ->> 'part', ''),
    nullif(new.raw_user_meta_data ->> 'photo', ''),
    lower(new.email) in ('wlsgus23@nate.com', 'wlsgus23@naver.com', 'wlsgus11117@gmail.com'),
    meta_profile_type,
    -- CHANGED: fallback is now 'private' (was 'public').
    coalesce(meta_visibility, 'private')
  )
  on conflict (id) do update set
    name         = excluded.name,
    employee_id  = excluded.employee_id,
    part         = excluded.part,
    photo        = excluded.photo,
    is_admin     = excluded.is_admin,
    profile_type = excluded.profile_type,
    visibility   = coalesce(meta_visibility, profiles.visibility);
  return new;
end;
$$;

-- 검증 SQL (적용 직후 실행):
--   select visibility, count(*) from public.profiles group by visibility;
--   기대: 전부 'private'.
--   select column_default from information_schema.columns
--     where table_schema='public' and table_name='profiles' and column_name='visibility';
--   기대: 'private'::text.

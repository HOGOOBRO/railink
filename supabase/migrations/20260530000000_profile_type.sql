-- Personal track, PR-1: add profiles.profile_type and teach the new-user
-- trigger about it.
--
-- profile_type distinguishes a KTX 객실승무원 ('ktx_attendant') from a self-/
-- invite-signup 개인 user ('personal'). The two are 100% equal in rights and
-- features; the column only records identity (KTX has 사번·파트, personal does
-- not). Default is 'ktx_attendant', so every existing row is auto-classified as
-- KTX and current behavior is unchanged.
--
-- NOTE: the planning doc's §2.1 rewrite of handle_new_user_profile() dropped the
-- is_admin assignment that the deployed 20260526010000 trigger performs. We do
-- NOT use that version verbatim — it would stop new admin accounts from being
-- flagged. Instead this redefinition is the deployed trigger PLUS profile_type
-- and a personal→private visibility clamp. is_admin and the existing visibility
-- handling are preserved exactly.

alter table public.profiles
  add column if not exists profile_type text not null default 'ktx_attendant';

alter table public.profiles
  drop constraint if exists profiles_profile_type_check;

alter table public.profiles
  add constraint profiles_profile_type_check
  check (profile_type in ('ktx_attendant', 'personal'));

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Signup metadata; unknown/missing profile_type → 'ktx_attendant' (back-compat
  -- for every existing user and any auth row created before this migration).
  meta_profile_type text := case
    when new.raw_user_meta_data ->> 'profile_type' in ('ktx_attendant', 'personal')
      then new.raw_user_meta_data ->> 'profile_type'
    else 'ktx_attendant'
  end;
  -- Visibility from metadata only when valid; NULL otherwise so we fall back to
  -- the column default (insert) or keep the existing value (on conflict).
  meta_visibility text := case
    when new.raw_user_meta_data ->> 'visibility' in ('public', 'private')
      then new.raw_user_meta_data ->> 'visibility'
    else null
  end;
begin
  -- personal accounts always START private (search-hidden); the user can opt
  -- into public later in settings. This overrides whatever visibility says.
  if meta_profile_type = 'personal' then
    meta_visibility := 'private';
  end if;

  insert into public.profiles (id, name, employee_id, part, photo, is_admin, profile_type, visibility)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'employee_id', ''),
    nullif(new.raw_user_meta_data ->> 'part', ''),
    nullif(new.raw_user_meta_data ->> 'photo', ''),
    lower(new.email) in ('wlsgus23@nate.com', 'wlsgus23@naver.com', 'wlsgus11117@gmail.com'),
    meta_profile_type,
    coalesce(meta_visibility, 'public')
  )
  on conflict (id) do update set
    name         = excluded.name,
    employee_id  = excluded.employee_id,
    part         = excluded.part,
    photo        = excluded.photo,
    is_admin     = excluded.is_admin,
    profile_type = excluded.profile_type,
    -- Overwrite visibility only when valid metadata was given (or clamped to
    -- private for personal); otherwise keep whatever's already there.
    visibility   = coalesce(meta_visibility, profiles.visibility);
  return new;
end;
$$;

-- 검증 SQL (마이그레이션 적용 직후 실행):
--   select profile_type, count(*) from public.profiles group by profile_type;
-- 기대 결과: 단일 행 ('ktx_attendant', 기존 사용자 수).

-- Google OAuth, new-user classification.
--
-- A Google sign-up arrives with no profile_type metadata (signInWithOAuth can't
-- set user_metadata) and no 사번/파트 — it's an individual. Classify it as
-- 'personal' so it lands on the personal track (which already supports an empty
-- employee_id) instead of defaulting to 'ktx_attendant'.
--
-- This is the deployed 20260530000000 trigger PLUS one branch: when the row has
-- no explicit profile_type AND the auth provider is google, choose 'personal'.
-- is_admin, the personal→private visibility clamp, and email-signup behavior are
-- all preserved exactly. The provider lives in raw_APP_meta_data (set by GoTrue),
-- NOT raw_user_meta_data.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Explicit profile_type metadata wins (email signup form). Otherwise: a Google
  -- OAuth row → 'personal'; anything else → 'ktx_attendant' (back-compat).
  meta_profile_type text := case
    when new.raw_user_meta_data ->> 'profile_type' in ('ktx_attendant', 'personal')
      then new.raw_user_meta_data ->> 'profile_type'
    when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
      then 'personal'
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
    -- Google puts the display name in 'name' (and 'full_name'); email signup in
    -- 'name'. Prefer whichever is non-empty so Google users get a real name.
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), new.raw_user_meta_data ->> 'full_name', ''),
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
    visibility   = coalesce(meta_visibility, profiles.visibility);
  return new;
end;
$$;

-- 검증 SQL (마이그레이션 적용 직후 / Google 가입 1건 후 실행):
--   select profile_type, count(*) from public.profiles group by profile_type;
-- 기대: Google 가입 계정이 'personal'로 분류됨.

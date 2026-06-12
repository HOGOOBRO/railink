-- 마케팅(업데이트·이벤트 알림) 수신 동의 기록.
--
-- 가입 폼의 선택 동의 체크박스는 지금까지 UI에만 있고 어디에도 저장되지 않았다
-- (terms.marketing이 signup()에 전달되지 않음). 누구에게 소식을 보내도 되는지
-- 기록이 없으면 보낼 수 없으므로 profiles에 동의 여부 + 응답 시각을 기록한다.
--
-- 컬럼 의미:
--   marketing_consent     동의 여부. 기본 false.
--   marketing_consent_at  마지막으로 "질문에 답한" 시각. NULL = 아직 한 번도
--                         묻지 않은 계정 — Google OAuth 가입(가입 폼을 안 거침)과
--                         이 마이그레이션 이전 가입자 전원. 클라이언트는 NULL을
--                         보고 1회 동의 프롬프트를 띄운다(캘린더 마운트).
--
-- 쓰기 경로: 이메일 가입은 user_metadata.marketing_consent → 아래 트리거가 기록.
-- 그 외(설정 토글, 캘린더 프롬프트)는 본인 행 직접 update — 기존
-- profiles_update_own RLS(20260520000000)가 그대로 허용한다.

alter table public.profiles
  add column if not exists marketing_consent boolean not null default false;

alter table public.profiles
  add column if not exists marketing_consent_at timestamptz;

-- 배포된 20260606000000 트리거 + marketing_consent 처리. is_admin, Google →
-- personal 분류, personal → private 클램프, 이름 폴백 등 기존 동작은 그대로다.
-- 메타데이터에 marketing_consent 키가 없으면(Google OAuth) 컬럼 기본값(false,
-- NULL 시각)을 유지해 "아직 안 물어봄" 상태로 남긴다.

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
  -- 가입 폼의 선택 동의 체크박스. 키가 있을 때만(이메일 가입) 값과 응답 시각을
  -- 기록한다. NULL = 안 물어봄(Google OAuth 등) → 컬럼 기본값 유지.
  meta_marketing boolean := case
    when new.raw_user_meta_data ->> 'marketing_consent' in ('true', 'false')
      then (new.raw_user_meta_data ->> 'marketing_consent')::boolean
    else null
  end;
begin
  -- personal accounts always START private (search-hidden); the user can opt
  -- into public later in settings. This overrides whatever visibility says.
  if meta_profile_type = 'personal' then
    meta_visibility := 'private';
  end if;

  insert into public.profiles (
    id, name, employee_id, part, photo, is_admin, profile_type, visibility,
    marketing_consent, marketing_consent_at
  )
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
    coalesce(meta_visibility, 'public'),
    coalesce(meta_marketing, false),
    case when meta_marketing is not null then now() else null end
  )
  on conflict (id) do update set
    name         = excluded.name,
    employee_id  = excluded.employee_id,
    part         = excluded.part,
    photo        = excluded.photo,
    is_admin     = excluded.is_admin,
    profile_type = excluded.profile_type,
    visibility   = coalesce(meta_visibility, profiles.visibility),
    -- 메타데이터에 답이 있을 때만 덮어쓴다. 없으면 기존 기록(설정에서 바꾼 값
    -- 포함)을 보존.
    marketing_consent    = coalesce(meta_marketing, profiles.marketing_consent),
    marketing_consent_at = case
      when meta_marketing is not null then now()
      else profiles.marketing_consent_at
    end;
  return new;
end;
$$;

-- 검증 SQL (마이그레이션 적용 직후 실행):
--   select marketing_consent, marketing_consent_at is null as never_asked, count(*)
--   from public.profiles group by 1, 2;
-- 기대: 기존 사용자 전원 (false, never_asked=true) — 이후 캘린더 프롬프트로 수집.

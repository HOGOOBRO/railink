-- 가입 시 직무(직군) 수집 — 서비스 확장 우선순위 판단용.
--
-- 목적: "어느 직군부터 확장할지"를 수요로 줄세우기 위한 데이터. 개인화 기능이
-- 아니라 의사결정용이라, 깨끗하게 집계되는 구조화 값(job_category) + 발견용
-- 자유입력(job_other) 두 컬럼으로 받는다.
--
-- 컬럼 의미:
--   job_category  직군 코드. personal 가입 폼의 칩 단일선택에서 옴.
--                 'nurse' | 'flight_attendant' | 'beauty' | 'other'.
--                 NULL = 미응답(KTX 가입·Google OAuth·이 마이그레이션 이전 가입자).
--   job_other     job_category = 'other'일 때 사용자가 직접 적은 직군 텍스트.
--                 다음 정식 칩 후보를 발견하는 신호로 쓴다. 그 외엔 NULL.
--
-- 소속 지사(KTX)는 새 컬럼을 만들지 않고 기존 part 컬럼을 재사용한다(파트 →
-- 지사로 의미만 교체). 트리거는 이미 part를 메타데이터에서 그대로 기록하므로
-- 지사 때문에 바뀔 건 없다.
--
-- 쓰기 경로: 이메일 가입은 user_metadata.job_category / job_other → 아래 트리거가
-- 기록. Google OAuth는 키가 없으므로 NULL로 남아 "미응답" 상태가 된다.

alter table public.profiles
  add column if not exists job_category text;

alter table public.profiles
  add column if not exists job_other text;

-- 직군 코드는 알려진 4개만 허용(앵커링 최소화를 위해 칩은 적게 유지). 잘못된
-- 값이 들어오면 통째로 거부하지 말고 트리거에서 NULL로 떨군다(가입 자체는 막지
-- 않는다) — 따라서 컬럼 제약 대신 트리거에서 검증한다.

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
  -- 직군. 알려진 코드만 통과시키고 그 외/없음은 NULL(미응답).
  meta_job_category text := case
    when new.raw_user_meta_data ->> 'job_category'
      in ('nurse', 'flight_attendant', 'beauty', 'other')
      then new.raw_user_meta_data ->> 'job_category'
    else null
  end;
  -- 'other'일 때만 자유입력 텍스트를 보존(빈 문자열은 NULL).
  meta_job_other text := case
    when meta_job_category = 'other'
      then nullif(new.raw_user_meta_data ->> 'job_other', '')
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
    marketing_consent, marketing_consent_at, job_category, job_other
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
    case when meta_marketing is not null then now() else null end,
    meta_job_category,
    meta_job_other
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
    end,
    -- 직군도 메타데이터에 답이 있을 때만 덮어쓴다(미응답이면 기존 값 보존).
    job_category = coalesce(meta_job_category, profiles.job_category),
    job_other    = case
      when meta_job_category is not null then meta_job_other
      else profiles.job_other
    end;
  return new;
end;
$$;

-- 검증 SQL (마이그레이션 적용 직후 실행):
--   select job_category, count(*) from public.profiles group by 1 order by 2 desc;
-- 기대: 기존 사용자 전원 job_category = NULL(미응답). 이후 personal 가입으로 수집.
--   select job_other from public.profiles where job_category = 'other';
-- → 다음 정식 칩 후보 발견용.

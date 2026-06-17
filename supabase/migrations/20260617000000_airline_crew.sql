-- 항공 승무원 지원 — 가입 시 소속 항공사 태그.
--
-- 목적: RaiLink를 KTX 외 항공 크루까지 확장. profile_type은 그대로
-- ('ktx_attendant' | 'personal') 두고, 항공 승무원은 personal로 가입하되 어느
-- 항공사인지 식별할 수 있도록 profiles.airline 컬럼만 추가한다(저위험·순수 추가).
--
-- 컬럼 의미:
--   airline  소속 항공사 코드(lib/profile-fields.ts AIRLINES.code 슬러그).
--            예: 'air-premia'. NULL = 항공 승무원 아님(KTX/기타).
--            이 값으로 ① 항공사별 브랜드 컬러 테마 스왑(data-airline)
--            ② 스케줄 이미지 파서의 항공사 레이아웃 선택을 한다.
--
-- 쓰기 경로: 이메일 가입은 user_metadata.airline → 아래 트리거가 기록.
-- Google OAuth는 키가 없으므로 NULL로 남는다(설정에서 추후 지정 가능).

alter table public.profiles
  add column if not exists airline text;

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
  meta_marketing boolean := case
    when new.raw_user_meta_data ->> 'marketing_consent' in ('true', 'false')
      then (new.raw_user_meta_data ->> 'marketing_consent')::boolean
    else null
  end;
  meta_job_category text := case
    when new.raw_user_meta_data ->> 'job_category'
      in ('nurse', 'flight_attendant', 'beauty', 'other')
      then new.raw_user_meta_data ->> 'job_category'
    else null
  end;
  meta_job_other text := case
    when meta_job_category = 'other'
      then nullif(new.raw_user_meta_data ->> 'job_other', '')
    else null
  end;
  -- 소속 항공사. 빈 문자열은 NULL. 코드 화이트리스트는 트리거에서 강제하지 않고
  -- (part처럼) 그대로 보존 — 앱 상수(AIRLINES)가 진실의 원천이라 SQL과 이중관리하지
  -- 않는다. 잘못된 값이 와도 가입을 막지 않는다.
  meta_airline text := nullif(new.raw_user_meta_data ->> 'airline', '');
begin
  -- personal accounts (항공 승무원 포함) always START private; opt into public later.
  if meta_profile_type = 'personal' then
    meta_visibility := 'private';
  end if;

  insert into public.profiles (
    id, name, employee_id, part, photo, is_admin, profile_type, visibility,
    marketing_consent, marketing_consent_at, job_category, job_other, airline
  )
  values (
    new.id,
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
    meta_job_other,
    meta_airline
  )
  on conflict (id) do update set
    name         = excluded.name,
    employee_id  = excluded.employee_id,
    part         = excluded.part,
    photo        = excluded.photo,
    is_admin     = excluded.is_admin,
    profile_type = excluded.profile_type,
    visibility   = coalesce(meta_visibility, profiles.visibility),
    marketing_consent    = coalesce(meta_marketing, profiles.marketing_consent),
    marketing_consent_at = case
      when meta_marketing is not null then now()
      else profiles.marketing_consent_at
    end,
    job_category = coalesce(meta_job_category, profiles.job_category),
    job_other    = case
      when meta_job_category is not null then meta_job_other
      else profiles.job_other
    end,
    -- 메타데이터에 항공사 값이 있을 때만 덮어쓴다(없으면 기존 값 보존).
    airline      = coalesce(meta_airline, profiles.airline);
  return new;
end;
$$;

-- 검증 SQL (적용 직후):
--   select airline, count(*) from public.profiles group by 1 order by 2 desc;
-- 기대: 기존 사용자 전원 airline = NULL. 이후 항공 승무원 가입으로 수집.

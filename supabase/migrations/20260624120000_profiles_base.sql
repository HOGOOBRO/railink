-- 항공 승무원 소속 베이스(home base) — 지방 베이스가 있는 항공사(제주항공 등)용.
--
-- 목적: 체류(레이오버) 판정은 "베이스 공항 밖에서 자면 체류"다. 서울 단일베이스
-- 항공사(에어프레미아·아시아나)는 BASE={ICN,GMP} 고정으로 충분했으나, 제주항공은
-- 부산(김해, PUS) 베이스 크루가 있어 사용자별 베이스가 필요하다. 부산 크루는 PUS가
-- 집이므로 서울(ICN/GMP) 1박도 체류로 봐야 한다.
--
-- 컬럼 의미:
--   base  소속 베이스 코드(lib/profile-fields.ts). 'seoul' | 'busan' 등.
--         NULL = 서울(기본). 다중베이스 항공사 가입에서만 채워진다.
--
-- 쓰기 경로: 이메일 가입은 user_metadata.base → 아래 트리거가 기록(airline과 동일 패턴).

alter table public.profiles
  add column if not exists base text;

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
  meta_airline text := nullif(new.raw_user_meta_data ->> 'airline', '');
  -- 소속 베이스. airline과 동일하게 화이트리스트는 앱 상수가 진실의 원천이라
  -- SQL에선 강제하지 않고 그대로 보존. 빈 문자열은 NULL(서울 기본).
  meta_base text := nullif(new.raw_user_meta_data ->> 'base', '');
begin
  -- personal accounts (항공 승무원 포함) always START private; opt into public later.
  if meta_profile_type = 'personal' then
    meta_visibility := 'private';
  end if;

  insert into public.profiles (
    id, name, employee_id, part, photo, is_admin, profile_type, visibility,
    marketing_consent, marketing_consent_at, job_category, job_other, airline, base
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
    meta_airline,
    meta_base
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
    airline      = coalesce(meta_airline, profiles.airline),
    -- 메타데이터에 베이스 값이 있을 때만 덮어쓴다(없으면 기존 값 보존).
    base         = coalesce(meta_base, profiles.base);
  return new;
end;
$$;

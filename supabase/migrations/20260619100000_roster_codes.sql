-- 근무표 코드 사전. 항공사별로 '편명 아닌 코드'(대기/연차/훈련/관숙비행…)를 누적·분류한다.
-- 미리 모든 코드를 알 수 없으므로, 모르는 코드는 사용자가 분류해 점점 채워진다.
-- code는 정규화 키(canonCode: 공백·기호 제거, 영문 대문자). label은 표준 표시 단어.

create table if not exists public.roster_codes (
  airline text not null,
  code text not null,                 -- canonCode 형태(중복 방지 키)
  category text,                      -- 'work'|'off'|'standby'|'training'|'move'|'other' | null(미분류)
  label text,                         -- 표준 표시 단어(예: '대기')
  is_off boolean not null default false,
  occurrences integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (airline, code)
);

alter table public.roster_codes enable row level security;

grant select on public.roster_codes to authenticated;

-- 사전은 비-PII 공용 데이터 — 로그인 사용자는 누구나 읽을 수 있다(인식 보정에 사용).
drop policy if exists roster_codes_select_all on public.roster_codes;
create policy roster_codes_select_all
on public.roster_codes
for select
to authenticated
using (true);

-- 분류 기록은 RPC(SECURITY DEFINER)로만 — 임의 컬럼 조작 없이 안전하게 upsert.
create or replace function public.upsert_roster_code(
  p_airline text,
  p_code text,
  p_category text default null,
  p_label text default null,
  p_is_off boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if coalesce(trim(p_airline), '') = '' or coalesce(trim(p_code), '') = '' then
    raise exception 'airline and code are required';
  end if;

  insert into public.roster_codes (airline, code, category, label, is_off, occurrences)
  values (p_airline, p_code, p_category, p_label, coalesce(p_is_off, false), 1)
  on conflict (airline, code) do update set
    -- 새 분류값이 오면 갱신, 없으면 기존 유지. 등장 횟수는 항상 +1.
    category    = coalesce(excluded.category, public.roster_codes.category),
    label       = coalesce(excluded.label, public.roster_codes.label),
    is_off      = coalesce(p_is_off, public.roster_codes.is_off),
    occurrences = public.roster_codes.occurrences + 1,
    updated_at  = now();
end;
$$;

revoke all on function public.upsert_roster_code(text, text, text, text, boolean) from public;
grant execute on function public.upsert_roster_code(text, text, text, text, boolean) to authenticated;

-- 생일(birthday) 저장 — profiles와 분리한 별도 테이블.
--
-- 왜 별도 테이블인가: profiles의 SELECT 정책은 `using (true)`라 인증된 모든
-- 사용자가 모든 행을 읽는다. 생일을 profiles 컬럼으로 두면 전원에게 노출된다
-- (컬럼 단위 revoke는 테이블 단위 grant가 모든 컬럼을 덮어 무효). 그래서 규칙을
-- RLS에 직접 인코딩한 전용 테이블로 둔다:
--   읽기 = 본인 OR (그 사람이 owner, 내가 viewer, status='accepted'인 일정 공유)
-- → "일정 공유한 사람에게만 생일 노출" 제품 결정과 정확히 일치.

create table if not exists public.profile_birthdays (
  id         uuid primary key references public.profiles(id) on delete cascade,
  birthday   date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_birthdays enable row level security;

drop trigger if exists profile_birthdays_set_updated_at on public.profile_birthdays;
create trigger profile_birthdays_set_updated_at
before update on public.profile_birthdays
for each row execute function public.set_updated_at();

-- 읽기: 본인 또는 나에게 일정을 공유(accepted)한 사람의 생일만.
drop policy if exists profile_birthdays_select on public.profile_birthdays;
create policy profile_birthdays_select
on public.profile_birthdays
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from public.schedule_shares s
    where s.owner_id = profile_birthdays.id
      and s.viewer_id = auth.uid()
      and s.status = 'accepted'
  )
);

-- 쓰기: 본인 행만 insert/update/delete.
drop policy if exists profile_birthdays_insert on public.profile_birthdays;
create policy profile_birthdays_insert
on public.profile_birthdays
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profile_birthdays_update on public.profile_birthdays;
create policy profile_birthdays_update
on public.profile_birthdays
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profile_birthdays_delete on public.profile_birthdays;
create policy profile_birthdays_delete
on public.profile_birthdays
for delete
to authenticated
using (id = auth.uid());

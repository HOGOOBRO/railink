-- 비교 그룹(compare groups) 서버 저장 — 기기 재설치/PWA 재다운로드 시 그룹이
-- 사라지던 문제 해결.
--
-- 지금까지 그룹 구조(그룹 이름·여러 그룹·누가 어느 그룹인지·활성 그룹)는
-- localStorage(`railink_groups_v1`)에만 있었다. PWA를 새로 받으면 localStorage가
-- 비워져 전부 초기화됐다(수락된 동료는 부팅 시 auto-grouping이 기본 그룹으로만
-- 복원 → 이름·분류는 소실).
--
-- 왜 profiles 컬럼이 아니라 별도 테이블인가: profiles의 SELECT 정책은
-- `using (true)`라 인증된 모든 사용자가 모든 행·모든 컬럼을 읽는다(생일이
-- 별도 테이블로 빠진 것과 같은 이유 — 20260606010000 참고). 그룹 이름·구성은
-- 개인 데이터라 타인에게 노출하면 안 되므로, 읽기=본인뿐인 전용 테이블에 둔다.
--
-- 저장 형태: GroupsState({ groups, activeGroupId })를 통째로 jsonb 한 칼럼에.
-- 클라이언트(lib/store/groups.ts)의 localStorage 모양 그대로 미러링한다.

create table if not exists public.profile_compare_groups (
  id         uuid primary key references public.profiles(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profile_compare_groups enable row level security;

drop trigger if exists profile_compare_groups_set_updated_at on public.profile_compare_groups;
create trigger profile_compare_groups_set_updated_at
before update on public.profile_compare_groups
for each row execute function public.set_updated_at();

-- 읽기/쓰기 모두 본인 행만.
drop policy if exists profile_compare_groups_select on public.profile_compare_groups;
create policy profile_compare_groups_select
on public.profile_compare_groups
for select
to authenticated
using (id = auth.uid());

drop policy if exists profile_compare_groups_insert on public.profile_compare_groups;
create policy profile_compare_groups_insert
on public.profile_compare_groups
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profile_compare_groups_update on public.profile_compare_groups;
create policy profile_compare_groups_update
on public.profile_compare_groups
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profile_compare_groups_delete on public.profile_compare_groups;
create policy profile_compare_groups_delete
on public.profile_compare_groups
for delete
to authenticated
using (id = auth.uid());

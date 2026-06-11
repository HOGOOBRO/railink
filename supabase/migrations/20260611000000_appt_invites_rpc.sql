-- 받은 약속 초대 조회 + RLS 재귀 수정.
--
-- 문제: 20260610000000_appointments.sql 의 두 SELECT 정책이 서로의 테이블을
-- 서브쿼리로 참조 → 직접 SELECT 시 "infinite recursion detected in policy"
-- (42P17). 기존 기능은 전부 SECURITY DEFINER RPC로 읽어 RLS를 우회했기에
-- 드러나지 않았고, 초대 배너가 첫 직접 SELECT 소비자가 되면서 발견됨.
--
-- 수정 1) 초대 배너 읽기를 RPC로 제공(코드베이스의 read-RPC 패턴과 일치).
-- 수정 2) 정책의 교차 서브쿼리를 SECURITY DEFINER helper로 치환해 재귀 제거
--         (helper 내부 조회는 RLS를 타지 않으므로 사이클이 끊긴다).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 받은 약속 초대(월 무관, pending) — 캘린더 초대 배너용 읽기 RPC.
--    초대받은 group 약속의 참여자는 제목 열람 자격이 있으므로 마스킹 불필요.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.my_pending_appt_invites()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',      a.id,
      'date',    to_char(a.appt_date, 'YYYY-MM-DD'),
      'title',   a.title,
      'ownerId', a.owner_id
    ) order by a.appt_date
  ), '[]'::jsonb)
  from public.appointment_participants ap
  join public.appointments a on a.id = ap.appointment_id
  where ap.user_id = auth.uid()
    and ap.status = 'pending';
$$;

grant execute on function public.my_pending_appt_invites() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) RLS 재귀 제거 — helper는 RLS 미적용(SECURITY DEFINER)이라 정책 평가가
--    다른 테이블의 정책으로 번지지 않는다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_appt_member(p_appointment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.appointment_participants
    where appointment_id = p_appointment_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_appt_owner(p_appointment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.appointments
    where id = p_appointment_id and owner_id = auth.uid()
  );
$$;

grant execute on function public.is_appt_member(uuid) to authenticated;
grant execute on function public.is_appt_owner(uuid) to authenticated;

drop policy if exists appointments_select_member on public.appointments;
create policy appointments_select_member
on public.appointments
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_appt_member(id)
);

drop policy if exists appt_participants_select on public.appointment_participants;
create policy appt_participants_select
on public.appointment_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_appt_owner(appointment_id)
);

-- 약속(appointments) 하드닝 — 2026-06-11 보안/정합성 리뷰 후속.
--
-- 1) create_appointment: 관계 게이트(accepted share 양방향 중 하나 필수) +
--    인원/길이 캡 — 임의 유저에게 무제한 초대를 꽂을 수 있던 스팸 벡터 차단.
-- 2) respond_appointment: null 응답 거부, 소유자 셀프 응답 거부, 0행 매치 시
--    에러(이전엔 남의 약속 id로 호출해도 조용히 "성공").
-- 3) delete_appointment: 미인증 가드 명시.
-- 4) appointments_for_month: 내가 거절한 약속은 내 피드에서 제외 — 이전엔
--    거절해도 제목/장소/메모가 영원히 계속 내려왔다(거절이 사실상 장식).
-- 5) is_appt_member: declined 제외(직접 SELECT 가시성도 동일 원칙).
-- 6) my_pending_appt_invites: 지난 날짜(KST 기준) 초대 제외 + group 한정.
-- 7) 모든 약속 함수에서 public/anon 실행권 회수(authenticated만).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) create_appointment — 게이트/캡 추가 (시그니처 동일, 본문 교체)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_appointment(
  p_type       text,
  p_date       date,
  p_title      text,
  p_start      text,
  p_end        text,
  p_place      text,
  p_memo       text,
  p_visibility text,
  p_participants uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_pid uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_type not in ('group','solo') then raise exception 'invalid type'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'title required'; end if;
  -- 길이 캡(악성 페이로드/저장 비대 방지; UI는 이보다 짧게 쓴다)
  if length(btrim(p_title)) > 100 then raise exception '제목이 너무 길어요.'; end if;
  if length(coalesce(p_place, '')) > 200 then raise exception '장소가 너무 길어요.'; end if;
  if length(coalesce(p_memo,  '')) > 1000 then raise exception '메모가 너무 길어요.'; end if;
  if p_type = 'group'
     and coalesce(array_length(p_participants, 1), 0) > 10 then
    raise exception '초대 인원이 너무 많아요.';
  end if;

  -- 관계 게이트: group 초대 대상은 나와 accepted share(어느 방향이든)가 있는
  -- 동료만 — 위저드도 비교 그룹(=share 기반)에서만 고르므로 UX와 일치한다.
  if p_type = 'group' and p_participants is not null then
    foreach v_pid in array p_participants loop
      if v_pid is not null and v_pid <> v_uid then
        if not exists (
          select 1 from public.schedule_shares s
          where s.status = 'accepted'
            and ((s.owner_id = v_uid and s.viewer_id = v_pid)
              or (s.owner_id = v_pid and s.viewer_id = v_uid))
        ) then
          raise exception '일정을 공유 중인 동료만 초대할 수 있어요.';
        end if;
      end if;
    end loop;
  end if;

  insert into public.appointments (owner_id, type, appt_date, title, start_time, end_time, place, memo, visibility)
  values (
    v_uid, p_type, p_date, btrim(p_title),
    nullif(btrim(coalesce(p_start, '')), ''),
    nullif(btrim(coalesce(p_end,   '')), ''),
    nullif(btrim(coalesce(p_place, '')), ''),
    nullif(btrim(coalesce(p_memo,  '')), ''),
    case when p_type = 'solo' then coalesce(p_visibility, 'busy') else null end
  )
  returning id into v_id;

  -- owner is always an accepted participant
  insert into public.appointment_participants (appointment_id, user_id, status)
  values (v_id, v_uid, 'accepted');

  -- group: invite the rest as pending (skip self / dups)
  if p_type = 'group' and p_participants is not null then
    foreach v_pid in array p_participants loop
      if v_pid is not null and v_pid <> v_uid then
        insert into public.appointment_participants (appointment_id, user_id, status)
        values (v_id, v_pid, 'pending')
        on conflict (appointment_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) respond_appointment — 명시적 가드 + 0행 에러
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.respond_appointment(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_accept is null then raise exception 'invalid response'; end if;
  select owner_id into v_owner from public.appointments where id = p_id;
  if v_owner = v_uid then raise exception 'owner cannot respond'; end if;

  update public.appointment_participants
     set status = case when p_accept then 'accepted' else 'declined' end
   where appointment_id = p_id
     and user_id = v_uid;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception '응답할 초대를 찾지 못했어요.'; end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) delete_appointment — 미인증 가드
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_appointment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- owner only (cascade removes participants)
  delete from public.appointments where id = p_id and owner_id = auth.uid();
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) appointments_for_month — 내가 거절한 약속은 내 피드에서 제외
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.appointments_for_month(p_year int, p_month int)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',          v.id,
      'ownerId',     v.owner_id,
      'type',        v.type,
      'date',        to_char(v.appt_date, 'YYYY-MM-DD'),
      'title',       case when v.entitled then v.title else null end,
      'start',       v.start_time,
      'end',         v.end_time,
      'place',       case when v.entitled then v.place else null end,
      'memo',        case when v.entitled then v.memo  else null end,
      'visibility',  v.visibility,
      'myStatus',    (select ap.status from public.appointment_participants ap
                       where ap.appointment_id = v.id and ap.user_id = auth.uid()),
      'participants', (
        select coalesce(jsonb_agg(jsonb_build_object('uid', ap.user_id, 'status', ap.status)), '[]'::jsonb)
        from public.appointment_participants ap where ap.appointment_id = v.id
      )
    )
  ), '[]'::jsonb)
  from (
    select a.*,
      (
        a.owner_id = auth.uid()
        or exists (select 1 from public.appointment_participants ap
                   where ap.appointment_id = a.id and ap.user_id = auth.uid())
        or (a.type = 'solo' and a.visibility = 'title'
            and exists (select 1 from public.schedule_shares s
                        where s.owner_id = a.owner_id and s.viewer_id = auth.uid() and s.status = 'accepted'))
      ) as entitled
    from public.appointments a
    where a.appt_date >= make_date(p_year, p_month, 1)
      and a.appt_date <  (make_date(p_year, p_month, 1) + interval '1 month')::date
      and (
        a.owner_id = auth.uid()
        or exists (select 1 from public.appointment_participants ap
                   where ap.appointment_id = a.id and ap.user_id = auth.uid())
        or (a.type = 'solo'
            and exists (select 1 from public.schedule_shares s
                        where s.owner_id = a.owner_id and s.viewer_id = auth.uid() and s.status = 'accepted'))
      )
      -- 내가 거절한 약속은 내려보내지 않는다(소유자는 자기 행이 accepted라 영향 없음)
      and not exists (select 1 from public.appointment_participants apx
                      where apx.appointment_id = a.id
                        and apx.user_id = auth.uid()
                        and apx.status = 'declined')
  ) v;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) is_appt_member — declined 제외(직접 SELECT 가시성 동일 원칙)
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
    where appointment_id = p_appointment_id
      and user_id = auth.uid()
      and status <> 'declined'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) my_pending_appt_invites — 지난 초대 제외(KST) + group 한정
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
    and ap.status = 'pending'
    and a.type = 'group'
    and a.appt_date >= (now() at time zone 'Asia/Seoul')::date;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) 실행권 정리 — Supabase 기본값이 public(anon 포함)에 EXECUTE를 주므로 회수.
--    (현재도 auth.uid()=null이라 실해는 없지만 명시적으로 잠근다.)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.create_appointment(text, date, text, text, text, text, text, text, uuid[]) from public, anon;
revoke all on function public.delete_appointment(uuid) from public, anon;
revoke all on function public.respond_appointment(uuid, boolean) from public, anon;
revoke all on function public.appointments_for_month(int, int) from public, anon;
revoke all on function public.my_pending_appt_invites() from public, anon;
revoke all on function public.is_appt_member(uuid) from public, anon;
revoke all on function public.is_appt_owner(uuid) from public, anon;

grant execute on function public.create_appointment(text, date, text, text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.delete_appointment(uuid) to authenticated;
grant execute on function public.respond_appointment(uuid, boolean) to authenticated;
grant execute on function public.appointments_for_month(int, int) to authenticated;
grant execute on function public.my_pending_appt_invites() to authenticated;
grant execute on function public.is_appt_member(uuid) to authenticated;
grant execute on function public.is_appt_owner(uuid) to authenticated;

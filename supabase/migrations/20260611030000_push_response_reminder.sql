-- 푸시 알림 확장 — 초대 응답 알림 + 당일 아침 리마인더.
--
-- 1) 응답 알림: appointment_participants가 pending→accepted/declined로 바뀌면
--    약속 소유자에게 "OOO 님이 수락/거절했어요" 푸시.
-- 2) 리마인더: pg_cron이 매일 23:00 UTC(= 08:00 KST)에 그날(KST) 약속의
--    accepted 참여자 전원(소유자 포함, solo 포함)에게 "오늘 약속이 있어요".
--
-- 발송은 기존 /api/push-invite 재사용 — kind 필드로 문구 분기(API가 조립).
-- 모든 http_post는 예외 무시(best-effort): 알림 실패가 본 동작을 막지 않는다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 초대 응답 → 소유자에게 푸시
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_appt_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_date  date;
  v_owner uuid;
  v_actor text;
begin
  select a.title, a.appt_date, a.owner_id
    into v_title, v_date, v_owner
  from public.appointments a
  where a.id = new.appointment_id;

  -- 소유자 본인 행(이론상 pending이 아니지만)·소실된 약속은 무시
  if v_owner is null or v_owner = new.user_id then return new; end if;

  select p.name into v_actor from public.profiles p where p.id = new.user_id;

  begin
    perform net.http_post(
      url     := 'https://railink.app/api/push-invite',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', '9b007facb12a8bc9f2570e7f558909a9e35167f20d09aa94'
      ),
      body    := jsonb_build_object(
        'userId',    v_owner,
        'kind',      new.status,            -- 'accepted' | 'declined'
        'title',     v_title,
        'date',      to_char(v_date, 'YYYY-MM-DD'),
        'actorName', coalesce(nullif(v_actor, ''), '동료')
      )
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists appt_response_push on public.appointment_participants;
create trigger appt_response_push
after update on public.appointment_participants
for each row
when (old.status = 'pending' and new.status in ('accepted', 'declined'))
execute function public.notify_appt_response();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 당일 리마인더 — 구독 있는 사람에게만, 약속 1건당 1푸시
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.remind_today_appointments()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select ap.user_id, a.title, a.start_time
    from public.appointments a
    join public.appointment_participants ap on ap.appointment_id = a.id
    where a.appt_date = (now() at time zone 'Asia/Seoul')::date
      and ap.status = 'accepted'
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = ap.user_id)
  loop
    begin
      perform net.http_post(
        url     := 'https://railink.app/api/push-invite',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-push-secret', '9b007facb12a8bc9f2570e7f558909a9e35167f20d09aa94'
        ),
        body    := jsonb_build_object(
          'userId', r.user_id,
          'kind',   'reminder',
          'title',  r.title,
          'start',  r.start_time
        )
      );
    exception when others then
      null; -- 한 건 실패가 나머지 발송을 막지 않게
    end;
  end loop;
end;
$$;

-- 클라이언트가 부를 일 없는 내부 함수 — 실행권을 모두 회수(postgres/cron만)
revoke all on function public.notify_appt_response() from public, anon, authenticated;
revoke all on function public.remind_today_appointments() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) pg_cron 스케줄 — 매일 23:00 UTC = 08:00 KST (재실행 안전: 기존 잡 제거 후 등록)
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('appt-daily-reminder');
exception when others then
  null; -- 처음 실행이라 잡이 없으면 무시
end;
$$;

select cron.schedule(
  'appt-daily-reminder',
  '0 23 * * *',
  $$select public.remind_today_appointments()$$
);

-- 웹 푸시 알림 — 약속 초대가 도착하면 브라우저/PWA로 푸시.
--
-- 구조: 초대 INSERT(pending) → 트리거 → pg_net으로 Vercel API(/api/push-invite)
-- 호출 → API가 service role로 구독을 읽어 VAPID web-push 발송.
--
-- 보안 모델: push_subscriptions는 RLS만 켜고 정책을 만들지 않는다 — 클라이언트
-- 직접 SELECT/INSERT 불가. 쓰기는 SECURITY DEFINER RPC(본인 행만), 읽기는
-- service role(RLS 우회)만. 엔드포인트 URL은 사실상 자격증명이라 노출 금지.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 구독 저장소
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  endpoint   text primary key,             -- 브라우저 푸시 엔드포인트(기기/브라우저당 1개)
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- 정책 없음(의도): authenticated의 직접 접근 차단. service role은 RLS를 우회한다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 구독 등록/해지 RPC (본인 것만)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(p_endpoint, '') = '' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or length(p_p256dh) > 300
     or coalesce(p_auth, '') = '' or length(p_auth) > 100 then
    raise exception 'invalid subscription';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  -- on conflict에 user_id 갱신: 같은 브라우저에서 다른 계정으로 로그인하면
  -- 구독 소유권이 현재 계정으로 넘어간다(한 기기 = 마지막 로그인 계정의 알림).
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) 초대 트리거 → Vercel 발송 API 호출 (pg_net)
--    실패해도 약속 생성을 막지 않는다(알림은 best-effort).
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_appt_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_date  date;
  v_owner_name text;
begin
  select a.title, a.appt_date, p.name
    into v_title, v_date, v_owner_name
  from public.appointments a
  left join public.profiles p on p.id = a.owner_id
  where a.id = new.appointment_id;

  begin
    perform net.http_post(
      url     := 'https://railink.app/api/push-invite',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', '9b007facb12a8bc9f2570e7f558909a9e35167f20d09aa94'
      ),
      body    := jsonb_build_object(
        'userId',    new.user_id,
        'title',     v_title,
        'date',      to_char(v_date, 'YYYY-MM-DD'),
        'ownerName', coalesce(nullif(v_owner_name, ''), '동료')
      )
    );
  exception when others then
    null; -- pg_net 미설치/일시 장애 → 푸시만 생략
  end;
  return new;
end;
$$;

drop trigger if exists appt_invite_push on public.appointment_participants;
create trigger appt_invite_push
after insert on public.appointment_participants
for each row
when (new.status = 'pending')
execute function public.notify_appt_invite();

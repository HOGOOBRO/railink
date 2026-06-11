import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

/* 약속 푸시 발송 — DB 트리거/크론(pg_net)이 호출한다. kind별 문구는 여기서 조립.
 *   invite(기본)  초대 도착          → notify_appt_invite 트리거
 *   accepted/declined  초대 응답     → notify_appt_response 트리거 (받는 사람: 약속 소유자)
 *   reminder      당일 아침 리마인더 → remind_today_appointments (pg_cron, 08:00 KST)
 *
 * 인증: 트리거에 박힌 공유 시크릿(x-push-secret) ↔ PUSH_WEBHOOK_SECRET 환경변수.
 * 구독 조회: service role(RLS 우회) — push_subscriptions는 클라이언트 정책이 없다.
 * 죽은 구독(404/410: 브라우저에서 알림 꺼짐/앱 삭제)은 발송 중 바로 정리한다.
 *
 * 필요한 Vercel 환경변수: PUSH_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (로컬은 .env.local에 있음)
 */

type PushKind = 'invite' | 'accepted' | 'declined' | 'reminder'

function buildCopy(kind: PushKind, p: { title?: string; date?: string; ownerName?: string; actorName?: string; start?: string }) {
  const appt = p.title ?? '약속'
  switch (kind) {
    case 'accepted':
      return { title: `${p.actorName ?? '동료'} 님이 수락했어요`, body: `${p.date ?? ''} "${appt}" 약속에 함께해요` }
    case 'declined':
      return { title: `${p.actorName ?? '동료'} 님이 거절했어요`, body: `${p.date ?? ''} "${appt}" 약속에 참여하지 못해요` }
    case 'reminder':
      return { title: '오늘 약속이 있어요', body: p.start ? `${p.start} · "${appt}"` : `"${appt}"` }
    default:
      return { title: '약속 초대가 도착했어요', body: `${p.ownerName ?? '동료'} 님이 ${p.date ?? ''} "${appt}"에 초대했어요` }
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!vapidPublic || !vapidPrivate || !serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'push not configured' }, { status: 503 })
  }

  let body: {
    userId?: string; kind?: string
    title?: string; date?: string; ownerName?: string; actorName?: string; start?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }
  const { userId } = body
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }
  const kind: PushKind = body.kind === 'accepted' || body.kind === 'declined' || body.kind === 'reminder'
    ? body.kind : 'invite'

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (error) return NextResponse.json({ error: 'subscription lookup failed' }, { status: 500 })
  if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 })

  webpush.setVapidDetails('mailto:wlsgus11117@gmail.com', vapidPublic, vapidPrivate)
  const copy = buildCopy(kind, body)
  const payload = JSON.stringify({ ...copy, url: '/calendar' })

  let sent = 0
  await Promise.all(
    subs.map(s =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          // 미전달 폐기: 리마인더는 당일 내(6h)만 의미, 나머지는 하루
          { TTL: kind === 'reminder' ? 60 * 60 * 6 : 60 * 60 * 24 },
        )
        .then(() => { sent++ })
        .catch(async (err: { statusCode?: number }) => {
          // 만료/철회된 구독은 저장소에서 제거(다음 발송부터 시도 안 함)
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          }
        }),
    ),
  )
  return NextResponse.json({ ok: true, sent })
}

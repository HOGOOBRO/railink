import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

/* 약속 초대 푸시 발송 — DB 트리거(notify_appt_invite, pg_net)가 호출한다.
 *
 * 인증: 트리거에 박힌 공유 시크릿(x-push-secret) ↔ PUSH_WEBHOOK_SECRET 환경변수.
 * 구독 조회: service role(RLS 우회) — push_subscriptions는 클라이언트 정책이 없다.
 * 죽은 구독(404/410: 브라우저에서 알림 꺼짐/앱 삭제)은 발송 중 바로 정리한다.
 *
 * 필요한 Vercel 환경변수: PUSH_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (로컬은 .env.local에 있음)
 */

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

  let body: { userId?: string; title?: string; date?: string; ownerName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }
  const { userId, title, date, ownerName } = body
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

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
  const payload = JSON.stringify({
    title: '약속 초대가 도착했어요',
    body: `${ownerName ?? '동료'} 님이 ${date ?? ''} "${title ?? '약속'}"에 초대했어요`,
    url: '/calendar',
  })

  let sent = 0
  await Promise.all(
    subs.map(s =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24 }, // 하루 지난 미전달 알림은 폐기
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

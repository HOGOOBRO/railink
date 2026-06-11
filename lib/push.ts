/* 웹 푸시 구독 — 약속 초대 알림.
 *
 * 흐름: 권한 요청 → SW pushManager 구독(VAPID 공개키) → 구독 정보를
 * save_push_subscription RPC로 저장(본인 행만, 테이블 직접 접근은 RLS로 차단).
 * 발송은 서버(트리거 → /api/push-invite)가 한다.
 *
 * iOS 제약: Safari는 홈 화면에 PWA로 설치된 경우에만(16.4+) 푸시를 지원한다 —
 * 브라우저 탭에서는 isPushSupported()가 false라 UI가 알아서 숨는다.
 */

import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export type PushStatus = 'unsupported' | 'denied' | 'enabled' | 'disabled'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    VAPID_PUBLIC_KEY !== ''
  )
}

/** 현재 기기의 푸시 상태. enabled = 권한 허용 + 활성 구독 존재. */
export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'disabled'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'enabled' : 'disabled'
}

/** 권한 요청 → 구독 → 서버 저장. 결과 상태를 돌려준다. */
export async function enablePush(): Promise<{ status: PushStatus; message?: string }> {
  if (!isPushSupported()) return { status: 'unsupported' }
  const perm = await Notification.requestPermission()
  if (perm === 'denied') return { status: 'denied', message: '브라우저 설정에서 알림이 차단돼 있어요.' }
  if (perm !== 'granted') return { status: 'disabled' }

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
  })
  if (error) {
    // 서버 저장 실패 → 브라우저 구독도 원복(반쪽 상태 방지)
    await sub.unsubscribe().catch(() => {})
    return { status: 'disabled', message: '알림 등록에 실패했어요. 잠시 후 다시 시도해 주세요.' }
  }
  return { status: 'enabled' }
}

/** 구독 해지(브라우저 + 서버 양쪽). */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint }).then(() => {}, () => {})
}

/** VAPID 공개키(base64url) → PushManager가 요구하는 Uint8Array.
 *  (BufferSource 타입을 만족하려면 명시적 ArrayBuffer 기반이어야 한다.) */
function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

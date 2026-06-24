// 설치형(standalone) 실행을 본인 계정에 기록 — PWA 설치 유저 수를 uid 단위로
// 정확히 세기 위한 신호. GA4(pwa_install·pwa_launch)는 쿠키/디바이스 기준이라
// 중복·누락이 있어 "몇 명"을 정확히 못 센다. standalone으로 켜질 때
// record_pwa_launch(platform) RPC를 불러 public.pwa_launches에 upsert한다
// (마이그레이션 20260620062742_create_pwa_launches.sql).
//
// 전부 best-effort: standalone이 아니거나, 로그아웃·데모거나, 호출이 실패해도
// 조용히 무시한다 — 텔레메트리가 UX에 영향을 주면 안 된다.

import { supabase } from './supabase'
import { getCurrentSession } from './auth'

// 콜드 런치 1회당 1번만 기록(= launch_count 의미와 일치). sessionStorage라
// 앱을 완전히 닫았다 다시 켜면(=새 런치) 다시 카운트된다. 같은 세션 내 소프트
// 리로드의 중복 기록만 막는다.
const SESSION_KEY = 'railink_pwa_pinged'

/** display-mode standalone(설치 앱) 여부. navigator.standalone은 iOS 홈화면 설치
 *  케이스 — 이게 있어야 iOS 설치도 잡힌다(Analytics.tsx의 판정과 동일). */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

/** 기기 종류(집계 세그먼트용). 정확한 OS 판별이 아니라 대략 분류면 충분. */
function detectPlatform(): string {
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua) || (navigator as { standalone?: boolean }).standalone === true) {
    return 'ios'
  }
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

function alreadyPingedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false // sessionStorage 막힘(시크릿 등) → 그냥 기록 시도
  }
}

/** standalone + 로그인 세션일 때 설치 신호를 이번 런치에 1회 기록. */
export async function recordPwaLaunchIfInstalled(): Promise<void> {
  if (!isStandalone() || alreadyPingedThisSession()) return
  try {
    const session = await getCurrentSession()
    if (!session || session.isDemo) return // 로그아웃·데모는 귀속 불가 → 스킵
    const { error } = await supabase.rpc('record_pwa_launch', { p_platform: detectPlatform() })
    if (error) return
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
  } catch {
    /* best-effort: 무시 */
  }
}

'use client'

import { useEffect } from 'react'
import { getCurrentSession, getCachedSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/** 로그인 사용자의 소속 항공사(session.airline)에 맞춰 <html data-airline>를 세팅한다.
 *  → globals.css의 항공사 테마(--brand/--accent 스케일)가 컴포넌트 수정 없이 적용됨.
 *  항공사가 없으면(KTX·기타) 속성을 제거해 기본 RaiLink 네이비로 돌아간다.
 *  (app) 영역에만 마운트되므로 랜딩/가입 화면 색에는 영향이 없다.
 *
 *  레이스 주의: getCurrentSession은 비동기라, 방금 로그인했거나 클라 네비게이션 직후엔
 *  supabase auth 세션이 아직 hydration 안 돼 airline을 못 읽는다. 마운트 1회만 호출하면
 *  그 한 번을 놓치고 끝나(새로고침 전엔 테마 미적용) → ① 캐시된 세션으로 즉시 적용하고
 *  ② auth 상태가 준비/변경될 때마다(onAuthStateChange) 다시 resolve해 반영한다. */
export function AirlineTheme() {
  useEffect(() => {
    let alive = true
    const apply = (airline: string | null | undefined) => {
      if (!alive) return
      const el = document.documentElement
      if (airline) el.dataset.airline = airline
      else delete el.dataset.airline
    }
    // ① 직전 세션 캐시가 있으면 즉시 적용(클라 네비게이션 시 깜빡임 0).
    apply(getCachedSession()?.airline)
    // ② 최신 세션을 resolve해 반영.
    const resolve = () => getCurrentSession().then(s => apply(s?.airline)).catch(() => {})
    resolve()
    // ③ auth가 늦게 준비되거나 로그인/로그아웃되면 재적용(한 번만 묻고 마는 레이스 방지).
    const { data: sub } = supabase.auth.onAuthStateChange(() => resolve())
    return () => {
      alive = false
      sub.subscription.unsubscribe()
      delete document.documentElement.dataset.airline
    }
  }, [])
  return null
}

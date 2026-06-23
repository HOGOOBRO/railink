'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getCurrentSession, getCachedSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/** 로그인 사용자의 소속 항공사(session.airline)에 맞춰 <html data-airline>를 세팅한다.
 *  → globals.css의 항공사 테마(--brand/--accent 스케일)가 컴포넌트 수정 없이 적용됨.
 *  항공사가 없으면(KTX·기타) 속성을 제거해 기본 RaiLink 네이비로 돌아간다.
 *  (app) 영역에만 마운트되므로 랜딩/가입 화면 색에는 영향이 없다.
 *
 *  재판단 트리거 3개(하나라도 놓치면 새로고침 전까지 테마가 안 바뀜):
 *   ① 마운트 시 캐시 세션으로 즉시 적용(클라 네비게이션 깜빡임 0).
 *   ② getCurrentSession resolve — auth가 늦게 hydration돼도 반영.
 *   ③ onAuthStateChange — 로그인/로그아웃/토큰갱신.
 *  그리고 pathname을 deps에 둬 페이지 이동마다 재판단한다. 온보딩 완료
 *  (completeOnboarding → router.replace('/calendar'))는 auth 이벤트가 아니라
 *  프로필 변경이라 onAuthStateChange가 안 울린다 → pathname 변경으로 재판단해야
 *  방금 고른 항공사 색이 새로고침 없이 바로 적용된다. */
export function AirlineTheme() {
  const pathname = usePathname()
  useEffect(() => {
    let alive = true
    const apply = (airline: string | null | undefined) => {
      if (!alive) return
      const el = document.documentElement
      if (airline) el.dataset.airline = airline
      else delete el.dataset.airline
    }
    apply(getCachedSession()?.airline)
    const resolve = () => getCurrentSession().then(s => apply(s?.airline)).catch(() => {})
    resolve()
    const { data: sub } = supabase.auth.onAuthStateChange(() => resolve())
    return () => {
      alive = false
      sub.subscription.unsubscribe()
      delete document.documentElement.dataset.airline
    }
  }, [pathname])
  return null
}

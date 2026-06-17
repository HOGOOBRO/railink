'use client'

import { useEffect } from 'react'
import { getCurrentSession } from '@/lib/auth'

/** 로그인 사용자의 소속 항공사(session.airline)에 맞춰 <html data-airline>를 세팅한다.
 *  → globals.css의 항공사 테마(--brand/--accent 스케일)가 컴포넌트 수정 없이 적용됨.
 *  항공사가 없으면(KTX·기타) 속성을 제거해 기본 RaiLink 네이비로 돌아간다.
 *  (app) 영역에만 마운트되므로 랜딩/가입 화면 색에는 영향이 없다. */
export function AirlineTheme() {
  useEffect(() => {
    let alive = true
    getCurrentSession().then(s => {
      if (!alive) return
      const el = document.documentElement
      if (s?.airline) el.dataset.airline = s.airline
      else delete el.dataset.airline
    })
    return () => {
      alive = false
      delete document.documentElement.dataset.airline
    }
  }, [])
  return null
}

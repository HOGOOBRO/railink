'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth'

/** 랜딩(/)의 세션 분기. 로그인된(데모 포함) 방문자만 캘린더로 보내고, 그 외엔
 *  아무것도 렌더하지 않는다 — 랜딩 본문은 서버에서 정적으로 깔려 크롤러가
 *  항상 읽는다. 쿼리 스트링(utm_* 등)은 로그인 사용자의 page_view 귀속이
 *  끊기지 않게 그대로 들고 간다. */
export function LandingRedirect() {
  const router = useRouter()
  useEffect(() => {
    let alive = true
    getCurrentSession()
      .then(s => {
        if (alive && s) router.replace('/calendar' + window.location.search)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [router])
  return null
}

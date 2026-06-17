'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth'

/** Google 가입자가 직업(카테고리)을 아직 안 고른 경우 /welcome로 보내 앱 사용을 차단한다.
 *  (app) 영역 전체에 마운트. /welcome 자체에서는 동작하지 않는다(리다이렉트 루프 방지).
 *  이메일 가입·데모·이미 선택한 계정은 needsOnboarding=false라 그냥 통과한다. */
export function OnboardingGate() {
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (pathname === '/welcome') return
    let alive = true
    getCurrentSession().then(s => {
      if (alive && s?.needsOnboarding) router.replace('/welcome')
    })
    return () => { alive = false }
  }, [router, pathname])
  return null
}

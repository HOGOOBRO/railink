'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/auth'
import { DEMO_LOGIN } from '@/lib/demo-data'
import { track } from '@/lib/analytics'

/** "데모로 둘러보기" — 가입 없이 데모 계정으로 바로 캘린더 체험. 로그인 페이지의
 *  데모 흐름(login(DEMO) → /calendar)을 한 번에 실행한다. login()이 seedDemo +
 *  데모 세션 설정 + demo_login GA 이벤트까지 처리한다. 추가로 landing_cta(action:
 *  demo)를 쏴서 랜딩 위치별 데모 클릭을 demo_login과 별개로 구분 집계한다. */
export function DemoButton({
  className = '',
  location,
  children,
}: {
  className?: string
  location: 'hero' | 'final'
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function enterDemo() {
    if (loading) return
    setLoading(true)
    track('landing_cta', { action: 'demo', location })
    try {
      await login(DEMO_LOGIN.email, DEMO_LOGIN.pw)
      router.push('/calendar')
    } catch {
      setLoading(false)
    }
  }

  return (
    <button type="button" onClick={enterDemo} disabled={loading} className={className}>
      {loading ? '들어가는 중…' : children}
    </button>
  )
}

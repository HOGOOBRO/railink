'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/auth'
import { DEMO_LOGIN } from '@/lib/demo-data'

/** "데모로 둘러보기" — 가입 없이 데모 계정으로 바로 캘린더 체험. 로그인 페이지의
 *  데모 흐름(login(DEMO) → /calendar)을 한 번에 실행한다. login()이 seedDemo +
 *  데모 세션 설정 + demo_login GA 이벤트까지 처리한다. */
export function DemoButton({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function enterDemo() {
    if (loading) return
    setLoading(true)
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

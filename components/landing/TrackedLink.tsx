'use client'

import Link from 'next/link'
import { track } from '@/lib/analytics'

/** 랜딩 CTA 링크 — 클릭 시 GA4 'landing_cta' 이벤트(action·location)를 쏜다.
 *  내부 라우트(/signup·/login)는 클라이언트 내비라 unload가 없어 이벤트가
 *  안전히 전송된다. 해시(#magic)도 그대로 동작. */
export function TrackedLink({
  href,
  action,
  location,
  className,
  children,
}: {
  href: string
  action: 'signup' | 'login' | 'learn_more'
  location: 'hero' | 'final' | 'nav'
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => track('landing_cta', { action, location })}
    >
      {children}
    </Link>
  )
}

'use client'

import { usePathname } from 'next/navigation'

/** 앱의 모든 화면은 480px 모바일 프레임(.app-frame) 안에 렌더된다. 단 랜딩(/)
 *  만은 예외 — 1200px 풀폭 마케팅 페이지라 프레임을 적용하지 않는다. 경로는
 *  서버 렌더 시점에도 확정돼 하이드레이션 불일치가 없다. */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/') return <>{children}</>
  return <div className="app-frame">{children}</div>
}

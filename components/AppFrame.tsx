'use client'

import { usePathname } from 'next/navigation'

/** 앱의 모든 화면은 480px 모바일 프레임(.app-frame) 안에 렌더된다. 예외:
 *  - 랜딩(/): 1200px 풀폭 마케팅 페이지
 *  - 법률 문서(/legal/*): 랜딩 푸터에서 PC로 열 때 480px 모바일 카드면 어색해서,
 *    풀폭으로 빼고 페이지 자체가 PC 가독 폭으로 가운데 정렬한다(LegalPage).
 *  경로는 서버 렌더 시점에도 확정돼 하이드레이션 불일치가 없다. */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/' || pathname.startsWith('/legal')) return <>{children}</>
  return <div className="app-frame">{children}</div>
}

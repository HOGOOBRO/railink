import type { Metadata } from 'next'

// 로그인은 sitemap에 올라간 색인 대상 — 페이지 고유 제목·설명을 단다. (페이지
// 본체는 'use client'라 metadata를 export할 수 없어 layout이 들고 있는다.)
export const metadata: Metadata = {
  title: '로그인 · 레일링크 RaiLink',
  description: '레일링크에 로그인하고 동료와 근무표를 비교해 보세요.',
  alternates: { canonical: 'https://railink.app/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

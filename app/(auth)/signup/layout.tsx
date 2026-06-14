import type { Metadata } from 'next'

// 가입은 sitemap에 올라간 색인 대상 — 페이지 고유 제목·설명을 단다. (페이지
// 본체는 'use client'라 metadata를 export할 수 없어 layout이 들고 있는다.)
export const metadata: Metadata = {
  title: '가입하기 · 레일링크 RaiLink',
  description: '레일링크에 무료로 가입하고 근무표를 등록해 보세요. 이메일 또는 Google 계정으로 1분이면 끝나요.',
  alternates: { canonical: 'https://railink.app/signup' },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

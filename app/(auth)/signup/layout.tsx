import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

// 가입은 sitemap에 올라간 색인 대상 — 페이지 고유 제목·설명을 단다. (페이지
// 본체는 'use client'라 metadata를 export할 수 없어 layout이 들고 있는다.)
// 쿠키 없는 크롤러는 기본 로케일(ko)로 떨어져 기존 한국어 SEO가 그대로 유지된다.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: t('signupTitle'),
    description: t('signupDesc'),
    alternates: { canonical: 'https://railink.app/signup' },
  }
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

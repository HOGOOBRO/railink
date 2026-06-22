'use server'

import { cookies } from 'next/headers'
import { isLocale, LOCALE_COOKIE } from './config'

// 언어 전환 — 쿠키(NEXT_LOCALE)를 서버에서 설정한다. 클라이언트에서
// document.cookie를 직접 건드리는 대신 이 액션을 호출하면, 호출 후 이어지는
// router.refresh()가 app/layout.tsx 서버 렌더를 다시 태워 새 언어가 반영된다.
// 1년 유지 — 다음 방문에도 고른 언어가 그대로다.
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return
  cookies().set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}

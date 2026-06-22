// 지원 언어 목록. 기본은 한국어. URL 프리픽스 없이 쿠키(NEXT_LOCALE)로만
// 언어를 기억하는 방식이라(수정된 라우팅·미들웨어 없음), 이 상수가 유일한
// "어떤 언어를 지원하나"의 단일 출처다.
export const locales = ['ko', 'en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'ko'

// 언어 전환 UI에 쓰는 표시 이름(각 언어의 자기 표기 — endonym).
export const localeLabels: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
}

// 클라이언트·서버 양쪽에서 같은 쿠키 이름을 쓰도록 한 곳에 둔다.
// next-intl 관례상 NEXT_LOCALE를 사용.
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}

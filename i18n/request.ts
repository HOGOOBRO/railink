import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config'

// 매 요청마다 쿠키에서 언어를 읽어 해당 언어의 문구 사전을 로드한다.
// URL에 /en 같은 프리픽스를 쓰지 않으므로 로케일은 전적으로 쿠키에서 온다.
// 쿠키가 없거나 지원하지 않는 값이면 기본 언어(한국어)로 떨어진다.
export default getRequestConfig(async () => {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})

'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { locales, localeLabels, type Locale } from '@/i18n/config'
import { setLocale } from '@/i18n/actions'

/** 한국어 ↔ English 전환. URL 프리픽스 없이 쿠키(NEXT_LOCALE)에 언어를 저장하고
 *  router.refresh()로 서버 렌더(app/layout.tsx)를 다시 태워 즉시 반영한다.
 *  쿠키는 1년 유지 — 다음 방문에도 고른 언어가 그대로다. */
export function LanguageSwitcher() {
  const router = useRouter()
  const active = useLocale() as Locale
  const t = useTranslations('settings.language')
  const [pending, startTransition] = useTransition()

  function pick(loc: Locale) {
    if (loc === active || pending) return
    startTransition(async () => {
      await setLocale(loc)
      router.refresh()
    })
  }

  return (
    <section className="mt-4">
      <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">{t('title')}</p>
      <div className="bg-surface border border-line rounded-lg overflow-hidden flex">
        {locales.map((loc, i) => (
          <button
            key={loc}
            type="button"
            onClick={() => pick(loc)}
            disabled={pending}
            aria-pressed={loc === active}
            className={`flex-1 py-3 text-callout font-semibold transition-colors ${
              i > 0 ? 'border-l border-line' : ''
            } ${loc === active ? 'bg-brand-050 text-brand' : 'text-ink-700'}`}
          >
            {localeLabels[loc]}
          </button>
        ))}
      </div>
    </section>
  )
}

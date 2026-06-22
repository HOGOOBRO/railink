'use client'

// Shared chrome for /legal/* pages.
//
// Entry paths: signup checkbox links (pre-login) and Settings → Help (post-login).
// Back button uses router.back() so it pops to wherever the user came from;
// when there's no history (deep link, fresh tab) we fall back to /settings/help.

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeftIcon } from '@/components/ui/icons'

interface LegalPageProps {
  title: string
  effectiveDate: string
  children: React.ReactNode
}

export function LegalPage({ title, effectiveDate, children }: LegalPageProps) {
  const router = useRouter()
  const t = useTranslations('legal.common')
  const [hasBack, setHasBack] = useState(true)

  useEffect(() => {
    // History API doesn't expose "is there a previous entry in this tab" — but
    // history.length===1 is a reliable enough signal that we landed here cold
    // (direct URL, new tab). In that case the back button should be a hard link.
    // SSR can't read window.history, so a lazy useState initializer would
    // hydration-mismatch; the one-shot mount read here is the right pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasBack(typeof window !== 'undefined' && window.history.length > 1)
  }, [])

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* 풀폭 바 + 안쪽 콘텐츠는 PC 가독 폭으로 가운데 정렬(모바일에선 풀폭 유지). */}
      <header className="border-b border-line bg-surface shrink-0 sticky top-0 z-10">
        <div className="mx-auto w-full max-w-[768px] h-topbar flex items-center gap-1 px-1.5">
          {hasBack ? (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label={t('back')}
              className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
            >
              <ChevronLeftIcon size={20} />
            </button>
          ) : (
            <Link
              href="/settings/help"
              aria-label={t('back')}
              className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
            >
              <ChevronLeftIcon size={20} />
            </Link>
          )}
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{title}</h3>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[768px] px-5 pt-5 pb-12 sm:pt-8">
          <p className="font-en text-[11px] tracking-wider uppercase text-ink-500 mb-1">
            {t('effectiveLabel')}
          </p>
          <p className="font-en text-callout text-ink-700 mb-4">{effectiveDate}</p>

          <p className="text-caption text-ink-500 leading-relaxed mb-6">
            {t('koreanPrevails')}
          </p>

          <article className="legal-prose">{children}</article>

          <p className="mt-10 text-caption text-ink-500 leading-relaxed">
            {t.rich('contact', {
              email: chunks => (
                <a className="text-brand font-semibold" href="mailto:hello@railink.app">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </main>
    </div>
  )
}

/* Small typographic helpers used inside Legal pages. Server-renderable. */

export function LegalArticle({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="text-[15px] font-bold text-ink-900 leading-snug">
        {number} <span className="text-ink-700">({title})</span>
      </h2>
      <div className="mt-2 text-[13px] text-ink-700 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="text-[15px] font-bold text-ink-900 leading-snug">{title}</h2>
      <div className="mt-2 text-[13px] text-ink-700 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="pl-4 list-disc space-y-1.5 marker:text-ink-300">{children}</ul>
}

export function LegalOrdered({ children }: { children: React.ReactNode }) {
  return <ol className="pl-4 list-decimal space-y-1.5 marker:text-ink-300">{children}</ol>
}

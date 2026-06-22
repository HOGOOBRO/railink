'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { BrandMark, ChevronLeftIcon, ChevronRightIcon, MailIcon } from '@/components/ui/icons'

const CONTACT_EMAIL = 'hello@railink.app'

export default function HelpPage() {
  const [open, setOpen] = useState<number>(0)
  const t = useTranslations('settings.help')

  const FAQS: { q: string; a: string }[] = [
    { q: t('faq1Q'), a: t('faq1A') },
    { q: t('faq2Q'), a: t('faq2A') },
    { q: t('faq3Q'), a: t('faq3A') },
    { q: t('faq4Q'), a: t('faq4A') },
  ]

  const TERMS: { label: string; sub?: string; href: string }[] = [
    { label: t('termsService'), sub: t('termsEffective'), href: '/legal/terms' },
    { label: t('termsPrivacy'), sub: t('termsEffective'), href: '/legal/privacy' },
    { label: t('termsOss'), href: '/legal/oss' },
  ]

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="h-topbar flex items-center gap-1 px-1.5 border-b border-line bg-surface shrink-0">
        <Link
          href="/calendar"
          aria-label={t('back')}
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('title')}</h3>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-8">
        {/* App info */}
        <section className="flex items-center gap-3 px-4 py-4 bg-surface border border-line rounded-lg">
          <div className="w-11 h-11 rounded-lg bg-brand text-ink-on-brand grid place-items-center shrink-0">
            <BrandMark size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-ink-900">RaiLink</p>
            <p className="mt-0.5 text-caption text-ink-500">{t('appDesc')}</p>
            <p className="mt-1 font-en text-[11px] text-ink-300">V1.0 · BUILD 2026.05</p>
          </div>
        </section>

        {/* FAQ */}
        <p className="mt-4 px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
          {t('faqTitle')}
        </p>
        <section className="bg-surface border border-line rounded-lg overflow-hidden">
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={i} className={i < FAQS.length - 1 ? 'border-b border-line' : ''}>
                <button
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="w-full flex items-center gap-2 px-3.5 py-3.5 text-left"
                  aria-expanded={isOpen}
                >
                  <span
                    className={`w-[22px] h-[22px] rounded-full font-en text-[11px] font-bold grid place-items-center shrink-0 ${
                      isOpen ? 'bg-brand text-ink-on-brand' : 'bg-brand-050 text-brand'
                    }`}
                  >
                    Q
                  </span>
                  <span className="flex-1 text-callout font-medium text-ink-900 leading-snug">{f.q}</span>
                  <span
                    className="text-ink-500 transition-transform duration-150"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                  >
                    <ChevronRightIcon size={14} />
                  </span>
                </button>
                {isOpen && (
                  <p className="pl-11 pr-3.5 pb-3.5 text-[13px] text-ink-700 leading-relaxed">{f.a}</p>
                )}
              </div>
            )
          })}
        </section>

        {/* 문의 — FAQ로 안 풀리면 메일로 직접. (railink.app 도메인 메일) */}
        <p className="mt-4 px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
          {t('contactTitle')}
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('contactSubject'))}`}
          className="flex items-center gap-3 px-4 py-4 bg-surface border border-line rounded-lg active:bg-bg transition-colors"
        >
          <div className="w-11 h-11 rounded-lg bg-brand-050 text-brand grid place-items-center shrink-0">
            <MailIcon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-callout font-bold text-ink-900">{t('contactCta')}</p>
            <p className="mt-0.5 text-caption text-ink-500">{t('contactDesc')}</p>
            <p className="mt-1 font-en text-[11px] text-brand">{CONTACT_EMAIL}</p>
          </div>
          <span className="text-ink-300 shrink-0"><ChevronRightIcon size={16} /></span>
        </a>

        {/* Terms */}
        <p className="mt-4 px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
          {t('termsTitle')}
        </p>
        <section className="bg-surface border border-line rounded-lg overflow-hidden">
          {TERMS.map((t, i) => (
            <Link
              key={t.label}
              href={t.href}
              className={`w-full flex items-center gap-2.5 px-3.5 py-3.5 text-left active:bg-bg transition-colors ${
                i < TERMS.length - 1 ? 'border-b border-line' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-callout font-medium text-ink-900">{t.label}</p>
                {t.sub && <p className="mt-0.5 font-en text-[11px] text-ink-500">{t.sub}</p>}
              </div>
              <span className="text-ink-300"><ChevronRightIcon size={16} /></span>
            </Link>
          ))}
        </section>

        {/* Independent-app disclaimer (RaiLink is not affiliated with any carrier/operator) */}
        <section className="mt-4 px-4 py-4 rounded-lg bg-bg border border-line">
          <p className="text-caption text-ink-500 leading-relaxed">
            {t.rich('disclaimer', { b: (c) => <strong className="text-ink-700 font-semibold">{c}</strong> })}
          </p>
        </section>
      </div>
    </div>
  )
}

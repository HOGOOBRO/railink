'use client'

import { useState, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import {
  BrandMark, ChevronLeftIcon, ShareIosIcon, DotsIcon, AddSquareIcon,
} from '@/components/ui/icons'
import { getDeferredPrompt, clearDeferredPrompt } from '@/lib/pwa-install'

// §18 destination — full "add to home screen" guide for iPhone (Safari) and
// Android (Chrome). Reached from the login banner. Hybrid: when Chrome has fired
// beforeinstallprompt we surface a native one-tap install button; otherwise the
// manual step-by-step is the only path (and the only path iOS ever has).
export default function InstallGuidePage() {
  const t = useTranslations('install')
  const [canInstall, setCanInstall] = useState(false)

  useEffect(() => {
    // beforeinstallprompt can fire after mount, so listen — don't just check once.
    const evaluate = () => setCanInstall(!!getDeferredPrompt())
    evaluate()
    const onInstalled = () => setCanInstall(false)
    window.addEventListener('railink:installable', evaluate)
    window.addEventListener('railink:installed', onInstalled)
    return () => {
      window.removeEventListener('railink:installable', evaluate)
      window.removeEventListener('railink:installed', onInstalled)
    }
  }, [])

  const onNativeInstall = async () => {
    const dp = getDeferredPrompt()
    if (!dp) return
    await dp.prompt()
    await dp.userChoice
    clearDeferredPrompt()
    setCanInstall(false)
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-bg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <main className="flex-1 overflow-y-auto">
        {/* hero on white surface — reads as a distinct top zone */}
        <div className="bg-surface border-b border-line px-6 pt-3 pb-7">
          <div className="flex items-center gap-2 mb-7">
            <Link
              href="/login"
              aria-label={t('back')}
              className="-ml-2 w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
            >
              <ChevronLeftIcon size={20} />
            </Link>
            <BrandMark size={20} className="text-brand" />
            <span className="font-en text-[13px] font-semibold tracking-[0.08em] text-ink-500 uppercase">
              RAILINK
            </span>
          </div>

          <p className="font-en text-[11px] font-semibold tracking-[0.12em] text-brand uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 mb-3.5 text-[30px] font-extrabold tracking-[-0.02em] text-ink-900 leading-[1.15]">
            {t.rich('heroTitle', { br: () => <br /> })}
          </h1>
          <p className="text-callout text-ink-700 leading-relaxed">
            {t.rich('heroBody', { b: (chunks) => <strong className="text-ink-900">{chunks}</strong> })}
          </p>

          {canInstall && (
            <Button block onClick={onNativeInstall} className="mt-4">
              {t('installNow')}
            </Button>
          )}
        </div>

        <p className="px-6 pt-5 pb-2.5 text-[11px] font-bold tracking-wider uppercase text-ink-500">
          {t('byDeviceTitle')}
        </p>

        <div className="px-4 pb-3">
          <PlatformCard
            platform="ios"
            title={t('iosTitle')}
            browser="Safari"
            steps={[
              <>{t('iosStep1')}</>,
              <>{t.rich('iosStep2', { chip: () => <GlyphChip><ShareIosIcon size={16} /></GlyphChip> })}</>,
              <>{t.rich('iosStep3', { b: (chunks) => <strong className="text-ink-900 font-bold">{chunks}</strong> })}</>,
            ]}
            warning={<>{t.rich('iosWarning', { b: (chunks) => <strong className="font-bold">{chunks}</strong> })}</>}
          />
        </div>

        <div className="px-4 pb-3">
          <PlatformCard
            platform="android"
            title={t('androidTitle')}
            browser="Chrome"
            steps={[
              <>{t('androidStep1')}</>,
              <>
                {t.rich('androidStep2', {
                  chip: (chunks) => (
                    <span className="inline-flex items-center gap-1 align-middle rounded-pill bg-brand-050 text-brand px-2 py-0.5 text-caption font-bold">
                      <AddSquareIcon size={12} /> {chunks}
                    </span>
                  ),
                })}
              </>,
              <>{t.rich('androidStep3', {
                menu: () => <GlyphChip><DotsIcon size={16} /></GlyphChip>,
                b: (chunks) => <strong className="text-ink-900 font-bold">{chunks}</strong>,
              })}</>,
            ]}
          />
        </div>

        {/* value-prop strip */}
        {/* (no contact email — RaiLink is an independent app, not an official Korail service) */}
        <div className="mx-4 mt-3 mb-8 p-4 rounded-[14px] bg-brand-050 border border-brand-100">
          <p className="text-[13px] font-bold text-brand-700 mb-2">{t('valueTitle')}</p>
          <ul className="flex flex-col gap-1.5 text-caption text-ink-700 leading-snug">
            {[
              [t('value1Head'), t('value1Sub')],
              [t('value2Head'), t('value2Sub')],
            ].map(([head, sub]) => (
              <li key={head} className="flex items-start gap-2">
                <span className="shrink-0 mt-[5px] w-1 h-1 rounded-full bg-brand" />
                <div>
                  <strong className="text-ink-900 font-semibold">{head}</strong>
                  <span className="text-ink-500"> · {sub}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

      </main>
    </div>
  )
}

// Small rounded chip wrapping an icon inline in step text.
function GlyphChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center align-middle w-7 h-7 rounded-sm bg-brand-050 border border-brand-100 text-brand mx-0.5">
      {children}
    </span>
  )
}

function PlatformCard({
  platform, title, browser, steps, warning,
}: {
  platform: 'ios' | 'android'
  title: string
  browser: string
  steps: ReactNode[]
  warning?: ReactNode
}) {
  // iOS tile = brand navy, Android tile = compare-palette green, for instant distinction.
  const tile = platform === 'ios'
    ? { cls: 'bg-brand text-ink-on-brand', label: 'iOS' }
    : { cls: 'bg-c2 text-white', label: 'AOS' }

  return (
    <section className="bg-surface rounded-lg border border-line overflow-hidden">
      <header className="flex items-center gap-3 px-4 pt-4 pb-3.5 border-b border-line">
        <div className={`w-11 h-11 rounded-md grid place-items-center shrink-0 font-en font-bold text-[13px] tracking-[0.04em] ${tile.cls}`}>
          {tile.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body font-bold text-ink-900 tracking-tight">{title}</p>
          <p className="mt-0.5 font-en text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-500">{browser}</p>
        </div>
      </header>

      <ol className="py-1.5">
        {steps.map((step, i) => (
          <li key={i} className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
            <span className="shrink-0 mt-px w-[22px] h-[22px] rounded-full bg-brand-050 text-brand grid place-items-center font-en text-[11px] font-bold">
              {i + 1}
            </span>
            <div className="flex-1 text-callout leading-relaxed text-ink-700">{step}</div>
          </li>
        ))}
      </ol>

      {warning && (
        <div className="flex items-start gap-2 mx-3 mb-3 px-3 py-2.5 rounded-[10px] bg-[#FFF7ED] border border-[#FED7AA] text-caption text-[#9A3412] leading-snug">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="shrink-0 mt-px">
            <path d="M12 2 2 21h20Z" /><path d="M12 10v5" /><circle cx="12" cy="18" r=".5" fill="currentColor" />
          </svg>
          <div>{warning}</div>
        </div>
      )}
    </section>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { PhoneIcon, ChevronRightIcon, CloseIcon } from '@/components/ui/icons'

// §18 entry point — slim "add to home screen" banner pinned above the brand mark
// on the login screen. The moment right before first login is when users are most
// receptive to installing. Shown only on mobile web that isn't already installed
// and hasn't been dismissed in the last 7 days. Tapping the CTA routes to the full
// /install guide; dismissal is ✕-only (see below).
const DISMISS_KEY = 'rl.install.dismissed'
const INSTALLED_KEY = 'railink_installed'
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

export function InstallLoginBanner() {
  const t = useTranslations('installBanner')
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Gate on browser-only signals (read after mount, never during SSR).
    const evaluate = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as { standalone?: boolean }).standalone === true
      if (standalone) return
      if (!/iPhone|iPad|Android/.test(navigator.userAgent)) return
      try {
        if (localStorage.getItem(INSTALLED_KEY)) return
        const dismissedAt = Number(localStorage.getItem(DISMISS_KEY)) || 0
        if (Date.now() - dismissedAt < SEVEN_DAYS) return
      } catch { /* ignore */ }
      setShow(true)
    }
    evaluate()
  }, [])

  if (!show) return null

  // ✕ is the ONLY thing that dismisses. The CTA must just navigate — do not wire
  // it to dismiss(), or tapping "설치 방법" would hide the banner for 7 days.
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setShow(false)
  }

  // Own the top placement so login can mount us as a bare first child — when
  // hidden we render null and leave no empty gap.
  return (
    <div className="px-6 pt-3">
      <div className="flex items-center gap-3 rounded-[14px] bg-brand-050 border border-brand-100 pl-3.5 pr-3 py-3">
        <span className="w-[38px] h-[38px] rounded-[10px] bg-brand text-ink-on-brand grid place-items-center shrink-0">
          <PhoneIcon size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold tracking-tight text-brand-700">{t('title')}</p>
          <p className="mt-px font-en text-[11px] tracking-[0.04em] text-ink-500">{t('subtitle')}</p>
        </div>
        <Link
          href="/install"
          className="inline-flex items-center gap-1 rounded-pill bg-brand text-ink-on-brand px-3 py-2 text-caption font-bold shrink-0 active:scale-[.98] transition-transform"
        >
          {t('cta')} <ChevronRightIcon size={12} />
        </Link>
        <button
          onClick={dismiss}
          aria-label={t('dismiss')}
          className="w-7 h-7 grid place-items-center rounded-full text-ink-500 shrink-0"
        >
          <CloseIcon size={14} />
        </button>
      </div>
    </div>
  )
}

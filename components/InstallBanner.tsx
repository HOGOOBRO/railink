'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { BrandMark, CloseIcon } from '@/components/ui/icons'
import { getDeferredPrompt, clearDeferredPrompt } from '@/lib/pwa-install'

const DISMISS_KEY = 'railink_install_dismissed_v1'
const INSTALLED_KEY = 'railink_installed'

// Dismissible "install to home screen" CTA. Android: real install prompt.
// iOS Safari: instructions modal (Apple blocks programmatic install). Hidden
// when already installed (standalone) or previously dismissed/installed.
export function InstallBanner() {
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)
  const [iosModal, setIosModal] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true
    if (standalone) return
    try {
      if (localStorage.getItem(DISMISS_KEY) || localStorage.getItem(INSTALLED_KEY)) return
    } catch { /* ignore */ }

    // 'standalone' exists on the navigator only in iOS Safari.
    const isIosSafari = 'standalone' in window.navigator

    const evaluate = () => {
      if (getDeferredPrompt()) { setIos(false); setShow(true) }
      else if (isIosSafari) { setIos(true); setShow(true) }
    }
    evaluate()

    const onInstallable = () => evaluate()
    const onInstalled = () => setShow(false)
    window.addEventListener('railink:installable', onInstallable)
    window.addEventListener('railink:installed', onInstalled)
    return () => {
      window.removeEventListener('railink:installable', onInstallable)
      window.removeEventListener('railink:installed', onInstalled)
    }
  }, [])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setShow(false)
  }

  const onInstall = async () => {
    if (ios) { setIosModal(true); return }
    const dp = getDeferredPrompt()
    if (!dp) { setShow(false); return }
    await dp.prompt()
    const choice = await dp.userChoice
    clearDeferredPrompt()
    if (choice.outcome === 'accepted') setShow(false)
  }

  return (
    <>
      <div className="mt-2.5 flex items-center gap-3 rounded-md bg-brand-050 border border-brand-100 px-3.5 py-3">
        <span className="w-9 h-9 rounded-lg bg-brand text-ink-on-brand grid place-items-center shrink-0">
          <BrandMark size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-callout font-bold text-ink-900">앱으로 더 편하게</p>
          <p className="text-caption text-ink-500 leading-snug">홈 화면에 추가하면 앱처럼 빠르게 열려요.</p>
        </div>
        <Button size="sm" onClick={onInstall}>설치</Button>
        <button
          onClick={dismiss}
          aria-label="닫기"
          className="w-7 h-7 grid place-items-center rounded-full text-ink-500 shrink-0"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {iosModal && (
        <div className="fixed inset-0 z-modal flex items-end justify-center">
          <button
            aria-label="배경 닫기"
            onClick={() => setIosModal(false)}
            className="absolute inset-0"
            style={{ background: 'rgba(13,30,55,0.55)' }}
          />
          <div className="relative w-full max-w-app-frame bg-surface rounded-t-xl px-5 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
            <h3 className="text-subtitle font-bold text-ink-900">홈 화면에 추가하기</h3>
            <p className="mt-1 text-caption text-ink-500">사파리에서 아래 순서로 추가해 주세요.</p>
            <ol className="mt-3.5 flex flex-col gap-2.5 text-callout text-ink-900">
              <li className="flex items-center gap-2.5"><StepDot n={1} /> 화면 아래 <strong className="font-bold">공유 버튼 ⬆️</strong> 탭</li>
              <li className="flex items-center gap-2.5"><StepDot n={2} /> <strong className="font-bold">&ldquo;홈 화면에 추가&rdquo;</strong> 선택</li>
              <li className="flex items-center gap-2.5"><StepDot n={3} /> 오른쪽 위 <strong className="font-bold">&ldquo;추가&rdquo;</strong> 탭</li>
            </ol>
            <div className="h-4" />
            <Button block onClick={() => setIosModal(false)}>확인</Button>
          </div>
        </div>
      )}
    </>
  )
}

function StepDot({ n }: { n: number }) {
  return (
    <span className="w-5 h-5 rounded-full bg-brand text-ink-on-brand text-[11px] font-bold grid place-items-center shrink-0">
      {n}
    </span>
  )
}

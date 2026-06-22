'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { BrandMark, EyeIcon } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { updatePassword, logout } from '@/lib/auth'

type Phase = 'checking' | 'ready' | 'invalid'

function pwValid(pw: string): boolean {
  return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw)
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const t = useTranslations('reset')

  // IMPORTANT: do NOT redirect away on an existing session — the recovery link
  // creates one (detectSessionInUrl), and a /calendar bounce would block reset.
  // Capture the recovery hash synchronously on first render: supabase-js may
  // strip the URL hash asynchronously, so reading it here beats the effect.
  // A plain logged-in session must NOT unlock this page — that path requires the
  // current password via /settings/password; only a real recovery link does.
  const [cameViaRecovery] = useState(
    () => typeof window !== 'undefined' && /type=recovery/.test(window.location.hash),
  )
  const [phase, setPhase] = useState<Phase>('checking')
  const [pw, setPw] = useState('')
  const [pwc, setPwc] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let settled = false
    const markReady = () => { settled = true; setPhase('ready') }

    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') markReady()
    })

    if (cameViaRecovery) {
      markReady()
    } else {
      // Hash may have been consumed before mount — wait briefly for a
      // PASSWORD_RECOVERY event. A bare existing session stays 'invalid'.
      const t = setTimeout(() => { if (!settled) setPhase('invalid') }, 4000)
      return () => { clearTimeout(t); sub.subscription.unsubscribe() }
    }

    return () => sub.subscription.unsubscribe()
  }, [cameViaRecovery])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!pwValid(pw)) {
      setError(t('errorComposition'))
      return
    }
    if (pw !== pwc) {
      setError(t('errorMismatch'))
      return
    }
    setSaving(true)
    const res = await updatePassword(pw)
    if (!res.ok) {
      setSaving(false)
      setError(res.message ?? t('errorSaveFailed'))
      return
    }
    // Drop the fragile recovery session and send them to a clean login.
    await logout()
    setSaving(false)
    showToast(t('successToast'), 'success')
    router.replace('/login')
  }

  const eyeBtn = (
    <button
      type="button"
      onClick={() => setShowPw(s => !s)}
      aria-label={showPw ? t('hidePassword') : t('showPassword')}
      className="grid place-items-center w-9 h-9"
    >
      <EyeIcon size={20} off={!showPw} />
    </button>
  )

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-surface px-6"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2 pt-6">
        <BrandMark size={20} className="text-brand" />
        <span className="font-en text-[13px] font-semibold tracking-[0.08em] text-ink-500 uppercase">
          RAILINK
        </span>
      </div>

      {phase === 'checking' && (
        <div className="flex-1 grid place-items-center text-callout text-ink-500">
          {t('checking')}
        </div>
      )}

      {phase === 'invalid' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-lg bg-danger-soft text-danger grid place-items-center mb-4 text-[22px] font-bold">!</div>
          <h1 className="text-[20px] font-bold tracking-tight text-ink-900">{t('invalidTitle')}</h1>
          <p className="mt-2.5 text-callout text-ink-700 leading-relaxed">
            {t('invalidBodyLine1')}<br />{t('invalidBodyLine2')}
          </p>
          <div className="h-6" />
          <Link href="/find?mode=pw" className="w-full max-w-[360px]">
            <Button block>{t('invalidRequestAgain')}</Button>
          </Link>
          <Link href="/login" className="mt-3 text-caption font-semibold text-brand">
            {t('toLogin')}
          </Link>
        </div>
      )}

      {phase === 'ready' && (
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 pt-10" noValidate>
          <h1 className="text-[24px] font-bold tracking-tight text-ink-900">{t('readyTitle')}</h1>
          <p className="mt-2 mb-6 text-callout text-ink-700 leading-relaxed">
            {t('readyDescLine1')}<br />{t('readyDescLine2')}
          </p>

          <div className="flex flex-col gap-3.5">
            <Input
              id="newPw"
              label={t('newPwLabel')}
              required
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              className="font-en"
              value={pw}
              onChange={e => { setPw(e.target.value); setError(null) }}
              trailing={eyeBtn}
            />
            <Input
              id="confirmPw"
              label={t('confirmPwLabel')}
              required
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              className="font-en"
              value={pwc}
              onChange={e => { setPwc(e.target.value); setError(null) }}
              error={error ?? undefined}
              trailing={eyeBtn}
            />
          </div>

          <div className="h-2" />
          <Button type="submit" block disabled={saving}>
            {saving ? t('submitLoading') : t('submit')}
          </Button>
        </form>
      )}
    </div>
  )
}

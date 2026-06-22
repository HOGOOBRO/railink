'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ChevronLeftIcon, CheckIcon } from '@/components/ui/icons'
import { requestPasswordReset } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FindPasswordPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const t = useTranslations('find')

  const [step, setStep] = useState<'input' | 'sent'>('input')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    setErr(null)
    if (!EMAIL_RE.test(email)) {
      setErr(t('emailInvalid'))
      return
    }
    setLoading(true)
    const res = await requestPasswordReset(email)
    setLoading(false)
    if (!res.ok) {
      setErr(res.message ?? t('sendFailed'))
      return
    }
    setStep('sent')
  }

  async function resend() {
    const res = await requestPasswordReset(email)
    showToast(
      res.ok ? t('resendSuccess') : (res.message ?? t('resendRetry')),
      res.ok ? 'success' : 'danger',
    )
  }

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="h-topbar flex items-center gap-1 px-1.5 border-b border-line bg-surface shrink-0">
        <button
          onClick={() => router.push('/login')}
          aria-label={t('back')}
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <ChevronLeftIcon size={20} />
        </button>
        <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('title')}</h3>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {step === 'input' ? (
          <>
            <p className="text-callout text-ink-700 leading-relaxed mb-4">
              {t('inputDesc')}
            </p>

            <Input
              id="findEmail"
              label={t('emailLabel')}
              required
              type="email"
              autoComplete="email"
              className="font-en"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={e => { setEmail(e.target.value); setErr(null) }}
              error={err ?? undefined}
            />

            <div className="h-2" />
            <Button block onClick={submit} disabled={loading}>
              {loading ? t('submitLoading') : t('submit')}
            </Button>

            <p className="text-center text-callout text-ink-700 mt-4">
              {t('rememberPassword')}{' '}
              <button
                onClick={() => router.push('/login')}
                className="font-kr font-bold text-brand hover:text-brand-700 transition-colors"
              >
                {t('loginLink')}
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center text-center px-5 py-8 bg-surface border border-line rounded-lg">
              <div className="w-14 h-14 rounded-lg bg-brand-050 text-brand grid place-items-center mb-3.5">
                <CheckIcon size={28} />
              </div>
              <h2 className="text-[17px] font-bold text-ink-900">{t('sentTitle')}</h2>
              <p className="mt-2 text-callout text-ink-700 leading-relaxed">
                <strong className="font-en">{email}</strong>
                <br />{t('sentBodyLine1')}
                <br />{t('sentBodyLine2')}
              </p>
              <p className="mt-3.5 text-[11px] text-ink-500 leading-relaxed">
                {t('sentSpamNote')}
              </p>
            </div>

            <div className="h-4" />
            <Button block onClick={() => router.push('/login')}>{t('toLogin')}</Button>
            <button
              onClick={resend}
              className="mt-2.5 w-full text-callout font-semibold text-ink-700 py-2"
            >
              {t('resend')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ChevronLeftIcon, EyeIcon } from '@/components/ui/icons'
import { changePassword } from '@/lib/auth'

function pwStrength(pw: string): number {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(4, Math.max(1, s))
}

export default function PasswordChangePage() {
  const router = useRouter()
  const { showToast } = useToast()
  const t = useTranslations('settings.password')
  const PW_LABELS = ['', t('pwWeak'), t('pwFair'), t('pwGood'), t('pwStrong')]

  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pwc, setPwc] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [errors, setErrors] = useState<{ cur?: string; pw?: string; pwc?: string }>({})
  const [loading, setLoading] = useState(false)

  const strength = pwStrength(pw)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!cur) errs.cur = t('errorCurrentRequired')
    if (!pw) errs.pw = t('errorNewRequired')
    else if (pw.length < 8) errs.pw = t('errorTooShort')
    else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errs.pw = t('errorComposition')
    else if (pw === cur) errs.pw = t('errorSameAsCurrent')
    if (pwc !== pw) errs.pwc = t('errorMismatch')
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    const res = await changePassword(cur, pw)
    setLoading(false)
    if (!res.ok) {
      if (res.message?.includes('현재 비밀번호')) setErrors({ cur: res.message })
      else showToast(res.message ?? t('changeFailed'), 'danger')
      return
    }
    showToast(t('changed'), 'success')
    router.push('/settings/info')
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
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="h-topbar flex items-center gap-1 px-1.5 border-b border-line bg-surface shrink-0">
        <Link
          href="/settings/info"
          aria-label={t('back')}
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('title')}</h3>
      </header>

      <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 pt-5 pb-8" noValidate>
        <p className="text-callout text-ink-700 leading-relaxed mb-4">
          {t('intro')}
        </p>

        <div className="flex flex-col gap-3.5">
          <Input
            id="curPw"
            label={t('currentLabel')}
            required
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            className="font-en"
            value={cur}
            onChange={e => { setCur(e.target.value); setErrors(p => ({ ...p, cur: undefined })) }}
            error={errors.cur}
            trailing={eyeBtn}
          />
          <div className="flex flex-col gap-2">
            <Input
              id="newPw"
              label={t('newLabel')}
              required
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              className="font-en"
              value={pw}
              onChange={e => { setPw(e.target.value); setErrors(p => ({ ...p, pw: undefined })) }}
              error={errors.pw}
              hint={
                !errors.pw && (pw
                  ? t('strength', { label: PW_LABELS[strength] })
                  : t('newHint'))
              }
              trailing={eyeBtn}
            />
            {pw && (
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(i => (
                  <span
                    key={i}
                    className={`flex-1 h-1 rounded-pill ${
                      i <= strength
                        ? strength === 1 ? 'bg-danger'
                          : strength === 2 ? 'bg-warn'
                          : 'bg-success'
                        : 'bg-line-2'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
          <Input
            id="confirmPw"
            label={t('confirmLabel')}
            required
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            className="font-en"
            value={pwc}
            onChange={e => { setPwc(e.target.value); setErrors(p => ({ ...p, pwc: undefined })) }}
            error={errors.pwc}
            trailing={eyeBtn}
          />
        </div>

        <div className="h-2" />
        <Button type="submit" block disabled={loading}>
          {loading ? t('submitLoading') : t('submit')}
        </Button>

        <Link
          href="/find?mode=pw"
          className="block mt-3 text-center text-callout text-ink-500 py-2"
        >
          {t('forgotCurrent')}
        </Link>
      </form>
    </div>
  )
}

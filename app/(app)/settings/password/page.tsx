'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ChevronLeftIcon, EyeIcon } from '@/components/ui/icons'

const PW_LABELS = ['', '약함', '보통', '좋음', '강함']

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

  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pwc, setPwc] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [errors, setErrors] = useState<{ cur?: string; pw?: string; pwc?: string }>({})

  const strength = pwStrength(pw)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!cur) errs.cur = '현재 비밀번호를 입력해 주세요.'
    if (!pw) errs.pw = '새 비밀번호를 입력해 주세요.'
    else if (pw.length < 8) errs.pw = '비밀번호는 8자 이상으로 설정해 주세요.'
    else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errs.pw = '영문과 숫자를 모두 포함해 주세요.'
    else if (pw === cur) errs.pw = '현재 비밀번호와 달라야 해요.'
    if (pwc !== pw) errs.pwc = '비밀번호가 일치하지 않아요.'
    setErrors(errs)
    if (Object.keys(errs).length === 0) {
      showToast('비밀번호를 변경했어요.', 'success')
      router.push('/settings/info')
    }
  }

  const eyeBtn = (
    <button
      type="button"
      onClick={() => setShowPw(s => !s)}
      aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
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
          aria-label="뒤로"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <h3 className="text-[18px] font-bold tracking-tight text-ink-900">비밀번호 변경</h3>
      </header>

      <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 pt-5 pb-8" noValidate>
        <div className="px-4 py-3.5 bg-surface border border-line rounded-md text-caption text-ink-700 leading-relaxed mb-4">
          마지막 변경:{' '}
          <strong className="font-en text-ink-900">2026.02.14</strong>
          <span className="text-ink-300"> · 3개월 전</span>
        </div>

        <div className="flex flex-col gap-3.5">
          <Input
            id="curPw"
            label="현재 비밀번호"
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
              label="새 비밀번호"
              required
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              className="font-en"
              value={pw}
              onChange={e => { setPw(e.target.value); setErrors(p => ({ ...p, pw: undefined })) }}
              error={errors.pw}
              hint={
                !errors.pw && (pw
                  ? `강도: ${PW_LABELS[strength]}`
                  : '8자 이상, 영문과 숫자를 포함해 주세요.')
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
            label="새 비밀번호 확인"
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
        <Button type="submit" block>비밀번호 변경</Button>

        <Link
          href="/find?mode=pw"
          className="block mt-3 text-center text-callout text-ink-500 py-2"
        >
          현재 비밀번호가 기억나지 않아요
        </Link>
      </form>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ChevronLeftIcon, CheckIcon } from '@/components/ui/icons'
import { requestPasswordReset } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FindPasswordPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [step, setStep] = useState<'input' | 'sent'>('input')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    setErr(null)
    if (!EMAIL_RE.test(email)) {
      setErr('이메일 형식을 확인해 주세요.')
      return
    }
    setLoading(true)
    const res = await requestPasswordReset(email)
    setLoading(false)
    if (!res.ok) {
      setErr(res.message ?? '메일 발송에 실패했어요.')
      return
    }
    setStep('sent')
  }

  async function resend() {
    const res = await requestPasswordReset(email)
    showToast(
      res.ok ? '이메일을 다시 보냈어요.' : (res.message ?? '잠시 후 다시 시도해 주세요.'),
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
          aria-label="뒤로"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <ChevronLeftIcon size={20} />
        </button>
        <h3 className="text-[18px] font-bold tracking-tight text-ink-900">비밀번호 찾기</h3>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {step === 'input' ? (
          <>
            <p className="text-callout text-ink-700 leading-relaxed mb-4">
              가입 시 등록한 이메일을 입력하시면, 비밀번호 재설정 링크를 보내드릴게요.
            </p>

            <Input
              id="findEmail"
              label="이메일"
              required
              type="email"
              autoComplete="email"
              className="font-en"
              placeholder="이메일을 입력해 주세요"
              value={email}
              onChange={e => { setEmail(e.target.value); setErr(null) }}
              error={err ?? undefined}
            />

            <div className="h-2" />
            <Button block onClick={submit} disabled={loading}>
              {loading ? '보내는 중…' : '재설정 링크 받기'}
            </Button>

            <p className="text-center text-callout text-ink-700 mt-4">
              비밀번호가 기억나시나요?{' '}
              <button
                onClick={() => router.push('/login')}
                className="font-kr font-bold text-brand hover:text-brand-700 transition-colors"
              >
                로그인
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center text-center px-5 py-8 bg-surface border border-line rounded-lg">
              <div className="w-14 h-14 rounded-lg bg-brand-050 text-brand grid place-items-center mb-3.5">
                <CheckIcon size={28} />
              </div>
              <h2 className="text-[17px] font-bold text-ink-900">안내 이메일을 보냈어요</h2>
              <p className="mt-2 text-callout text-ink-700 leading-relaxed">
                <strong className="font-en">{email}</strong>
                <br />위 주소로 비밀번호 재설정 링크를 보내드렸어요.
                <br />메일의 링크를 눌러 새 비밀번호를 설정해 주세요.
              </p>
              <p className="mt-3.5 text-[11px] text-ink-500 leading-relaxed">
                메일이 보이지 않으면 스팸 폴더도 확인해 주세요.
              </p>
            </div>

            <div className="h-4" />
            <Button block onClick={() => router.push('/login')}>로그인으로</Button>
            <button
              onClick={resend}
              className="mt-2.5 w-full text-callout font-semibold text-ink-700 py-2"
            >
              이메일 다시 받기
            </button>
          </>
        )}
      </div>
    </div>
  )
}

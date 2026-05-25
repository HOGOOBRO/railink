'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { BrandMark, EyeIcon } from '@/components/ui/icons'
import { InstallLoginBanner } from '@/components/InstallLoginBanner'
import { login, getCurrentSession, resendConfirmation } from '@/lib/auth'
import { DEMO_LOGIN } from '@/lib/demo-data'

export default function LoginPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [email, setEmail]       = useState<string>(DEMO_LOGIN.email)
  const [password, setPassword] = useState<string>(DEMO_LOGIN.pw)
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    let alive = true
    getCurrentSession().then(s => { if (alive && s) router.replace('/calendar') })
    return () => { alive = false }
  }, [router])

  function autofillDemo() {
    setEmail(DEMO_LOGIN.email)
    setPassword(DEMO_LOGIN.pw)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setUnconfirmed(false)
    if (!email || !password) {
      setError('이메일 또는 비밀번호를 확인해 주세요.')
      return
    }
    setLoading(true)
    const result = await login(email, password)
    if (!result.ok) {
      setLoading(false)
      setError(result.message)
      if (result.code === 'unconfirmed') setUnconfirmed(true)
      return
    }
    const s = await getCurrentSession()
    setLoading(false)
    showToast(`환영합니다, ${s?.name || '이서연'} 님!`, 'success')
    router.push('/calendar')
  }

  async function handleResend() {
    if (!email) return
    await resendConfirmation(email)
    showToast('인증 메일을 다시 보냈어요. 메일함을 확인해 주세요.', 'success')
  }

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-surface"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* §18 install banner — mobile web, pre-install only (self-hides otherwise) */}
      <InstallLoginBanner />

      {/* ── Hero — Bold Mono editorial ── */}
      <div className="relative px-6 pt-6 pb-9 shrink-0">
        <div className="flex items-center gap-2">
          <BrandMark size={20} className="text-brand" />
          <span className="font-en text-[13px] font-semibold tracking-[0.08em] text-ink-500 uppercase">
            RAILINK
          </span>
        </div>

        <div
          className="absolute top-20 right-6 font-en text-[10px] font-semibold tracking-[0.2em] text-ink-300"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          2026 / V1.0
        </div>

        <div className="mt-16">
          <p className="font-en text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase mb-3.5">
            FOR KTX CREW
          </p>
          <h1 className="font-en text-[52px] font-[400] tracking-[-0.04em] leading-[0.95] text-ink-900">
            Schedule,
            <br />
            <span className="text-brand">together.</span>
          </h1>
          <p className="mt-3.5 pt-3.5 border-t border-line text-[13px] text-ink-700 leading-relaxed">
            내 근무와 동료 근무를 한 화면에서.
          </p>
        </div>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="flex flex-col px-6 pb-6 flex-1" noValidate>
        <div className="flex flex-col gap-3.5">
          <Input
            id="email"
            label="이메일"
            type="email"
            autoComplete="email"
            className="font-en"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null) }}
          />
          <Input
            id="password"
            label="비밀번호"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            className="font-en"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            error={error ?? undefined}
            trailing={
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                className="grid place-items-center w-9 h-9"
              >
                <EyeIcon size={20} off={!showPw} />
              </button>
            }
          />
        </div>

        <div className="h-1" />
        <Button type="submit" block disabled={loading}>
          {loading ? '로그인 중…' : '로그인'}
        </Button>
        {unconfirmed && (
          <button
            type="button"
            onClick={handleResend}
            className="mt-2 text-caption font-semibold text-brand hover:text-brand-700 transition-colors self-center"
          >
            인증 메일 다시 보내기
          </button>
        )}

        {/* 또는 divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-line-2" />
          <span className="text-[11px] font-semibold tracking-wider text-ink-500">또는</span>
          <div className="flex-1 h-px bg-line-2" />
        </div>

        <Link href="/signup" className="w-full">
          <Button type="button" variant="outline-brand" block>
            계정 만들기
          </Button>
        </Link>

        <div className="flex items-center justify-center my-3.5 text-[13px]">
          <Link
            href="/find?mode=pw"
            className="font-kr font-semibold text-ink-700 hover:text-brand transition-colors px-1.5 py-1"
          >
            비밀번호 찾기
          </Link>
        </div>

        {/* Demo account card */}
        <div className="mt-1.5 bg-brand-050 border-2 border-line rounded-md px-4 py-3.5 text-caption text-ink-700 leading-relaxed">
          <p className="text-[13px] font-bold text-ink-900 mb-1.5">데모 계정으로 둘러보기</p>
          <div className="font-en">
            <p><span className="text-ink-500">email&nbsp;&nbsp;</span>{DEMO_LOGIN.email}</p>
            <p><span className="text-ink-500">pw&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>{DEMO_LOGIN.pw}</p>
          </div>
          <button
            type="button"
            onClick={autofillDemo}
            className="mt-2 font-kr font-bold text-[13px] text-brand hover:text-brand-700 transition-colors"
          >
            → 자동으로 채우기
          </button>
        </div>
      </form>
    </div>
  )
}

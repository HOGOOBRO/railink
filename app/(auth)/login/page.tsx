'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { BrandMark, EyeIcon, GoogleIcon } from '@/components/ui/icons'
import { InstallLoginBanner } from '@/components/InstallLoginBanner'
import { login, getCurrentSession, resendConfirmation, signInWithGoogle } from '@/lib/auth'
import { savePendingInvite } from '@/lib/store/invites'
import { DEMO_LOGIN } from '@/lib/demo-data'
import { BootSplash } from '@/components/loading/BootSplash'
import { useDelayedFlag } from '@/lib/use-delayed-flag'

export default function LoginPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [email, setEmail]       = useState<string>(DEMO_LOGIN.email)
  const [password, setPassword] = useState<string>(DEMO_LOGIN.pw)
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  // While the existing-session check is in flight, render a neutral surface
  // instead of the form. On a PWA cold boot the session resolves async (a
  // refresh round-trip on cold start), and showing the form first made the
  // login screen flash before bouncing an already-logged-in user to /calendar.
  // Only reveal the form once we know there is no session.
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    // Invite arriving via the email-confirm redirect (/login?invite=TOKEN). Stash
    // it BEFORE the session check below — a confirmed user is bounced straight to
    // /calendar, where the token is consumed. Works regardless of which browser
    // opened the email, since the token rides the URL, not localStorage.
    if (typeof window !== 'undefined') {
      const token = new URLSearchParams(window.location.search).get('invite')
      if (token) savePendingInvite(token)
    }
    let alive = true
    getCurrentSession()
      .then(s => {
        if (!alive) return
        if (s) router.replace('/calendar')
        else setCheckingSession(false)
      })
      .catch(() => { if (alive) setCheckingSession(false) })
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
    showToast(`환영합니다, ${s?.name || 'Theo'} 님!`, 'success')
    // An invite stashed at /signup?invite= is consumed on the calendar mount
    // (single chokepoint that also handles signup + already-logged-in entry).
    router.push('/calendar')
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    // Carry an invite arriving via ?invite= through the Google round trip.
    const invite = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('invite')
      : null
    const res = await signInWithGoogle(invite)
    // On success the browser navigates away; we only land here on failure.
    if (!res.ok) {
      setGoogleLoading(false)
      setError(res.message ?? 'Google 로그인을 시작하지 못했어요.')
    }
  }

  async function handleResend() {
    if (!email) return
    await resendConfirmation(email)
    showToast('인증 메일을 다시 보냈어요. 메일함을 확인해 주세요.', 'success')
  }

  // Hold while we decide login-vs-calendar. A fast resolve (logged-out: no
  // token) shows a neutral surface for a beat then the form — never flashing it.
  // A slow resolve (logged-in: session refresh round-trip) reveals the brand
  // splash (①) before bouncing to /calendar, matching the calendar cold boot.
  const showBoot = useDelayedFlag(checkingSession, 200)
  if (checkingSession) {
    return showBoot ? <BootSplash /> : <div className="min-h-[100dvh] bg-surface" style={{ paddingTop: 'env(safe-area-inset-top)' }} />
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
            FOR EVERY SCHEDULE
          </p>
          <h1 className="font-en text-[52px] font-[400] tracking-[-0.04em] leading-[0.95] text-ink-900">
            Schedule,
            <br />
            <span className="text-brand">together.</span>
          </h1>
          <p className="mt-3.5 pt-3.5 border-t border-line text-[13px] text-ink-700 leading-relaxed">
            내 일정과 함께 보는 사람의 일정을 한 화면에서.
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

        <Button
          type="button"
          variant="outline"
          block
          onClick={handleGoogle}
          disabled={googleLoading || loading}
        >
          <GoogleIcon size={18} />
          {googleLoading ? '연결 중…' : 'Google로 계속하기'}
        </Button>

        <div className="h-2.5" />

        <Link href="/signup" className="w-full">
          <Button type="button" variant="outline-brand" block>
            계정 만들기
          </Button>
        </Link>
        {/* Positive framing of "non-KTX people can sign up too" — phrased as a
            capability, never "KTX가 아니어도" (negative framing was rejected). */}
        <p className="mt-2.5 text-center text-[12.5px] text-ink-300 leading-relaxed">
          어떤 근무 스케줄이든 함께 맞춰볼 수 있어요.
        </p>

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

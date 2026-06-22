'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fireSignupEvent } from '@/lib/auth'
import { savePendingInvite } from '@/lib/store/invites'
import type { Session as SbSession } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/icons'
import { BootSplash } from '@/components/loading/BootSplash'

// Google OAuth lands here with ?code= (PKCE). We resolve the session and bounce
// to /calendar. The invite token, if any, rides ?invite= so it survives the
// Google round trip (consumed on the calendar mount, like every other path).

// GA4 — Google은 가입과 로그인이 같은 콜백을 타므로 신규 가입만 골라 sign_up을
// 쏜다. 판정은 서버 시각끼리 비교(last_sign_in_at - created_at < 60s: 첫 로그인만
// 통과) — 클라이언트 시계(Date.now())는 몇 분만 틀려도 가입을 누락/중복시킨다.
// 추가 가드: provider가 google인 세션만(이메일 계정 오귀속 방지), 계정당 1회
// (콜백 새로고침·StrictMode 재실행·이메일↔Google 연동의 중복 카운트 방지).
function fireSignupIfNew(session: SbSession | null): void {
  const u = session?.user
  if (!u?.created_at || !u.last_sign_in_at) return
  if (u.app_metadata?.provider !== 'google') return
  if (new Date(u.last_sign_in_at).getTime() - new Date(u.created_at).getTime() >= 60_000) return
  const onceKey = `railink_signup_fired_${u.id}`
  try {
    if (localStorage.getItem(onceKey)) return
    localStorage.setItem(onceKey, '1')
  } catch { /* localStorage 막힘 — 중복 가드 없이 1회 발송 시도 */ }
  fireSignupEvent('google')
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const t = useTranslations('authCallback')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const params = new URLSearchParams(window.location.search)
      const invite = params.get('invite')
      if (invite) savePendingInvite(invite)

      if (params.get('error') || params.get('error_description')) {
        if (alive) setError(t('errorCancelled'))
        return
      }

      // detectSessionInUrl may have already exchanged the code during client
      // init — getSession() awaits that. If a session exists, we're done.
      const { data: pre } = await supabase.auth.getSession()
      if (pre.session) { fireSignupIfNew(pre.session); if (alive) router.replace('/calendar'); return }

      // Otherwise exchange the code explicitly (deterministic) — token POST goes
      // through the same-origin proxy, no CORS concern.
      const code = params.get('code')
      if (code) {
        const { data: ex, error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (!exErr) { fireSignupIfNew(ex.session); if (alive) router.replace('/calendar'); return }
      }
      if (alive) setError(t('errorGeneric'))
    })().catch(() => { if (alive) setError(t('errorGeneric')) })
    return () => { alive = false }
  }, [router, t])

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center min-h-[100dvh] bg-surface px-8"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="w-14 h-14 rounded-lg bg-brand-050 text-brand grid place-items-center mb-5">
          <BrandMark size={26} />
        </div>
        <h1 className="text-[22px] font-bold tracking-tighter text-ink-900">{t('errorHeading')}</h1>
        <p className="mt-3 text-callout text-ink-700 leading-relaxed">{error}</p>
        <div className="h-7" />
        <Link href="/login" className="w-full max-w-[360px]">
          <Button block>{t('backToLogin')}</Button>
        </Link>
      </div>
    )
  }

  return <BootSplash />
}

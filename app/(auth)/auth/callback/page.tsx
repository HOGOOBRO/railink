'use client'

import { useEffect, useState } from 'react'
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

// GA4 — Google은 가입과 로그인이 같은 콜백을 타므로, 계정 생성 시각이 방금
// (5분 내)인 세션만 신규 가입으로 보고 sign_up을 쏜다. 재로그인은 통과.
function fireSignupIfNew(session: SbSession | null): void {
  const createdAt = session?.user?.created_at
  if (!createdAt) return
  if (Date.now() - new Date(createdAt).getTime() < 5 * 60_000) fireSignupEvent('google')
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const params = new URLSearchParams(window.location.search)
      const invite = params.get('invite')
      if (invite) savePendingInvite(invite)

      if (params.get('error') || params.get('error_description')) {
        if (alive) setError('Google 로그인이 취소되었거나 완료되지 않았어요.')
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
      if (alive) setError('로그인 처리 중 문제가 생겼어요. 다시 시도해 주세요.')
    })().catch(() => { if (alive) setError('로그인 처리 중 문제가 생겼어요. 다시 시도해 주세요.') })
    return () => { alive = false }
  }, [router])

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center min-h-[100dvh] bg-surface px-8"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="w-14 h-14 rounded-lg bg-brand-050 text-brand grid place-items-center mb-5">
          <BrandMark size={26} />
        </div>
        <h1 className="text-[22px] font-bold tracking-tighter text-ink-900">로그인하지 못했어요</h1>
        <p className="mt-3 text-callout text-ink-700 leading-relaxed">{error}</p>
        <div className="h-7" />
        <Link href="/login" className="w-full max-w-[360px]">
          <Button block>로그인 화면으로</Button>
        </Link>
      </div>
    )
  }

  return <BootSplash />
}

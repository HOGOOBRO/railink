import { createClient, processLock } from '@supabase/supabase-js'

// The anon/publishable key is public by design; data access is enforced by
// Row Level Security, not key secrecy.
const directUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if ((!directUrl || !anonKey) && typeof window !== 'undefined') {
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — ' +
    'set them in .env.local (local) and Vercel → Settings → Environment Variables (prod).',
  )
}

// Browser → same-origin proxy (/api/sb-proxy/*). Some user networks/CDN
// edges fail the cross-origin OPTIONS preflight that supabase-js triggers
// with custom headers (Accept-Profile, Prefer, X-Client-Info), even though
// direct GETs succeed. Routing through a same-origin next.js handler
// eliminates the preflight entirely.
// SSR/build → direct URL: there's no window, and server-side calls don't
// have the CORS issue anyway.
const url = typeof window !== 'undefined'
  ? `${window.location.origin}/api/sb-proxy`
  : (directUrl || 'https://placeholder.supabase.co')

export const supabase = createClient(
  url,
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // 인메모리 락(navigator.locks 미사용). 기본 navigatorLock은 풀 페이지 로드 때
      // getSession()이 락 획득에서 교착돼 영영 resolve되지 않는 일이 있었다 — 콜드
      // 스타트/새로고침/딥링크에서 캘린더가 BootSplash에, 내정보가 빈 화면에 무한히
      // 묶이던 원인. processLock은 문서별 인메모리라 이런 교착이 없다. 트레이드오프는
      // 멀티탭 간 토큰 갱신 비조율 정도로, 설치형 PWA(주로 단일 인스턴스)엔 무해하다.
      lock: processLock,
    },
  },
)

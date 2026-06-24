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

// supabase-js가 createClient(url, ...)에서 파생하는 것과 동일한 auth 저장 키
// (SupabaseClient: `sb-${hostname.split('.')[0]}-auth-token`). 콜드 부팅 시 세션
// 해석(getSession)이 데드라인을 넘기면 lib/auth.ts가 이 키로 저장된 세션을 직접 읽어
// 즉시 폴백한다 — 같은 url에서 파생하므로 클라이언트가 실제로 쓰는 키와 항상 일치한다.
export const AUTH_STORAGE_KEY =
  typeof window !== 'undefined' ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : ''

// 락 획득에 상한(2초)을 둔 processLock 래퍼. supabase는 getSession/initialize 등을
// acquireTimeout=-1(무한 대기)로 호출하는데, 콜드 부팅 때 initialize의 토큰 갱신이
// 락을 쥔 채 끝나지 않으면 이후 모든 getSession(데이터 토큰 획득 포함)이 그 뒤에
// 무한히 줄 서서 멈췄다 — 앱 재시작 전엔 안 풀리던 무한 로딩의 근본 원인. 2초 안에
// 락을 못 잡으면 교착으로 보고 락 없이 진행한다. 평소 멀티탭 토큰 갱신 조율은 유지하되
// (processLock), 교착 시엔 무한 멈춤 대신 진행을 택한다(최악이라야 멀티탭 토큰 경합 =
// 한 탭 재로그인, 무한 멈춤보다 훨씬 가볍다). fn 자체 에러는 재실행하지 않고 전파한다.
const LOCK_ACQUIRE_TIMEOUT_MS = 2000
async function lockWithTimeout<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  try {
    return await processLock(name, LOCK_ACQUIRE_TIMEOUT_MS, fn)
  } catch (err) {
    // LockAcquireTimeoutError는 isAcquireTimeout=true (auth-js 권장 식별 방식). 락을
    // 제때 못 잡은 경우에만 락 없이 진행하고, fn 실행 중 발생한 에러는 그대로 던진다.
    if (err && (err as { isAcquireTimeout?: boolean }).isAcquireTimeout) {
      return await fn()
    }
    throw err
  }
}

export const supabase = createClient(
  url,
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // 시한부 인메모리 락(위 lockWithTimeout). processLock(문서별 인메모리)을 쓰되 락
      // 획득에 2초 상한을 둬, 콜드 부팅 시 토큰 갱신이 락을 쥔 채 멈춰도 이후 요청이
      // 무한히 줄 서지 않게 한다. navigatorLock·무한 processLock 양쪽의 교착을 막으면서
      // 평소 멀티탭 갱신 조율은 유지. 설치형 PWA(주로 단일 인스턴스)엔 트레이드오프 거의 없음.
      lock: lockWithTimeout,
    },
  },
)

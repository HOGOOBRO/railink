import { supabase } from './supabase'
import { DEMO_ME, DEMO_LOGIN } from './demo-data'
import { seedDemo } from './demo-seed'
import type { Visibility, ProfileType } from './types/schedule'

export interface Session {
  uid: string
  email: string
  name: string
  employeeId: string
  part?: string
  photo?: string
  /** 'ktx_attendant' (사번·파트 있음) or 'personal' (없음). Read from
   *  profiles.profile_type (source of truth); falls back to user_metadata, then
   *  'ktx_attendant', so legacy / pre-migration accounts are unaffected. */
  profileType: ProfileType
  /** True when this session is the local demo (localStorage), not Supabase. */
  isDemo: boolean
}

/* ── Demo path (localStorage) ──────────────────────────────────────────────
 * Only the fixed demo credentials use this. Real accounts go through Supabase.
 * Schedules/compare are still localStorage in Phase 6a, so a localStorage demo
 * session is consistent with that. */

const DEMO_SESSION_KEY = 'railink_demo_session_v3'
const DEMO_PHOTO_KEY = 'railink_demo_photo_v1'

export function isDemoCreds(email: string, pw: string): boolean {
  return email === DEMO_LOGIN.email && pw === DEMO_LOGIN.pw
}

/** True when the local demo session is active (localStorage, not Supabase).
 *  Stores that hit auth-only RPCs use this to short-circuit with a demo-safe
 *  response instead of calling Supabase with no real session. */
export function isDemoActive(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem(DEMO_SESSION_KEY)
}

function getDemoPhotoOverride(): { has: boolean; value?: string } {
  if (typeof window === 'undefined') return { has: false }
  const raw = localStorage.getItem(DEMO_PHOTO_KEY)
  if (raw === null) return { has: false }
  return { has: true, value: raw === '' ? undefined : raw }
}

function demoSession(): Session {
  const override = getDemoPhotoOverride()
  const photo = override.has ? override.value : DEMO_ME.photo
  return {
    uid: DEMO_ME.uid, email: DEMO_ME.email, name: DEMO_ME.name,
    employeeId: DEMO_ME.employeeId, part: DEMO_ME.part, photo,
    profileType: 'ktx_attendant',
    isDemo: true,
  }
}

function getDemoSession(): Session | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(DEMO_SESSION_KEY) ? demoSession() : null
}

/* ── Unified session (used by calendar / menu) ─────────────────────────────── */

/* In-memory profile cache (keyed by uid). getCurrentSession runs on every (app)
 * page mount and needs two fields from the profiles table: photo AND
 * profile_type (the source of truth — see the note in getCurrentSession). Without
 * a cache, each route change pays a profiles round-trip (through /api/sb-proxy)
 * and shows a loading gate while it resolves. Caching both for the SPA lifetime
 * makes navigation network-free; uid/email/name/metadata still come live from
 * getSession(). Cached only on a successful fetch; invalidated on photo change
 * + logout. */
let profileCache: { uid: string; photo: string | undefined; profileType: ProfileType } | null = null

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  const u = data.session?.user
  if (!u) return getDemoSession()
  if (typeof window !== 'undefined') localStorage.removeItem(DEMO_SESSION_KEY)
  const m = (u.user_metadata ?? {}) as Record<string, string>
  // profile_type: user_metadata is a LEGACY FALLBACK only. The source of truth is
  // profiles.profile_type — the new-user trigger AND every later change (Google
  // OAuth classification, a manual dashboard edit) write the profiles row, NOT
  // user_metadata. Reading metadata here misses those and mis-shows a 'personal'
  // user as KTX (the calendar's 등록 UI branches entirely on this).
  const metaType: ProfileType = m.profile_type === 'personal' ? 'personal' : 'ktx_attendant'
  // Photo also lives in profiles (see updatePhoto); metadata.photo is the legacy
  // fallback, preferred first to preserve prior behavior. One cached profiles read
  // resolves both photo and profile_type.
  let photo: string | undefined
  let profileType: ProfileType
  if (profileCache && profileCache.uid === u.id) {
    photo = profileCache.photo
    profileType = profileCache.profileType
  } else {
    try {
      const { data: prof } = await supabase
        .from('profiles').select('photo, profile_type').eq('id', u.id).maybeSingle()
      // No profiles row (shouldn't happen post-trigger) → fall back to metadata.
      profileType = prof
        ? (prof.profile_type === 'personal' ? 'personal' : 'ktx_attendant')
        : metaType
      photo = m.photo || (prof?.photo as string | null | undefined) || undefined
      profileCache = { uid: u.id, photo, profileType }   // cache only on a clean fetch
    } catch {
      // profiles fetch is best-effort; fall back to metadata and DON'T cache so
      // the next call retries against the source of truth.
      profileType = metaType
      photo = m.photo || undefined
    }
  }
  return {
    uid: u.id,
    email: u.email ?? '',
    name: m.name ?? '',
    employeeId: m.employee_id ?? '',
    part: m.part || undefined,
    photo,
    profileType,
    isDemo: false,
  }
}

/* ── Login ─────────────────────────────────────────────────────────────────── */

export type LoginResult =
  | { ok: true; demo: boolean }
  | { ok: false; code: 'invalid' | 'unconfirmed' | 'error'; message: string }

export async function login(email: string, password: string): Promise<LoginResult> {
  if (isDemoCreds(email, password)) {
    await supabase.auth.signOut()
    seedDemo()
    localStorage.setItem(DEMO_SESSION_KEY, '1')
    // GA4 — 데모 로그인 카운트. railink_demo_seen은 데모→가입 전환 퍼널의
    // 근거가 되는 영구 플래그: 세션 키와 달리 실계정 로그인에도 안 지워져서,
    // 나중에 sign_up 이벤트의 demo_before 파라미터로 실려 나간다.
    localStorage.setItem('railink_demo_seen', '1')
    const gtag = (window as unknown as { gtag?: (command: 'event', name: string) => void }).gtag
    gtag?.('event', 'demo_login')
    return { ok: true, demo: true }
  }
  if (typeof window !== 'undefined') localStorage.removeItem(DEMO_SESSION_KEY)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (!error) return { ok: true, demo: false }
  if (/email not confirmed/i.test(error.message)) {
    return { ok: false, code: 'unconfirmed', message: '이메일 인증이 아직 안 됐어요. 받은 메일의 링크를 눌러 주세요.' }
  }
  if (/invalid login credentials/i.test(error.message)) {
    return { ok: false, code: 'invalid', message: '이메일 또는 비밀번호를 확인해 주세요.' }
  }
  return { ok: false, code: 'error', message: '로그인 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
}

/* ── Google OAuth ──────────────────────────────────────────────────────────── */

/** Start the Google OAuth flow (full-page redirect to Google → Supabase →
 *  /auth/callback). Returns only on failure; on success the browser navigates
 *  away. New Google users have no 사번/파트, so the new-user trigger classifies
 *  them as profile_type='personal' (see 20260606000000_oauth_google_personal).
 *
 *  Why we rewrite the URL: in the browser the supabase client targets the
 *  same-origin proxy (/api/sb-proxy) to dodge a CORS preflight on data calls.
 *  But OAuth is a full-page navigation, not a fetch — there's no preflight, and
 *  the proxy can't carry the browser through Google's redirect chain. So we ask
 *  supabase-js to BUILD the authorize URL (skipBrowserRedirect) and then swap
 *  the proxy prefix back to the direct Supabase host before navigating. The
 *  PKCE code verifier was just written to localStorage by this same client, so
 *  the /auth/callback exchange reads it back without trouble. */
export async function signInWithGoogle(
  inviteToken?: string | null,
): Promise<{ ok: boolean; message?: string }> {
  if (typeof window === 'undefined') return { ok: false }
  localStorage.removeItem(DEMO_SESSION_KEY)
  const redirectTo = `${window.location.origin}/auth/callback${
    inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ''
  }`
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { skipBrowserRedirect: true, redirectTo },
  })
  if (error || !data?.url) {
    return { ok: false, message: 'Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  const directUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const proxyPrefix = `${window.location.origin}/api/sb-proxy`
  let url = data.url
  if (directUrl && url.startsWith(proxyPrefix)) {
    url = directUrl.replace(/\/+$/, '') + url.slice(proxyPrefix.length)
  }
  window.location.assign(url)
  return { ok: true }
}

/* ── Sign-up ───────────────────────────────────────────────────────────────── */

export interface SignupInput {
  email: string
  password: string
  employeeId: string
  name: string
  part?: string
  visibility: Visibility
  /** Defaults to 'ktx_attendant'. The signup form's KTX toggle sets this (PR-3).
   *  For 'personal' the trigger clamps visibility to 'private' regardless of the
   *  value passed here. */
  profileType?: ProfileType
  /** Invite token from /signup?invite=. Threaded into emailRedirectTo so it
   *  survives the email-confirmation round trip even when the link opens in a
   *  different browser than signup (where localStorage wouldn't carry it). */
  inviteToken?: string | null
  /** 가입 폼의 선택 동의 체크박스(업데이트·이벤트 알림). Required so a caller
   *  can't silently drop the answer — the form always asks, so always pass it.
   *  Recorded into profiles by handle_new_user_profile()
   *  (20260612000000_marketing_consent). */
  marketingConsent: boolean
  /** 직군(personal 가입 폼의 직무 칩). 'nurse' | 'flight_attendant' | 'beauty' |
   *  'other'. 확장 우선순위 판단용 — KTX 가입에선 보내지 않는다(undefined).
   *  handle_new_user_profile() → profiles.job_category
   *  (20260614020000_signup_job_category). */
  jobCategory?: string
  /** jobCategory === 'other'일 때 직접 입력한 직군 텍스트. 그 외엔 보내지 않는다. */
  jobOther?: string
}

export type SignupResult =
  | { ok: true; needsConfirm: boolean }
  | { ok: false; field?: 'email'; message: string }

export async function signup(input: SignupInput): Promise<SignupResult> {
  // After confirmation Supabase redirects here. Carrying ?invite= on the URL
  // makes the invite token origin/browser-independent — /login re-stashes it and
  // the calendar mount consumes it. (Requires this URL to be in Supabase's
  // redirect allowlist, else it falls back to Site URL — see URL Configuration.)
  const emailRedirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/login${
          input.inviteToken ? `?invite=${encodeURIComponent(input.inviteToken)}` : ''
        }`
      : undefined
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo,
      data: {
        employee_id: input.employeeId,
        name: input.name,
        part: input.part ?? null,
        // Read by handle_new_user_profile() → profiles.visibility / profile_type
        // (see 20260530000000_profile_type.sql). profile_type defaults to
        // 'ktx_attendant'; personal signups are clamped to private by the trigger.
        visibility: input.visibility,
        profile_type: input.profileType ?? 'ktx_attendant',
        // Read by handle_new_user_profile() → profiles.marketing_consent(_at).
        // Present-or-absent matters: the trigger stamps 응답 시각 only when the
        // key exists, so Google OAuth rows (no metadata) stay "never asked".
        marketing_consent: input.marketingConsent,
        // Read by handle_new_user_profile() → profiles.job_category / job_other
        // (20260614020000). 키가 있을 때만 기록되므로, KTX 가입처럼 직군을 안
        // 받는 경우엔 아예 키를 싣지 않는다(미응답 = NULL 유지).
        ...(input.jobCategory ? { job_category: input.jobCategory } : {}),
        ...(input.jobOther ? { job_other: input.jobOther } : {}),
        // Read by consume_invite_on_signup() → creates the bidirectional accepted
        // share at account creation (20260601000000), independent of the email
        // redirect. The client-side localStorage/URL path stays as a fallback.
        ...(input.inviteToken ? { invite_token: input.inviteToken } : {}),
      },
    },
  })
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return { ok: false, field: 'email', message: '이미 가입된 이메일이에요.' }
    }
    return { ok: false, message: '가입 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  }
  // 이미 가입+인증된 이메일: Supabase는 계정 열거 방지로 에러 대신 "가짜 성공"
  // (identities가 빈 user)을 돌려준다 — 위의 에러 regex로는 안 잡힌다. 이 경우
  // 진짜 안내를 주고(가짜 "메일 확인" 화면 방지) sign_up 이벤트도 쏘지 않는다.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return { ok: false, field: 'email', message: '이미 가입된 이메일이에요.' }
  }
  // GA4 — 가입(폼 제출 성공, 이메일 인증 완료 전) 추적. 같은 이메일 재제출
  // (미인증 상태에서 뒤로가기→다시 제출)은 이메일 단위 1회 가드로 중복 방지.
  if (typeof window !== 'undefined') {
    const onceKey = `railink_signup_fired_${input.email.trim().toLowerCase()}`
    try {
      if (!localStorage.getItem(onceKey)) {
        localStorage.setItem(onceKey, '1')
        fireSignupEvent('email')
      }
    } catch { fireSignupEvent('email') }
  }
  // Email confirmation is ON → no session until the link is clicked.
  return { ok: true, needsConfirm: !data.session }
}

/** GA4 sign_up 이벤트 — 이메일 가입(signup())과 Google 신규 가입(/auth/callback)
 *  이 공유한다. demo_before: 이 브라우저에서 데모를 써본 적 있는지(yes/no) —
 *  GA4에서 demo_before를 이벤트 단위 맞춤 측정기준으로 등록하면 데모→가입
 *  전환 퍼널을 표로 볼 수 있다. */
export function fireSignupEvent(method: 'email' | 'google'): void {
  if (typeof window === 'undefined') return
  const gtag = (window as unknown as {
    gtag?: (command: 'event', name: string, params?: Record<string, string>) => void
  }).gtag
  gtag?.('event', 'sign_up', {
    method,
    demo_before: localStorage.getItem('railink_demo_seen') ? 'yes' : 'no',
  })
}

export async function resendConfirmation(email: string): Promise<void> {
  await supabase.auth.resend({ type: 'signup', email })
}

/* ── Profile updates ───────────────────────────────────────────────────────── */

/** Save a new profile photo. Pass `null` to clear it (fall back to initials).
 * Demo accounts persist to localStorage; real accounts write to the profiles
 * table only — NEVER to user_metadata. The supabase JWT payload includes
 * user_metadata, and base64-encoded photos bloat the JWT to tens of KB,
 * overflowing PostgREST/nginx's request-header ceiling and breaking every
 * subsequent supabase call with HTTP 494. Reading still works because
 * getCurrentSession reads photo from user_metadata first, then falls back
 * to profiles — but the source of truth for new writes is profiles only. */
export async function updatePhoto(photo: string | null): Promise<{ ok: boolean; message?: string }> {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY)) {
    localStorage.setItem(DEMO_PHOTO_KEY, photo ?? '')
    return { ok: true }
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: '로그인 상태를 확인하지 못했어요.' }
  const { error } = await supabase
    .from('profiles')
    .update({ photo: photo })
    .eq('id', user.id)
  if (error) return { ok: false, message: error.message }
  // Keep the in-memory cache in sync so the new photo shows immediately on the
  // next getCurrentSession (e.g. when the photo page navigates back). photo
  // changed, profile_type did not — preserve the cached profileType. If there's
  // no cache yet, null it so the next getCurrentSession refetches both fields.
  profileCache = profileCache && profileCache.uid === user.id
    ? { ...profileCache, photo: photo ?? undefined }
    : null
  return { ok: true }
}

/* ── Logout ────────────────────────────────────────────────────────────────── */

export async function logout(): Promise<void> {
  profileCache = null
  // 푸시 구독 정리 — 안 하면 공용 브라우저에서 다음 로그인 계정이 이전 계정의
  // 알림을 받는다(구독은 endpoint로 서버에 남고, getPushStatus는 'enabled'라
  // 재구독도 안 일어남). signOut 전에 토큰이 살아있을 때 RPC가 통하도록 먼저.
  try {
    const { disablePush } = await import('@/lib/push')
    await disablePush()
  } catch { /* 미지원/실패 — 로그아웃은 계속 */ }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(DEMO_SESSION_KEY)
    // Defensive wipe: supabase-js usually stores the session under
    // `sb-<projectRef>-auth-token`, but on some builds we observed signOut
    // leaving stray sb-* keys behind. Anything that survives makes
    // getCurrentSession() find a "ghost" session on /login and bounce the
    // user right back to /calendar — the exact symptom users reported.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sb-')) localStorage.removeItem(key)
    }
  }
  // scope:'local' skips the server-side token-revoke roundtrip — that call
  // can hang on a flaky network or dead origin. Local cleanup is what
  // matters for the UI; the refresh token expires server-side on its own.
  await supabase.auth.signOut({ scope: 'local' })
}

/* ── Password change (logged-in, requires current password) ────────────────── */

export async function changePassword(
  currentPassword: string, newPassword: string,
): Promise<{ ok: boolean; message?: string }> {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY)) {
    return { ok: false, message: '데모 계정은 비밀번호를 변경할 수 없어요.' }
  }
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email
  if (!email) {
    return { ok: false, message: '로그인 상태를 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.' }
  }
  // Re-authenticate with the current password before allowing the change.
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (reauthError) {
    return { ok: false, message: '현재 비밀번호가 일치하지 않아요.' }
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    if (/different|same as|should be different/i.test(error.message)) {
      return { ok: false, message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' }
    }
    return { ok: false, message: '비밀번호 변경 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  }
  return { ok: true }
}

/* ── Password reset (forgot password → email link) ─────────────────────────── */

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message?: string }> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset` : undefined
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) {
    if (/rate|too many|429/i.test(error.message)) {
      return { ok: false, message: '요청이 많아요. 잠시 후 다시 시도해 주세요.' }
    }
    return { ok: false, message: '메일 발송 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  }
  return { ok: true }
}

/** Set a new password during a recovery session (the /reset page). */
export async function updatePassword(newPassword: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    return { ok: false, message: '비밀번호 설정 중 문제가 생겼어요. 링크를 다시 요청해 주세요.' }
  }
  return { ok: true }
}

/* ── Profile update (name / part / share) ──────────────────────────────────── */

export interface ProfileUpdate {
  name: string
  employeeId: string
  part?: string
  /** @deprecated No-op since the visibility/shares model (PR-2). The field is
   *  tolerated so the settings page still compiles; both it and the legacy
   *  share toggle are removed when settings is reworked in PR-3. */
  shareSchedule?: boolean
}

/** Writes user_metadata (what getCurrentSession reads) AND the profiles row
 * (what colleague search reads). Not atomic — surfaces partial failure. */
export async function updateProfile(input: ProfileUpdate): Promise<{ ok: boolean; message?: string }> {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY)) {
    return { ok: false, message: '데모 계정은 정보를 변경할 수 없어요.' }
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: '로그인 상태를 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.' }
  }
  const { error: metaError } = await supabase.auth.updateUser({
    data: { name: input.name, part: input.part ?? null },
  })
  if (metaError) {
    return { ok: false, message: '내 정보 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  }
  // Visibility is no longer written here — it goes through setVisibility()
  // (set_profile_visibility RPC). input.shareSchedule is intentionally ignored.
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: user.id,
    name: input.name,
    employee_id: input.employeeId,
    part: input.part ?? null,
  }, { onConflict: 'id' })
  if (profileError) {
    return { ok: false, message: '내 정보는 저장됐지만 동료 검색 반영이 잠시 늦어질 수 있어요.' }
  }
  return { ok: true }
}

/* ── Marketing consent (업데이트·이벤트 알림 수신 동의) ─────────────────────── */

export interface MarketingConsent {
  consent: boolean
  /** 마지막으로 질문에 답한 시각(ISO). null = 아직 한 번도 묻지 않음 — Google
   *  가입자와 동의 기능 이전 가입자. 캘린더의 1회 프롬프트가 이걸 보고 뜬다. */
  answeredAt: string | null
}

export async function getMarketingConsent(): Promise<MarketingConsent | null> {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY)) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('marketing_consent, marketing_consent_at')
    .eq('id', user.id)
    .maybeSingle()
  if (error || !data) return null
  return {
    consent: !!data.marketing_consent,
    answeredAt: (data.marketing_consent_at as string | null) ?? null,
  }
}

/** 동의/철회 기록. 응답 시각도 함께 갱신해 "언제 동의(철회)했는지"가 남는다 —
 *  광고성 정보 수신 동의는 시점 기록이 있어야 의미가 있다. */
export async function setMarketingConsent(consent: boolean): Promise<{ ok: boolean; message?: string }> {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY)) {
    return { ok: false, message: '데모 계정은 수신 동의를 바꿀 수 없어요.' }
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: '로그인 상태를 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.' }
  const { error } = await supabase
    .from('profiles')
    .update({ marketing_consent: consent, marketing_consent_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) {
    return { ok: false, message: '수신 동의 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  }
  return { ok: true }
}

/* ── Job category (확장 우선순위용; personal 전용) ──────────────────────────── */

/** 현재 계정의 직군. null = 미응답 — Google 가입(가입 폼을 안 거침)과 직무 수집
 *  기능 이전 가입자. 캘린더의 1회 직무 프롬프트가 이걸 보고 뜬다(personal 한정). */
export async function getJobCategory(): Promise<{ category: string | null } | null> {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY)) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('job_category')
    .eq('id', user.id)
    .maybeSingle()
  if (error || !data) return null
  return { category: (data.job_category as string | null) ?? null }
}

/** 직군 저장. 'other'일 때만 job_other에 자유입력 텍스트를 남기고, 그 외엔
 *  job_other를 비운다(이전에 기타였다가 바꾼 경우 정리). */
export async function setJobCategory(category: string, other?: string): Promise<{ ok: boolean; message?: string }> {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY)) {
    return { ok: false, message: '데모 계정은 직무를 저장할 수 없어요.' }
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: '로그인 상태를 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.' }
  const { error } = await supabase
    .from('profiles')
    .update({
      job_category: category,
      job_other: category === 'other' ? (other?.trim() || null) : null,
    })
    .eq('id', user.id)
  if (error) {
    return { ok: false, message: '직무 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  }
  return { ok: true }
}

/* ── Profile visibility (search exposure; separate from schedule sharing) ───── */

/** Set whether my profile shows up in colleague search. Goes through the
 *  set_profile_visibility RPC rather than writing the column directly. */
export async function setVisibility(
  visibility: Visibility,
): Promise<{ ok: boolean; message?: string }> {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY)) {
    return { ok: false, message: '데모 계정은 공개 범위를 바꿀 수 없어요.' }
  }
  const { error } = await supabase.rpc('set_profile_visibility', { new_visibility: visibility })
  if (error) {
    return { ok: false, message: '공개 범위 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  }
  return { ok: true }
}

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
   *  user_metadata; defaults to 'ktx_attendant' for legacy rows / pre-migration
   *  accounts so existing KTX users are unaffected. */
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

/* In-memory photo cache (keyed by uid). The ONLY network read in
 * getCurrentSession is the profiles.photo lookup, and getCurrentSession runs
 * on every (app) page mount — so without this, each route change pays a
 * profiles round-trip (through /api/sb-proxy) and shows a loading gate while
 * it resolves. Caching just the photo for the SPA lifetime makes navigation
 * network-free; uid/email/name/metadata still come live from getSession().
 * Cached only on a successful fetch; invalidated on photo change + logout. */
let photoCache: { uid: string; photo: string | undefined } | null = null

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  const u = data.session?.user
  if (!u) return getDemoSession()
  if (typeof window !== 'undefined') localStorage.removeItem(DEMO_SESSION_KEY)
  const m = (u.user_metadata ?? {}) as Record<string, string>
  // Photo lives in profiles, NOT user_metadata (see updatePhoto for why).
  // Fall back to metadata.photo only for legacy rows that haven't been
  // cleaned up yet; new writes never touch metadata.
  let photo = m.photo || undefined
  if (!photo) {
    if (photoCache && photoCache.uid === u.id) {
      photo = photoCache.photo
    } else {
      try {
        const { data: prof } = await supabase
          .from('profiles').select('photo').eq('id', u.id).maybeSingle()
        photo = (prof?.photo as string | null | undefined) || undefined
        photoCache = { uid: u.id, photo }   // cache only on a clean fetch
      } catch { /* profiles fetch is best-effort; leave cache unset to retry */ }
    }
  }
  return {
    uid: u.id,
    email: u.email ?? '',
    name: m.name ?? '',
    employeeId: m.employee_id ?? '',
    part: m.part || undefined,
    photo,
    profileType: m.profile_type === 'personal' ? 'personal' : 'ktx_attendant',
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
  // Email confirmation is ON → no session until the link is clicked.
  return { ok: true, needsConfirm: !data.session }
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
  // next getCurrentSession (e.g. when the photo page navigates back).
  photoCache = { uid: user.id, photo: photo ?? undefined }
  return { ok: true }
}

/* ── Logout ────────────────────────────────────────────────────────────────── */

export async function logout(): Promise<void> {
  photoCache = null
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

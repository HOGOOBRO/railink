import { supabase } from './supabase'
import { DEMO_ME, DEMO_LOGIN } from './demo-data'
import { seedDemo } from './demo-seed'

export interface Session {
  uid: string
  email: string
  name: string
  employeeId: string
  part?: string
  photo?: string
  /** True when this session is the local demo (localStorage), not Supabase. */
  isDemo: boolean
}

/* ── Demo path (localStorage) ──────────────────────────────────────────────
 * Only the fixed demo credentials use this. Real accounts go through Supabase.
 * Schedules/compare are still localStorage in Phase 6a, so a localStorage demo
 * session is consistent with that. */

const DEMO_SESSION_KEY = 'railink_demo_session_v3'

export function isDemoCreds(email: string, pw: string): boolean {
  return email === DEMO_LOGIN.email && pw === DEMO_LOGIN.pw
}

function demoSession(): Session {
  return {
    uid: DEMO_ME.uid, email: DEMO_ME.email, name: DEMO_ME.name,
    employeeId: DEMO_ME.employeeId, part: DEMO_ME.part, photo: DEMO_ME.photo,
    isDemo: true,
  }
}

function getDemoSession(): Session | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(DEMO_SESSION_KEY) ? demoSession() : null
}

/* ── Unified session (used by calendar / menu) ─────────────────────────────── */

export async function getCurrentSession(): Promise<Session | null> {
  const demo = getDemoSession()
  if (demo) return demo
  const { data } = await supabase.auth.getSession()
  const u = data.session?.user
  if (!u) return null
  const m = (u.user_metadata ?? {}) as Record<string, string>
  return {
    uid: u.id,
    email: u.email ?? '',
    name: m.name ?? '',
    employeeId: m.employee_id ?? '',
    part: m.part || undefined,
    photo: m.photo || undefined,
    isDemo: false,
  }
}

/* ── Login ─────────────────────────────────────────────────────────────────── */

export type LoginResult =
  | { ok: true; demo: boolean }
  | { ok: false; code: 'invalid' | 'unconfirmed' | 'error'; message: string }

export async function login(email: string, password: string): Promise<LoginResult> {
  if (isDemoCreds(email, password)) {
    seedDemo()
    localStorage.setItem(DEMO_SESSION_KEY, '1')
    return { ok: true, demo: true }
  }
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

/* ── Sign-up ───────────────────────────────────────────────────────────────── */

export interface SignupInput {
  email: string
  password: string
  employeeId: string
  name: string
  part?: string
}

export type SignupResult =
  | { ok: true; needsConfirm: boolean }
  | { ok: false; field?: 'email'; message: string }

export async function signup(input: SignupInput): Promise<SignupResult> {
  const emailRedirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo,
      data: {
        employee_id: input.employeeId,
        name: input.name,
        part: input.part ?? null,
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

/* ── Logout ────────────────────────────────────────────────────────────────── */

export async function logout(): Promise<void> {
  if (typeof window !== 'undefined') localStorage.removeItem(DEMO_SESSION_KEY)
  await supabase.auth.signOut()
}

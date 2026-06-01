/* Invite links — thin client over the create/consume/revoke RPCs from the
 * 20260531000000 migration. An invite is single-use and 14-day. consume_invite
 * creates a BIDIRECTIONAL accepted schedule_shares pair, so after consuming, the
 * inviter shows up in the new user's `viewing` list (lib/store/shares.ts) and
 * vice-versa — no separate accept step.
 *
 * Demo accounts (localStorage session) never hit Supabase: createInvite returns
 * a stable fake token so the 친구 초대 sheet still demonstrates, and consume/
 * revoke are no-ops. */
import { supabase } from '../supabase'
import { isDemoActive } from '../auth'

/** Stable token shown to demo users so the invite-create sheet renders a
 *  plausible link without writing to the DB. Never valid for a real consume. */
export const DEMO_INVITE_TOKEN = 'demo00000000demo00000000demo0000'

export interface InviteOwner {
  id: string
  name: string
  /** owner's localStorage groupId the invite was tagged with (may be null). */
  groupId: string | null
}

export type CreateInviteResult =
  | { ok: true; token: string }
  | { ok: false; message: string }

export type ConsumeInviteResult =
  | { ok: true; owner: InviteOwner }
  | { ok: false; code: InviteErrorCode; message: string }

export type InviteErrorCode =
  | 'invite_not_found' | 'invite_used' | 'invite_revoked' | 'invite_expired'
  | 'invite_self' | 'invite_email_mismatch' | 'invite_rate_limit'
  | 'not_authenticated' | 'unknown'

/** A row from the owner's own invites list (RLS: owner_id = me). */
export interface MyInvite {
  token: string
  groupId: string | null
  inviteeEmail: string | null
  createdAt: string
  expiresAt: string
  usedAt: string | null
  revokedAt: string | null
}

function parseCode(message: string): InviteErrorCode {
  const known: InviteErrorCode[] = [
    'invite_not_found', 'invite_used', 'invite_revoked', 'invite_expired',
    'invite_self', 'invite_email_mismatch', 'invite_rate_limit',
  ]
  for (const c of known) if (message.includes(c)) return c
  if (/not authenticated/i.test(message)) return 'not_authenticated'
  return 'unknown'
}

const CODE_COPY: Record<InviteErrorCode, string> = {
  invite_not_found: '유효하지 않은 초대 링크예요.',
  invite_used: '이미 사용된 초대 링크예요.',
  invite_revoked: '취소된 초대 링크예요.',
  invite_expired: '만료된 초대 링크예요. 새 링크를 요청해 주세요.',
  invite_self: '본인이 만든 링크로는 가입할 수 없어요.',
  invite_email_mismatch: '이 링크는 지정된 이메일로만 가입할 수 있어요.',
  invite_rate_limit: '하루에 만들 수 있는 초대 링크 수를 초과했어요. 내일 다시 시도해 주세요.',
  not_authenticated: '로그인 상태를 확인한 뒤 다시 시도해 주세요.',
  unknown: '잠시 후 다시 시도해 주세요.',
}

/** Create an invite tagged with the active group (optional) and an optional
 *  invitee email for match-checking. Returns the token to assemble into a link. */
export async function createInvite(
  groupId?: string | null,
  inviteeEmail?: string | null,
): Promise<CreateInviteResult> {
  if (isDemoActive()) return { ok: true, token: DEMO_INVITE_TOKEN }
  const { data, error } = await supabase.rpc('create_invite', {
    group_id_param: groupId ?? null,
    invitee_email_param: inviteeEmail ?? null,
  })
  if (error) return { ok: false, message: CODE_COPY[parseCode(error.message)] }
  if (typeof data !== 'string' || !data) {
    return { ok: false, message: CODE_COPY.unknown }
  }
  return { ok: true, token: data }
}

/** Consume a token right after signup/verification. Creates the bidirectional
 *  accepted shares and returns the inviter so the UI can greet + auto-group. */
export async function consumeInvite(token: string): Promise<ConsumeInviteResult> {
  if (isDemoActive()) {
    return { ok: false, code: 'unknown', message: '데모 계정에서는 초대 연결을 사용할 수 없어요.' }
  }
  const { data, error } = await supabase.rpc('consume_invite', { token_param: token })
  if (error) {
    const code = parseCode(error.message)
    return { ok: false, code, message: CODE_COPY[code] }
  }
  // Result keys are inviter_id/inviter_name/inviter_group_id since the
  // 20260601010000 ambiguity fix renamed the RPC's OUT params (the old
  // owner_* names collided with schedule_shares columns → 42702).
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row.inviter_id !== 'string') {
    return { ok: false, code: 'invite_not_found', message: CODE_COPY.invite_not_found }
  }
  return {
    ok: true,
    owner: {
      id: row.inviter_id as string,
      name: (row.inviter_name as string) ?? '',
      groupId: (row.inviter_group_id as string | null) ?? null,
    },
  }
}

/** Resolve the inviter's display name from a token, callable before auth (anon).
 *  Returns null for unusable/unknown tokens so the header can fall back to
 *  name-agnostic copy. Demo token resolves to a sample name for the demo story. */
export async function peekInvite(token: string): Promise<string | null> {
  if (token === DEMO_INVITE_TOKEN) return 'Theo'
  const { data, error } = await supabase.rpc('peek_invite', { token_param: token })
  if (error || typeof data !== 'string' || !data) return null
  return data
}

/** The owner's own invites (newest first). Empty for demo / no session. */
export async function listMine(): Promise<MyInvite[]> {
  if (isDemoActive()) return []
  const { data, error } = await supabase
    .from('invites')
    .select('token, owner_group_id, invitee_email, created_at, expires_at, used_at, revoked_at')
    .order('created_at', { ascending: false })
  if (error || !Array.isArray(data)) return []
  return data.map(r => ({
    token: r.token as string,
    groupId: (r.owner_group_id as string | null) ?? null,
    inviteeEmail: (r.invitee_email as string | null) ?? null,
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
    usedAt: (r.used_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
  }))
}

/** Revoke an unused invite (owner only, idempotent). */
export async function revokeInvite(token: string): Promise<{ ok: boolean; message?: string }> {
  if (isDemoActive()) return { ok: true }
  const { error } = await supabase.rpc('revoke_invite', { token_param: token })
  if (error) return { ok: false, message: CODE_COPY[parseCode(error.message)] }
  return { ok: true }
}

/* ── Pending invite (survives the email-verification round trip) ──────────────
 * Email confirmation is ON, so a user who lands on /signup?invite=TOKEN is not
 * authenticated until they click the email link and log in — by which point the
 * URL (and its token) is gone. We stash the token here on entry and consume it
 * at the first authenticated moment (login success, or an immediate session). */
const PENDING_INVITE_KEY = 'railink_pending_invite'

export function savePendingInvite(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(PENDING_INVITE_KEY, token)
}

export function getPendingInvite(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(PENDING_INVITE_KEY)
}

export function clearPendingInvite(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(PENDING_INVITE_KEY)
}

const TERMINAL_CODES: InviteErrorCode[] = [
  'invite_not_found', 'invite_used', 'invite_revoked',
  'invite_expired', 'invite_self', 'invite_email_mismatch',
]

/** Consume the stashed token now that the user is authenticated. Clears it on
 *  success or any terminal failure (dead token); keeps it for retryable ones
 *  (no session yet / transient) so the next login can try again. Returns the
 *  inviter on success — for a greeting and (PR-4) auto-adding to a group. */
export async function consumePendingInvite(): Promise<InviteOwner | null> {
  const token = getPendingInvite()
  if (!token || isDemoActive()) return null
  const res = await consumeInvite(token)
  if (res.ok) { clearPendingInvite(); return res.owner }
  if (TERMINAL_CODES.includes(res.code)) clearPendingInvite()
  return null
}

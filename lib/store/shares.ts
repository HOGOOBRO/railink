/* Selective schedule sharing — thin client over the consent RPCs from the
 * 20260526000000 migration. Visibility (search exposure) is separate and lives
 * in lib/auth.ts (setVisibility). Here we only touch schedule_shares: who may
 * see whose schedule, one direction at a time, by mutual consent.
 *
 * All writes go through SECURITY DEFINER RPCs; reads come straight off the
 * schedule_shares table under the shares_select_self RLS policy (rows where I'm
 * either party). */
import { supabase } from '../supabase'
import type { ShareStatus } from '../types/schedule'

export interface ShareRow {
  ownerId: string
  viewerId: string
  status: ShareStatus
  requestedAt: string
  respondedAt: string | null
}

/** A share relationship grouped from my point of view.
 *  - incoming: someone asked to view MY schedule, awaiting my response.
 *  - outgoing: I asked to view someone, awaiting theirs.
 *  - sharing:  accepted, I'm the owner — they can see me; I can 중지.
 *  - viewing:  accepted, I'm the viewer — I can see them (feeds compare). */
export interface ShareLists {
  incoming: ShareRow[]
  outgoing: ShareRow[]
  sharing: ShareRow[]
  viewing: ShareRow[]
}

export type ShareResult =
  | { ok: true; row?: ShareRow }
  | { ok: false; message: string }

interface RawShareRow {
  owner_id: string
  viewer_id: string
  status: ShareStatus
  requested_at: string
  responded_at: string | null
}

function toRow(r: RawShareRow): ShareRow {
  return {
    ownerId: r.owner_id,
    viewerId: r.viewer_id,
    status: r.status,
    requestedAt: r.requested_at,
    respondedAt: r.responded_at,
  }
}

// Map the RPCs' `raise exception` messages to user-facing copy.
function mapError(message: string): string {
  if (/authentication required/i.test(message)) return '로그인 상태를 확인한 뒤 다시 시도해 주세요.'
  if (/invalid target/i.test(message)) return '본인에게는 요청할 수 없어요.'
  if (/owner not found/i.test(message)) return '그 동료를 찾을 수 없어요.'
  if (/not found/i.test(message)) return '이미 처리된 요청이에요. 새로고침 후 다시 확인해 주세요.'
  return '잠시 후 다시 시도해 주세요.'
}

/** viewer → owner: request to view their schedule (re-sends after a revoke). */
export async function requestShare(ownerId: string): Promise<ShareResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (user && user.id === ownerId) return { ok: false, message: '본인에게는 요청할 수 없어요.' }
  const { data, error } = await supabase.rpc('request_schedule_share', { target_owner_id: ownerId })
  if (error) return { ok: false, message: mapError(error.message) }
  return { ok: true, row: data ? toRow(data as RawShareRow) : undefined }
}

/** owner: accept (true) or decline/revoke (false) a viewer's request. */
export async function respondShare(viewerId: string, accept: boolean): Promise<ShareResult> {
  const { data, error } = await supabase.rpc('respond_schedule_share', {
    target_viewer_id: viewerId, accept,
  })
  if (error) return { ok: false, message: mapError(error.message) }
  return { ok: true, row: data ? toRow(data as RawShareRow) : undefined }
}

/** viewer: cancel my pending request, or stop following an accepted share. */
export async function cancelShare(ownerId: string): Promise<ShareResult> {
  const { error } = await supabase.rpc('cancel_schedule_share', { target_owner_id: ownerId })
  if (error) return { ok: false, message: mapError(error.message) }
  return { ok: true }
}

/** All of my share relationships, grouped (see ShareLists).
 *
 * NOTE for PR-3 (settings display): the counterparty's profile (name/사번/등)
 * is NOT always readable here. A `private` user with a still-`pending` request
 * — in either direction — has no accepted share yet, so profiles RLS hides
 * their row. Resolving names for pending/private counterparties needs a
 * dedicated SECURITY DEFINER RPC (shares-with-profile); not built yet. */
export async function listShares(): Promise<ShareLists> {
  const empty: ShareLists = { incoming: [], outgoing: [], sharing: [], viewing: [] }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const { data, error } = await supabase
    .from('schedule_shares')
    .select('owner_id, viewer_id, status, requested_at, responded_at')
  if (error || !data) return empty

  const rows = (data as RawShareRow[]).map(toRow)
  const me = user.id
  return {
    incoming: rows.filter(r => r.status === 'pending' && r.ownerId === me),
    outgoing: rows.filter(r => r.status === 'pending' && r.viewerId === me),
    sharing: rows.filter(r => r.status === 'accepted' && r.ownerId === me),
    viewing: rows.filter(r => r.status === 'accepted' && r.viewerId === me),
  }
}

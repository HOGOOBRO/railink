/* 약속 잡기 (Appointment) store.
 *
 * MVP: localStorage-only, mirroring the demo/local pattern of the schedule
 * store. Supabase persistence (a new `appointments` + `appointment_participants`
 * table behind SECURITY DEFINER RPCs, with solo `title` visibility gated by an
 * accepted schedule_share — see the handoff review) is staged for after the
 * feature is approved; the function surface here is shaped so a remote backing
 * can slot in without touching callers.
 */

import type { Appointment, AppointmentStatus } from '@/lib/types/schedule'
import { supabase } from '@/lib/supabase'

const KEY = 'railink_appointments_v1'

function read(): Appointment[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function write(list: Appointment[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(list))
}

function newId(): string {
  return 'ap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** True when `uid` can see the appointment (owner or invited participant). */
function visibleTo(a: Appointment, uid: string): boolean {
  return a.ownerUid === uid || a.participants.includes(uid)
}

/** Appointments visible to `uid` whose date falls in the given month. */
export function getMonthAppointments(uid: string, year: number, month: number): Appointment[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return read().filter(a => a.date.startsWith(prefix) && visibleTo(a, uid))
}

export function addAppointment(appt: Omit<Appointment, 'id'>): Appointment {
  const full: Appointment = { ...appt, id: newId() }
  write([...read(), full])
  return full
}

export function deleteAppointment(id: string): void {
  write(read().filter(a => a.id !== id))
}

/* ── Remote (Supabase) — used for real accounts; demo stays localStorage. ──
 * Reads go through the appointments_for_month RPC, which masks the title/place/
 * memo of a colleague's solo 'busy' appointment (server-side column security).
 */

interface RemoteApptRow {
  id: unknown; ownerId: unknown; type: unknown; date: unknown
  title: unknown; start: unknown; end: unknown; place: unknown; memo: unknown
  visibility: unknown; myStatus: unknown; participants: unknown
}

function asStatus(v: unknown): AppointmentStatus | undefined {
  return v === 'pending' || v === 'accepted' || v === 'declined' ? v : undefined
}

function parseRemoteAppt(row: RemoteApptRow): Appointment | null {
  if (typeof row.id !== 'string' || typeof row.ownerId !== 'string' || typeof row.date !== 'string') return null
  const masked = row.title == null   // solo 'busy' viewed by a colleague
  const participants: string[] = []
  const participantStatuses: Record<string, AppointmentStatus> = {}
  if (Array.isArray(row.participants)) {
    for (const p of row.participants) {
      if (p && typeof p === 'object' && 'uid' in p) {
        const uid = String((p as { uid: unknown }).uid)
        participants.push(uid)
        const st = asStatus((p as { status?: unknown }).status)
        if (st) participantStatuses[uid] = st
      }
    }
  }
  return {
    id: row.id,
    type: row.type === 'group' ? 'group' : 'solo',
    date: row.date,
    title: masked ? '일정 있음' : String(row.title),
    start: typeof row.start === 'string' ? row.start : undefined,
    end: typeof row.end === 'string' ? row.end : undefined,
    place: typeof row.place === 'string' ? row.place : undefined,
    memo: typeof row.memo === 'string' ? row.memo : undefined,
    ownerUid: row.ownerId,
    participants,
    visibility: row.visibility === 'title' ? 'title' : row.visibility === 'busy' ? 'busy' : undefined,
    participantStatuses,
    myStatus: asStatus(row.myStatus),
    busyMasked: masked,
  }
}

export async function getRemoteMonthAppointments(year: number, month: number): Promise<Appointment[]> {
  const { data, error } = await supabase.rpc('appointments_for_month', { p_year: year, p_month: month })
  if (error) throw new Error(formatApptError(error.message))
  const arr = Array.isArray(data) ? data : []
  return arr.map(r => parseRemoteAppt(r as RemoteApptRow)).filter((a): a is Appointment => Boolean(a))
}

/** Create on the server; returns the new appointment id. The RPC adds the owner
 *  as an accepted participant and the rest as pending. */
export async function createRemoteAppointment(appt: Omit<Appointment, 'id'>): Promise<string> {
  const others = appt.participants.filter(u => u !== appt.ownerUid)
  const { data, error } = await supabase.rpc('create_appointment', {
    p_type: appt.type,
    p_date: appt.date,
    p_title: appt.title,
    p_start: appt.start ?? null,
    p_end: appt.end ?? null,
    p_place: appt.place ?? null,
    p_memo: appt.memo ?? null,
    p_visibility: appt.visibility ?? null,
    p_participants: others,
  })
  if (error) throw new Error(formatApptError(error.message))
  return String(data)
}

export async function deleteRemoteAppointment(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_appointment', { p_id: id })
  if (error) throw new Error(formatApptError(error.message))
}

/* ── 받은 약속 초대(월 무관) — 캘린더 초대 배너용. ──
 * 마이그레이션 불필요: appt_participants_select RLS가 내 행을, appointments_select_member가
 * 참여 중인 약속 행을 직접 SELECT로 허용한다(참여자는 title 열람 자격이 있어 마스킹도 불필요).
 * user_id 필터는 필수 — 같은 정책이 "내가 소유한 약속"의 타인 pending 행도 보여주기 때문. */

export interface PendingApptInvite {
  id: string        // appointment id
  date: string      // YYYY-MM-DD
  title: string
  ownerUid: string
}

export async function getMyPendingApptInvites(uid: string): Promise<PendingApptInvite[]> {
  const { data, error } = await supabase
    .from('appointment_participants')
    .select('appointment_id, appointments(appt_date, title, owner_id)')
    .eq('user_id', uid)
    .eq('status', 'pending')
  if (error) throw new Error(formatApptError(error.message))
  const out: PendingApptInvite[] = []
  for (const row of data ?? []) {
    const appt = (row as { appointments?: unknown }).appointments
    if (!appt || typeof appt !== 'object' || Array.isArray(appt)) continue
    const a = appt as { appt_date?: unknown; title?: unknown; owner_id?: unknown }
    if (typeof a.appt_date !== 'string' || typeof a.owner_id !== 'string') continue
    out.push({
      id: String((row as { appointment_id: unknown }).appointment_id),
      date: a.appt_date,
      title: typeof a.title === 'string' ? a.title : '',
      ownerUid: a.owner_id,
    })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date))
}

/** Invitee accepts/declines a group appointment. */
export async function respondRemoteAppointment(id: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_appointment', { p_id: id, p_accept: accept })
  if (error) throw new Error(formatApptError(error.message))
}

function formatApptError(message: string): string {
  if (/appointment|does not exist|could not find the function|schema cache/i.test(message)) {
    return '약속 저장 SQL이 아직 적용되지 않아 약속을 연동할 수 없어요.'
  }
  if (/row-level security|permission denied|policy/i.test(message)) {
    return '약속 권한을 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.'
  }
  return message || '약속 저장소에 연결할 수 없어요.'
}

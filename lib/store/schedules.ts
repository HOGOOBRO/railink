import type { ScheduleEntry } from '@/lib/types/schedule'
import { supabase } from '@/lib/supabase'

const KEY = 'railink_schedules_v3'

interface RemoteScheduleRow {
  user_id: unknown
  work_date: unknown
  dia_nr: unknown
  train_nr: unknown
  start_time: unknown
  end_time: unknown
  is_off: unknown
}

export function getSchedules(): ScheduleEntry[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveSchedules(entries: ScheduleEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries))
}

export function getMonthSchedules(uid: string, year: number, month: number): ScheduleEntry[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return getSchedules().filter(e => e.uid === uid && e.date.startsWith(prefix))
}

export function getDateSchedules(uid: string, date: string): ScheduleEntry[] {
  return getSchedules().filter(e => e.uid === uid && e.date === date)
}

/** Replace all of a user's schedule entries with `entries`. */
export function replaceUserSchedule(uid: string, entries: ScheduleEntry[]): void {
  const others = getSchedules().filter(e => e.uid !== uid)
  saveSchedules([...others, ...entries])
}

/** Replace only the months included in `entries`, preserving other months. */
export function replaceUserScheduleMonths(uid: string, entries: ScheduleEntry[]): void {
  const monthPrefixes = new Set(entries.map(e => e.date.slice(0, 7)))
  const others = getSchedules().filter(e => e.uid !== uid || !monthPrefixes.has(e.date.slice(0, 7)))
  saveSchedules([...others, ...entries])
}

/** Mirror one month of the remote colleague fetch into the local cache, for
 *  every fetched uid. Unlike replaceUserScheduleMonths, a uid with an *empty*
 *  result still gets its month cleared — a revoked share or deleted schedule
 *  must not keep rendering from stale cache on the next boot. */
export function replaceUsersMonthCache(
  uids: string[], year: number, month: number, byUid: Record<string, ScheduleEntry[]>,
): void {
  if (!uids.length) return
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const uidSet = new Set(uids)
  const others = getSchedules().filter(e => !uidSet.has(e.uid) || !e.date.startsWith(prefix))
  saveSchedules([...others, ...uids.flatMap(uid => byUid[uid] ?? [])])
}

export async function getRemoteMonthSchedules(uid: string, year: number, month: number): Promise<ScheduleEntry[]> {
  const { start, end } = monthRange(year, month)
  const { data, error } = await supabase
    .from('schedules')
    .select('user_id,work_date,dia_nr,train_nr,start_time,end_time,is_off')
    .eq('user_id', uid)
    .gte('work_date', start)
    .lt('work_date', end)
    .order('work_date', { ascending: true })

  if (error) throw new Error(formatScheduleStoreError(error.message))
  if (!Array.isArray(data)) return []

  return data
    .map(row => mapRemoteSchedule(row as RemoteScheduleRow))
    .filter((row): row is ScheduleEntry => Boolean(row))
}

export async function getRemoteMonthSchedulesForUsers(
  uids: string[], year: number, month: number,
): Promise<Record<string, ScheduleEntry[]>> {
  const uniqueUids = [...new Set(uids)].filter(Boolean)
  if (!uniqueUids.length) return {}

  const { start, end } = monthRange(year, month)
  const { data, error } = await supabase
    .from('schedules')
    .select('user_id,work_date,dia_nr,train_nr,start_time,end_time,is_off')
    .in('user_id', uniqueUids)
    .gte('work_date', start)
    .lt('work_date', end)
    .order('work_date', { ascending: true })

  if (error) throw new Error(formatScheduleStoreError(error.message))
  if (!Array.isArray(data)) return {}

  const grouped: Record<string, ScheduleEntry[]> = {}
  for (const row of data) {
    const entry = mapRemoteSchedule(row as RemoteScheduleRow)
    if (!entry) continue
    grouped[entry.uid] = [...(grouped[entry.uid] ?? []), entry]
  }
  return grouped
}

export async function replaceRemoteUserScheduleMonths(uid: string, entries: ScheduleEntry[]): Promise<void> {
  if (entries.some(entry => entry.uid !== uid)) {
    throw new Error('다른 사용자의 근무표는 저장할 수 없어요.')
  }

  if (!entries.length) return

  const payload = entries.map(entry => ({
    user_id: uid,
    work_date: entry.date,
    dia_nr: entry.diaNr ?? null,
    train_nr: entry.trainNr ?? null,
    start_time: entry.startTime ?? null,
    end_time: entry.endTime ?? null,
    is_off: entry.isOff,
  }))

  const { data, error } = await supabase.rpc('replace_schedule_months', { entries: payload })
  if (error) throw new Error(formatScheduleStoreError(error.message))
  if (data !== payload.length) {
    throw new Error('근무표 저장 결과를 확인하지 못했어요. 다시 저장해 주세요.')
  }
}

function mapRemoteSchedule(row: RemoteScheduleRow): ScheduleEntry | null {
  if (typeof row.user_id !== 'string') return null
  if (typeof row.work_date !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.work_date)) return null

  const isOff = Boolean(row.is_off)
  return {
    uid: row.user_id,
    date: row.work_date,
    diaNr: typeof row.dia_nr === 'string' && row.dia_nr.trim() ? row.dia_nr.trim() : undefined,
    trainNr: typeof row.train_nr === 'string' && row.train_nr.trim() ? row.train_nr.trim() : undefined,
    startTime: typeof row.start_time === 'string' && row.start_time.trim() ? row.start_time.trim() : undefined,
    endTime: typeof row.end_time === 'string' && row.end_time.trim() ? row.end_time.trim() : undefined,
    isOff,
  }
}

function monthRange(year: number, month: number): { start: string; end: string } {
  return monthRangeFromPrefix(`${year}-${String(month).padStart(2, '0')}`)
}

function monthRangeFromPrefix(prefix: string): { start: string; end: string } {
  const year = Number(prefix.slice(0, 4))
  const month = Number(prefix.slice(5, 7))
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return {
    start: `${prefix}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  }
}

function formatScheduleStoreError(message: string): string {
  if (/replace_schedule_months|schedules|schema cache|relation|does not exist|could not find the function/i.test(message)) {
    return '근무표 저장 기능을 준비하고 있어요. 잠시 후 다시 시도해 주세요.'
  }
  if (/row-level security|permission denied|policy/i.test(message)) {
    return '근무표 저장 권한을 확인하지 못했어요. 다시 로그인한 뒤 저장해 주세요.'
  }
  return message || '근무표 저장소에 연결할 수 없어요.'
}

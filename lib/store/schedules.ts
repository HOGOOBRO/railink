import type { ScheduleEntry } from '@/lib/types/schedule'

const KEY = 'railink_schedules_v3'

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

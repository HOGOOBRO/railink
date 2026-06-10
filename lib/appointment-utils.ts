/* Helpers for 약속 잡기 — the "다 같이 쉬는 날" finder and the 근무 겹침 overlap
 * check. Both run over schedule data already loaded into the calendar page
 * (decision #3: per-month, no extra fetch), so they take an `entryOf` lookup
 * rather than touching the store. */

import type { ScheduleEntry } from '@/lib/types/schedule'
import { hmToDecimal } from '@/lib/schedule-utils'
import { holidayNameFor } from '@/lib/holidays-kr'

export type EntryOf = (uid: string, iso: string) => ScheduleEntry | undefined

export interface FreeDay {
  iso: string
  d: number
  dow: number            // 0=일 … 6=토
  holiday: string | null
  freeIds: string[]
  busyIds: string[]
}

/** "Off" = public holiday OR a rest-day entry OR no entry at all (unknown is
 *  treated as free, matching the prototype's finder). A working entry = busy. */
export function isPersonOff(entry: ScheduleEntry | undefined, iso: string): boolean {
  if (holidayNameFor(iso)) return true
  if (!entry) return true
  return entry.isOff
}

/** True when at least one participant has a real schedule entry that day — used
 *  to avoid flagging an empty (un-loaded) future month as "all free". */
function hasAnyData(participantIds: string[], iso: string, entryOf: EntryOf): boolean {
  return participantIds.some(pid => entryOf(pid, iso) !== undefined)
}

/**
 * Scan `year-month` from `fromDay` for days where everyone-but-at-most-one of
 * `participantIds` is off. Sorted by (fewest busy, soonest). Per-month so it
 * reuses already-loaded data; the wizard exposes month navigation for the rest.
 */
export function findFreeDays(
  participantIds: string[],
  year: number,
  month: number,
  fromDay: number,
  entryOf: EntryOf,
): FreeDay[] {
  const dim = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  const out: FreeDay[] = []
  for (let d = Math.max(1, fromDay); d <= dim; d++) {
    const iso = `${year}-${mm}-${String(d).padStart(2, '0')}`
    if (!hasAnyData(participantIds, iso, entryOf) && !holidayNameFor(iso)) continue
    const freeIds: string[] = []
    const busyIds: string[] = []
    for (const pid of participantIds) {
      if (isPersonOff(entryOf(pid, iso), iso)) freeIds.push(pid)
      else busyIds.push(pid)
    }
    if (busyIds.length <= 1 && freeIds.length >= Math.max(2, participantIds.length - 1)) {
      out.push({ iso, d, dow: new Date(year, month - 1, d).getDay(), holiday: holidayNameFor(iso), freeIds, busyIds })
    }
  }
  out.sort((a, b) => (a.busyIds.length - b.busyIds.length) || (a.d - b.d))
  return out
}

export interface Overlap {
  uid: string
  entry: ScheduleEntry
}

/** Participants whose shift overlaps the appointment window [start, end).
 *  end unset → treated as start + 1h. Overnight-aware (end clock < start → +24h). */
export function findOverlaps(
  participantIds: string[],
  iso: string,
  start: string | undefined,
  end: string | undefined,
  entryOf: EntryOf,
): Overlap[] {
  if (!start) return []
  const aStart = hmToDecimal(start)
  const aEnd = end ? hmToDecimal(end) : aStart + 1
  const out: Overlap[] = []
  for (const pid of participantIds) {
    const e = entryOf(pid, iso)
    if (!e || e.isOff || !e.startTime || !e.endTime) continue
    const s = hmToDecimal(e.startTime)
    let t = hmToDecimal(e.endTime)
    if (t <= s) t += 24
    if (aStart < t && aEnd > s) out.push({ uid: pid, entry: e })
  }
  return out
}

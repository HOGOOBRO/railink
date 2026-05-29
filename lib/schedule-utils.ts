/* Calendar / timeline helpers shared by the calendar page and its overlays. */

export const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const DOW_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
export const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

export interface Cell {
  d: number
  isOther: boolean      // belongs to prev/next month
  iso: string | null    // YYYY-MM-DD for in-month days
}

/** 5–6 week grid for a month (cells include leading/trailing other-month days). */
export function buildMonthCells(y: number, m: number): Cell[][] {
  const startDow = new Date(y, m - 1, 1).getDay()
  const dim = new Date(y, m, 0).getDate()
  const prevDim = new Date(y, m - 1, 0).getDate()
  const cells: Cell[] = []
  for (let i = 0; i < startDow; i++)
    cells.push({ d: prevDim - startDow + 1 + i, isOther: true, iso: null })
  for (let d = 1; d <= dim; d++)
    cells.push({ d, isOther: false, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  let nd = 1
  while (cells.length % 7 !== 0) cells.push({ d: nd++, isOther: true, iso: null })
  while (cells.length < 35) cells.push({ d: nd++, isOther: true, iso: null })
  const weeks: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** "25:13" → 25.2167 (hour may exceed 24 to represent 익일). */
export function hmToDecimal(s?: string): number {
  if (!s) return 0
  const [h, m] = s.split(':').map(Number)
  return h + (m || 0) / 60
}

/** Live-format what the user is typing into a time input.
 *  Mobile numeric keypads have no colon key, so users type "0530" expecting
 *  05:30. Strip non-digits, cap to 4 chars, insert a colon after the hour.
 *  Pass-through for partial input ("0", "05", "053") so editing feels natural. */
export function normalizeTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

/** Decimal hour → "HH:MM" wrapped to a 24h clock for display. */
export function fmtClock(h: number): string {
  const dayH = ((h % 24) + 24) % 24
  const hh = Math.floor(dayH)
  const mm = Math.round((dayH - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Decimal hour → "HH:MM" WITHOUT wrapping (HH may exceed 24 = 익일 종료).
 * The canonical storage form for an overnight end (e.g. 35.82 → "35:49"). */
export function fmtHM(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** True when end lands on the next day (end clock earlier than start clock). */
export function isOvernight(startTime?: string, endTime?: string): boolean {
  if (!startTime || !endTime) return false
  const e = hmToDecimal(endTime) % 24
  return e < hmToDecimal(startTime) % 24
}

/** Canonical overnight-aware end string from possibly-wrapped user input:
 * same-day → "HH:MM", 익일 → 24+ notation ("35:49"). */
export function canonicalEnd(startTime?: string, endTime?: string): string | undefined {
  if (!endTime) return undefined
  const eBase = hmToDecimal(endTime) % 24
  if (!startTime) return fmtHM(eBase)
  return fmtHM(eBase < hmToDecimal(startTime) % 24 ? eBase + 24 : eBase)
}

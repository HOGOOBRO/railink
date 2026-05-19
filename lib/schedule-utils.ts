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

/** Decimal hour → "HH:MM" wrapped to a 24h clock for display. */
export function fmtClock(h: number): string {
  const dayH = ((h % 24) + 24) % 24
  const hh = Math.floor(dayH)
  const mm = Math.round((dayH - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

import type { CompareEntry, CompareColor } from '@/lib/types/schedule'

const KEY = 'railink_compare_v3'

export const MAX_COMPARE = 10

const COLORS: CompareColor[] = [
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10',
]

export function getCompareList(): CompareEntry[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveCompareList(list: CompareEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(list))
}

interface AddOpts {
  photo?: string
  office?: string
}

export function addCompare(
  uid: string, name: string, employeeId: string, opts: AddOpts = {},
): CompareEntry | null {
  const list = getCompareList()
  if (list.some(e => e.uid === uid)) return list.find(e => e.uid === uid) ?? null
  if (list.length >= MAX_COMPARE) return null
  const usedColors = new Set(list.map(e => e.color))
  const color = COLORS.find(c => !usedColors.has(c)) ?? 'c1'
  const entry: CompareEntry = { uid, name, employeeId, color, ...opts }
  saveCompareList([...list, entry])
  return entry
}

export function removeCompare(uid: string): void {
  saveCompareList(getCompareList().filter(e => e.uid !== uid))
}

export function isComparing(uid: string): boolean {
  return getCompareList().some(e => e.uid === uid)
}

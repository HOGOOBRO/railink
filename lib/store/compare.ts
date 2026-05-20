import type { CompareEntry, CompareColor } from '@/lib/types/schedule'

const KEY = 'railink_compare_v4'

export const MAX_COMPARE = 10

const COLORS: CompareColor[] = [
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10',
]

type Map = Record<string, CompareEntry[]>

function readMap(): Map {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

function writeMap(map: Map): void {
  localStorage.setItem(KEY, JSON.stringify(map))
}

export function getCompareList(ownerUid: string): CompareEntry[] {
  return readMap()[ownerUid] ?? []
}

export function saveCompareList(ownerUid: string, list: CompareEntry[]): void {
  const map = readMap()
  map[ownerUid] = list
  writeMap(map)
}

interface AddOpts {
  photo?: string
  office?: string
}

export function addCompare(
  ownerUid: string, uid: string, name: string, employeeId: string, opts: AddOpts = {},
): CompareEntry | null {
  const list = getCompareList(ownerUid)
  if (list.some(e => e.uid === uid)) return list.find(e => e.uid === uid) ?? null
  if (list.length >= MAX_COMPARE) return null
  const usedColors = new Set(list.map(e => e.color))
  const color = COLORS.find(c => !usedColors.has(c)) ?? 'c1'
  const entry: CompareEntry = { uid, name, employeeId, color, ...opts }
  saveCompareList(ownerUid, [...list, entry])
  return entry
}

export function removeCompare(ownerUid: string, uid: string): void {
  saveCompareList(ownerUid, getCompareList(ownerUid).filter(e => e.uid !== uid))
}

export function isComparing(ownerUid: string, uid: string): boolean {
  return getCompareList(ownerUid).some(e => e.uid === uid)
}

/** Storage key — exported for cleanup code. */
export const COMPARE_KEY = KEY

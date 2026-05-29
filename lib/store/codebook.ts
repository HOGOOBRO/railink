/* 근무 코드북 — 사용자가 자주 쓰는 근무 패턴을 라벨+시간으로 미리 정의.
 *
 * Shape (per owner uid, 같은 isolation 원칙 — [[lib/store/groups.ts]] 와 동일):
 *   { codes: CodebookEntry[] }
 *
 * 휴무 코드 (DO, 연차) 는 isOff=true, 시간 없음.
 * 근무 코드 (N, A, B, 출장) 는 isOff=false, startTime/endTime 필수.
 *
 * 사용처: ManualBody 의 페인트 palette + (선택) AI prompt 의 코드 hint.
 */

export interface CodebookEntry {
  id: string
  label: string
  isOff: boolean
  startTime?: string  // "HH:MM" (24h). undefined ⇔ isOff
  endTime?: string    // "HH:MM" (24h). 익일은 24+ 표기 또는 wrap.
}

export interface CodebookState {
  codes: CodebookEntry[]
}

const KEY = 'railink_codebook_v1'
export const CODEBOOK_KEY = KEY

export const MAX_CODES = 20
export const MAX_LABEL = 8

type Store = Record<string, CodebookState>

function read(): Store {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(store))
}

function newId(): string {
  return `cb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function getCodebook(uid: string): CodebookState {
  const store = read()
  return store[uid] ?? { codes: [] }
}

export function saveCodebook(uid: string, state: CodebookState): void {
  const store = read()
  store[uid] = state
  write(store)
}

/** 빈 코드북에 시드할 일반적인 항목들. 첫 진입 시 사용자가 0개 보다는
 * 살짝 채워진 상태에서 시작하면 흐름이 자연스럽다. 사용자가 그대로 두든
 * 지우든 자유. */
export function seedDefaultCodes(): CodebookEntry[] {
  return [
    { id: newId(), label: 'DO',   isOff: true },
    { id: newId(), label: 'N',    isOff: false, startTime: '09:00', endTime: '18:00' },
    { id: newId(), label: '연차', isOff: true },
  ]
}

export function addCode(
  uid: string,
  entry: Omit<CodebookEntry, 'id'>,
): { state: CodebookState; id: string | null; error?: 'limit' | 'duplicate' } {
  const state = getCodebook(uid)
  if (state.codes.length >= MAX_CODES) return { state, id: null, error: 'limit' }
  const label = entry.label.trim()
  if (state.codes.some(c => c.label.toLowerCase() === label.toLowerCase())) {
    return { state, id: null, error: 'duplicate' }
  }
  const id = newId()
  const next: CodebookState = {
    codes: [...state.codes, { ...entry, id, label }],
  }
  saveCodebook(uid, next)
  return { state: next, id }
}

export function updateCode(
  uid: string,
  id: string,
  patch: Partial<Omit<CodebookEntry, 'id'>>,
): { state: CodebookState; error?: 'duplicate' } {
  const state = getCodebook(uid)
  const next = state.codes.map(c => (c.id === id ? { ...c, ...patch, label: (patch.label ?? c.label).trim() } : c))
  if (patch.label !== undefined) {
    const newLabel = patch.label.trim().toLowerCase()
    const dup = next.some(c => c.id !== id && c.label.toLowerCase() === newLabel)
    if (dup) return { state, error: 'duplicate' }
  }
  const out = { codes: next }
  saveCodebook(uid, out)
  return { state: out }
}

export function removeCode(uid: string, id: string): CodebookState {
  const state = getCodebook(uid)
  const next = { codes: state.codes.filter(c => c.id !== id) }
  saveCodebook(uid, next)
  return next
}

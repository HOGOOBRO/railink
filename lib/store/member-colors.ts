/* 동료 색상 사용자 지정 — owner 별로 각 member 의 표시 색상을 override.
 *
 * groups 스토어가 자동 할당하는 c1..c10 위에 사용자가 본인 화면에서만
 * 재배색할 수 있게 한다 ("내 화면에만 표시되니까 자유롭게"). 색은
 * 동료에게 공유되지 않고, owner 의 로컬 디바이스에만 저장된다.
 *
 * Shape: { [ownerUid]: { [memberUid]: CompareColor } }
 */

import type { CompareColor } from '@/lib/types/schedule'

const KEY = 'railink_member_colors_v1'
export const MEMBER_COLORS_KEY = KEY

type Store = Record<string, Record<string, CompareColor>>

function read(): Store {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(store))
}

/** owner 의 전체 override 맵 (memberUid → color). 없으면 빈 객체. */
export function getMemberColors(ownerUid: string): Record<string, CompareColor> {
  return read()[ownerUid] ?? {}
}

/** 특정 member 의 override 색. 없으면 null (= auto 색 사용). */
export function getMemberColor(ownerUid: string, memberUid: string): CompareColor | null {
  return read()[ownerUid]?.[memberUid] ?? null
}

/** override 저장. */
export function setMemberColor(
  ownerUid: string, memberUid: string, color: CompareColor,
): Record<string, CompareColor> {
  const store = read()
  const owner = { ...(store[ownerUid] ?? {}) }
  owner[memberUid] = color
  store[ownerUid] = owner
  write(store)
  return owner
}

/** override 제거 — auto 색(c1..c10)으로 복귀. */
export function clearMemberColor(
  ownerUid: string, memberUid: string,
): Record<string, CompareColor> {
  const store = read()
  const owner = { ...(store[ownerUid] ?? {}) }
  delete owner[memberUid]
  store[ownerUid] = owner
  write(store)
  return owner
}

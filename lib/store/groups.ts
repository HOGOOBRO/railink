/* §19 Compare groups store.
 *
 * Shape (per owner uid, so demo and real accounts stay isolated — same rule as
 * the legacy compare store): { groups: Group[], activeGroupId }. The 10-person
 * cap from the original spec becomes a per-group cap; up to 8 groups per user.
 *
 * groups[0] is the undeletable "기본" group. It is created lazily — only when a
 * user first adds someone to compare (or migrated from a legacy compare list) —
 * so a brand-new user has no groups and no tab zone yet.
 *
 * activeGroupId is persisted here (per owner) rather than a global key, to keep
 * the demo↔real isolation the app already relies on.
 */
import type { CompareColor, CompareEntry, Group, GroupsState } from '@/lib/types/schedule'
import { getCompareList } from '@/lib/store/compare'
import { supabase } from '@/lib/supabase'

const KEY = 'railink_groups_v1'
export const GROUPS_KEY = KEY

/* ── 서버 동기화 ──────────────────────────────────────────────────────────
 * 그룹 구조는 기본적으로 localStorage가 1차 저장소지만, 기기 재설치 시 사라지지
 * 않도록 실계정에 한해 profile_compare_groups 테이블(본인 행만 read/write)에
 * 미러링한다. 데모 계정은 등록하지 않으므로 서버 호출이 없다.
 *
 * remoteUid가 설정돼 있으면(=실계정 로그인) saveGroupsState가 매 쓰기마다
 * 디바운스된 upsert를 예약한다. 부팅 시 1회 hydrateFromRemote로 서버→로컬을
 * 맞춘다. */
const TABLE = 'profile_compare_groups'
// calendar/page.tsx의 MIGRATION_KEY와 동일해야 한다(레거시 compare→groups 안내).
const MIGRATION_NOTICE_KEY = 'rl.migrationNotice.dismissed'
let remoteUid: string | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pendingPush: GroupsState | null = null

/** 실계정 로그인 시 호출 — 이후 그룹 쓰기가 서버로도 반영된다. */
export function enableRemoteGroupSync(uid: string): void {
  remoteUid = uid
}

/** 로그아웃/데모 전환 시 호출 — 대기 중인 push를 버리고 동기화를 끈다. */
export function disableRemoteGroupSync(): void {
  remoteUid = null
  pendingPush = null
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
}

function schedulePush(uid: string, state: GroupsState): void {
  if (remoteUid !== uid) return // demo, 또는 다른 계정 — 서버에 안 쓴다
  pendingPush = state
  if (pushTimer) clearTimeout(pushTimer)
  // 연속 변경(여러 명 추가 등)을 한 번의 upsert로 합친다.
  pushTimer = setTimeout(() => {
    pushTimer = null
    const toSave = pendingPush
    pendingPush = null
    if (!toSave) return
    void supabase.from(TABLE).upsert({ id: uid, state: toSave }, { onConflict: 'id' })
      .then(({ error }) => { if (error) console.warn('[groups] remote save failed', error.message) })
  }, 600)
}

/** 부팅 시 1회: 서버 그룹을 읽어 로컬과 맞춘다.
 *  - 서버에 그룹이 있으면 서버가 진실(다른 기기에서의 변경 반영) → 로컬 덮어씀.
 *  - 서버가 비었고 로컬에 그룹이 있으면(기존 사용자/오프라인 생성) 로컬을 올림.
 *  반환값: 이후 부팅 로직이 쓸 최종 GroupsState. 실패하면 로컬을 그대로 쓴다. */
export async function hydrateGroupsFromRemote(uid: string): Promise<GroupsState> {
  const local = getGroupsState(uid)
  try {
    const { data, error } = await supabase.from(TABLE).select('state').eq('id', uid).maybeSingle()
    if (error) throw error
    const remote = (data?.state ?? null) as GroupsState | null
    const remoteHasGroups = !!remote && Array.isArray(remote.groups) && remote.groups.length > 0
    if (remoteHasGroups) {
      writeLocalOnly(uid, remote!)
      // 서버에 그룹이 있다 = 이미 그룹 체계로 넘어온 계정. 재설치로 비워진
      // 레거시(compare→groups) 안내 플래그를 미리 채워, 복원된 그룹을 보고
      // 옛 마이그레이션 시트가 다시 뜨는 일을 막는다.
      if (typeof window !== 'undefined' && !localStorage.getItem(MIGRATION_NOTICE_KEY)) {
        localStorage.setItem(MIGRATION_NOTICE_KEY, 'restored-from-remote')
      }
      return remote!
    }
    // 서버가 비었음 — 로컬에 쓸 게 있으면 시드.
    if (local.groups.length) schedulePush(uid, local)
    return local
  } catch {
    return local // 오프라인/미적용 — 로컬 우선, 다음 쓰기에서 다시 시도
  }
}

/** 로컬에만 쓴다(서버 push 없음) — hydrate가 서버 값을 도로 올리는 것 방지. */
function writeLocalOnly(ownerUid: string, state: GroupsState): void {
  const store = read()
  store[ownerUid] = state
  write(store)
}

export const MAX_GROUPS = 8
export const MAX_PER_GROUP = 10
export const DEFAULT_GROUP_NAME = '기본'
export const MAX_GROUP_NAME = 12

const COLORS: CompareColor[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']

type Store = Record<string, GroupsState>

function read(): Store {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(store))
}

function newId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Resolve the active group, falling back to the first group if the saved id is
 *  missing (e.g. the active group was deleted). */
export function activeGroupOf(state: GroupsState): Group | null {
  if (!state.groups.length) return null
  return state.groups.find(g => g.id === state.activeGroupId) ?? state.groups[0]
}

/** groups[0] is the 기본 group and cannot be deleted. */
export function isDefaultGroup(state: GroupsState, groupId: string): boolean {
  return state.groups[0]?.id === groupId
}

/** Read state for an owner, migrating a legacy `railink_compare_v4` list into a
 *  default 기본 group the first time. */
export function getGroupsState(ownerUid: string): GroupsState {
  const store = read()
  const existing = store[ownerUid]
  if (existing) return existing

  const legacy = getCompareList(ownerUid)
  const state: GroupsState = legacy.length
    ? { groups: [{ id: newId(), name: DEFAULT_GROUP_NAME, members: legacy }], activeGroupId: null }
    : { groups: [], activeGroupId: null }
  if (state.groups.length) state.activeGroupId = state.groups[0].id

  store[ownerUid] = state
  write(store)
  return state
}

export function saveGroupsState(ownerUid: string, state: GroupsState): void {
  const store = read()
  store[ownerUid] = state
  write(store)
  schedulePush(ownerUid, state) // 실계정이면 서버로도(데모/다른계정이면 no-op)
}

function nextColor(members: CompareEntry[]): CompareColor {
  const used = new Set(members.map(m => m.color))
  return COLORS.find(c => !used.has(c)) ?? 'c1'
}

export interface AddResult {
  state: GroupsState
  group: Group
  entry: CompareEntry | null   // null when at the per-group cap
  alreadyIn: boolean
}

/** Add a colleague to the active group, lazily creating the 기본 group if the
 *  user has none yet. Returns the new state and the resolved active group. */
export function addToActiveGroup(
  ownerUid: string,
  meta: { uid: string; name: string; employeeId: string; photo?: string; office?: string },
): AddResult {
  const state = getGroupsState(ownerUid)
  let group = activeGroupOf(state)
  if (!group) {
    group = { id: newId(), name: DEFAULT_GROUP_NAME, members: [] }
    state.groups.push(group)
    state.activeGroupId = group.id
  } else {
    state.activeGroupId = group.id
  }

  const existing = group.members.find(m => m.uid === meta.uid)
  if (existing) {
    saveGroupsState(ownerUid, state)
    return { state, group, entry: existing, alreadyIn: true }
  }
  if (group.members.length >= MAX_PER_GROUP) {
    saveGroupsState(ownerUid, state)
    return { state, group, entry: null, alreadyIn: false }
  }
  const entry: CompareEntry = {
    uid: meta.uid, name: meta.name, employeeId: meta.employeeId,
    color: nextColor(group.members), photo: meta.photo, office: meta.office,
  }
  group.members.push(entry)
  saveGroupsState(ownerUid, state)
  return { state, group, entry, alreadyIn: false }
}

/** Remove a colleague from the active group. */
export function removeFromActiveGroup(ownerUid: string, memberUid: string): GroupsState {
  const state = getGroupsState(ownerUid)
  const group = activeGroupOf(state)
  if (group) group.members = group.members.filter(m => m.uid !== memberUid)
  saveGroupsState(ownerUid, state)
  return state
}

export function setActiveGroup(ownerUid: string, groupId: string): GroupsState {
  const state = getGroupsState(ownerUid)
  if (state.groups.some(g => g.id === groupId)) state.activeGroupId = groupId
  saveGroupsState(ownerUid, state)
  return state
}

/** Append a new empty group. Caller should put it in edit mode. Returns the new
 *  group's id, or null if already at MAX_GROUPS. */
export function createGroup(ownerUid: string, name = '새 그룹'): { state: GroupsState; id: string } | null {
  const state = getGroupsState(ownerUid)
  if (state.groups.length >= MAX_GROUPS) return null
  const group: Group = { id: newId(), name, members: [] }
  state.groups.push(group)
  saveGroupsState(ownerUid, state)
  return { state, id: group.id }
}

export type RenameError = 'empty' | 'duplicate'

export function renameGroup(
  ownerUid: string, groupId: string, rawName: string,
): { state: GroupsState; error?: RenameError } {
  const state = getGroupsState(ownerUid)
  const name = rawName.trim().slice(0, MAX_GROUP_NAME)
  if (!name) return { state, error: 'empty' }
  const dup = state.groups.some(g => g.id !== groupId && g.name === name)
  if (dup) return { state, error: 'duplicate' }
  const group = state.groups.find(g => g.id === groupId)
  if (group) group.name = name
  saveGroupsState(ownerUid, state)
  return { state }
}

/** Delete a group. The 기본 group (index 0) cannot be deleted. If the deleted
 *  group was active, the first remaining group becomes active. */
export function deleteGroup(ownerUid: string, groupId: string): GroupsState {
  const state = getGroupsState(ownerUid)
  if (isDefaultGroup(state, groupId)) return state
  const wasActive = activeGroupOf(state)?.id === groupId
  state.groups = state.groups.filter(g => g.id !== groupId)
  if (wasActive) state.activeGroupId = state.groups[0]?.id ?? null
  saveGroupsState(ownerUid, state)
  return state
}

/** Reorder groups by an explicit id-sequence (used by the drag-to-reorder UI).
 *  Unknown ids are dropped; missing ids are appended in their current order so
 *  partial reorders don't silently lose groups. */
export function reorderGroups(ownerUid: string, orderedIds: string[]): GroupsState {
  const state = getGroupsState(ownerUid)
  const byId = new Map(state.groups.map(g => [g.id, g]))
  const next: Group[] = []
  for (const id of orderedIds) {
    const g = byId.get(id)
    if (g) { next.push(g); byId.delete(id) }
  }
  for (const g of byId.values()) next.push(g)
  state.groups = next
  saveGroupsState(ownerUid, state)
  return state
}

/** All distinct member uids across every group — used to load schedules once. */
export function allMemberUids(state: GroupsState): string[] {
  return [...new Set(state.groups.flatMap(g => g.members.map(m => m.uid)))]
}

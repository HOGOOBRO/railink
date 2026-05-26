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

const KEY = 'railink_groups_v1'
export const GROUPS_KEY = KEY

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

/** All distinct member uids across every group — used to load schedules once. */
export function allMemberUids(state: GroupsState): string[] {
  return [...new Set(state.groups.flatMap(g => g.members.map(m => m.uid)))]
}

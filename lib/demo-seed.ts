import { getSchedules, saveSchedules } from './store/schedules'
import { GROUPS_KEY } from './store/groups'
import { DEMO_ME, DEMO_COLLEAGUES, buildDemoSchedules } from './demo-data'
import type { CompareColor, CompareEntry, GroupsState } from './types/schedule'

const DEMO_UIDS = new Set([DEMO_ME.uid, ...DEMO_COLLEAGUES.map(c => c.uid)])

/** Bump when the demo's seeded *derived* state (compare group members, colors)
 * changes shape — e.g. the colleague rename to the cat names. A version mismatch
 * wipes the demo's groups/compare/colors so a browser carrying a snapshot from an
 * older build (Instagram in-app browser, etc.) re-seeds to the current set. */
const SEED_VERSION = '2'
const SEED_VERSION_KEY = 'railink_demo_seed_version'
// Mirror the private keys of the compare / member-color stores so we can drop the
// demo owner's stale entries on a version bump.
const COMPARE_KEY = 'railink_compare_v4'
const MEMBER_COLORS_KEY = 'railink_member_colors_v1'

/** Colleagues the demo pre-compares so the calendar opens with a populated,
 * merged view (instead of an empty "추가하세요" state). */
const DEMO_COMPARE_UIDS = ['u1', 'u2', 'u4', 'u6']
const DEMO_COMPARE_COLORS: CompareColor[] = ['c1', 'c2', 'c3', 'c4']

/** Delete a single owner's entry from a `Record<uid, …>` localStorage store. */
function dropOwner(key: string, uid: string): void {
  try {
    const store = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (store && typeof store === 'object' && uid in store) {
      delete store[uid]
      localStorage.setItem(key, JSON.stringify(store))
    }
  } catch { /* malformed — leave as-is */ }
}

function currentMonthPrefix(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function reseedSchedules(): void {
  // Drop demo-owned rows, regenerate around today. Real-account rows untouched.
  const kept = getSchedules().filter(e => !DEMO_UIDS.has(e.uid))
  saveSchedules([...kept, ...buildDemoSchedules()])
}

/** Seed the demo account's localStorage (schedules + compare group) around today.
 * Real accounts go through Supabase Auth; their schedules stay localStorage until
 * Phase 6b. */
export function seedDemo(): void {
  if (typeof window === 'undefined') return

  const stale = localStorage.getItem(SEED_VERSION_KEY) !== SEED_VERSION
  if (stale) {
    // Older build left snapshotted groups/compare/colors (e.g. the pre-rename
    // colleague names) — wipe the demo's derived state so it re-seeds fresh.
    dropOwner(GROUPS_KEY, DEMO_ME.uid)
    dropOwner(COMPARE_KEY, DEMO_ME.uid)
    dropOwner(MEMBER_COLORS_KEY, DEMO_ME.uid)
    reseedSchedules()
  } else if (!getSchedules().some(e => e.uid === DEMO_ME.uid && e.date.startsWith(currentMonthPrefix()))) {
    // Same version but the visible (current) month is empty — refresh schedules.
    reseedSchedules()
  }

  seedDemoGroups()
  localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION)
}

/** Pre-populate the demo's 기본 compare group so the timeline/merge feature is
 * visible on first open. Idempotent — leaves an existing group untouched so the
 * user's own add/remove during the session sticks. */
function seedDemoGroups(): void {
  let store: Record<string, GroupsState> = {}
  try { store = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}') } catch { /* reset */ }
  if (store[DEMO_ME.uid]?.groups?.length) return

  const members: CompareEntry[] = DEMO_COMPARE_UIDS.map((uid, i) => {
    const c = DEMO_COLLEAGUES.find(x => x.uid === uid)!
    return {
      uid, name: c.name, employeeId: c.employeeId,
      color: DEMO_COMPARE_COLORS[i], photo: c.photo, office: c.office,
    }
  })
  const gid = 'demo-group-1'
  store[DEMO_ME.uid] = { groups: [{ id: gid, name: '기본', members }], activeGroupId: gid }
  localStorage.setItem(GROUPS_KEY, JSON.stringify(store))
}

import { getSchedules, saveSchedules } from './store/schedules'
import { GROUPS_KEY } from './store/groups'
import { DEMO_ME, DEMO_COLLEAGUES, buildDemoSchedules } from './demo-data'
import type { CompareColor, CompareEntry, GroupsState } from './types/schedule'

const DEMO_UIDS = new Set([DEMO_ME.uid, ...DEMO_COLLEAGUES.map(c => c.uid)])

/** Colleagues the demo pre-compares so the calendar opens with a populated,
 * merged view (instead of an empty "추가하세요" state). */
const DEMO_COMPARE_UIDS = ['u1', 'u2', 'u4', 'u6']
const DEMO_COMPARE_COLORS: CompareColor[] = ['c1', 'c2', 'c3', 'c4']

/** Seed the demo account's localStorage schedules (me + 12 colleagues) around
 * today. Real accounts go through Supabase Auth; their schedules stay localStorage
 * until Phase 6b.
 *
 * Re-seeds whenever the demo "me" has no entry in the CURRENT month — that covers
 * both a fresh browser and a browser carrying stale demo data from a month the
 * old fixed-month seed pinned to (which left today's calendar empty). */
export function seedDemo(): void {
  if (typeof window === 'undefined') return
  const schedules = getSchedules()
  const now = new Date()
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const hasCurrentMonth = schedules.some(e => e.uid === DEMO_ME.uid && e.date.startsWith(cm))
  if (!hasCurrentMonth) {
    // Drop any stale demo-owned rows, then regenerate around today. Non-demo rows
    // (a real account's localStorage) are left untouched.
    const kept = schedules.filter(e => !DEMO_UIDS.has(e.uid))
    saveSchedules([...kept, ...buildDemoSchedules()])
  }
  seedDemoGroups()
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

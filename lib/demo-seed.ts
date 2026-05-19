import { getSchedules, saveSchedules } from './store/schedules'
import { DEMO_ME, buildDemoSchedules } from './demo-data'

/** Seed the demo account's localStorage schedules (me + 12 colleagues) once.
 * Real accounts go through Supabase Auth; their schedules stay localStorage
 * until Phase 6b. */
export function seedDemo(): void {
  if (typeof window === 'undefined') return
  const schedules = getSchedules()
  if (!schedules.some(e => e.uid === DEMO_ME.uid)) {
    saveSchedules([...schedules, ...buildDemoSchedules()])
  }
}

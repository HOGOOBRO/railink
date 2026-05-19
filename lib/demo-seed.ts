import { getUsers, saveUsers } from './auth'
import { getSchedules, saveSchedules } from './store/schedules'
import { DEMO_ME, buildDemoSchedules } from './demo-data'

export function seedDemo(): void {
  if (typeof window === 'undefined') return

  const users = getUsers()
  if (!users.some(u => u.email === DEMO_ME.email)) {
    saveUsers([
      ...users,
      {
        uid: DEMO_ME.uid,
        email: DEMO_ME.email,
        name: DEMO_ME.name,
        employeeId: DEMO_ME.employeeId,
        part: DEMO_ME.part,
        photo: DEMO_ME.photo,
        pw: DEMO_ME.pw,
      },
    ])
  }

  // Seed demo schedules (me + 12 colleagues) once.
  const schedules = getSchedules()
  if (!schedules.some(e => e.uid === DEMO_ME.uid)) {
    saveSchedules([...schedules, ...buildDemoSchedules()])
  }
}

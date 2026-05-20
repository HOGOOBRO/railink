import { supabase } from '@/lib/supabase'
import {
  DEMO_COLLEAGUES,
  DEMO_ME,
  buildDemoSchedules,
  type Colleague,
} from '@/lib/demo-data'
import type { Session } from '@/lib/auth'
import { getSchedules, saveSchedules } from '@/lib/store/schedules'

export const COLLEAGUE_DIRECTORY_KEY = 'railink_colleague_directory_v1'
export const SAMPLE_DIRECTORY_SEEDED_KEY = 'railink_sample_directory_seeded_v1'

type StoredColleague = Colleague

interface RemoteProfile {
  id: unknown
  name: unknown
  employee_id: unknown
  part: unknown
  photo: unknown
}

function readLocalDirectory(): StoredColleague[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLEAGUE_DIRECTORY_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isStoredColleague) : []
  } catch {
    return []
  }
}

function writeLocalDirectory(entries: StoredColleague[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(COLLEAGUE_DIRECTORY_KEY, JSON.stringify(entries))
  } catch {
    // Local directory is a convenience cache; ignore quota/private-mode failures.
  }
}

function isStoredColleague(value: unknown): value is StoredColleague {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.uid === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.employeeId === 'string' &&
    typeof entry.office === 'string' &&
    typeof entry.email === 'string'
  )
}

function officeFromPart(part?: string): string {
  const trimmed = part?.trim()
  return trimmed ? `${trimmed}파트` : 'RaiLink'
}

function toStoredColleague(session: Session): StoredColleague {
  return {
    uid: session.uid,
    name: session.name || '이름 없음',
    employeeId: session.employeeId || '',
    office: officeFromPart(session.part),
    email: session.email,
    photo: session.photo,
  }
}

export function rememberSessionProfile(session: Session): void {
  if (session.isDemo) return
  const entry = toStoredColleague(session)
  const existing = readLocalDirectory()
  const next = [entry, ...existing.filter(u => u.uid !== entry.uid)]
  writeLocalDirectory(next)
}

function mapProfile(profile: RemoteProfile): Colleague | null {
  if (typeof profile.id !== 'string') return null
  const name = typeof profile.name === 'string' ? profile.name.trim() : ''
  if (!name) return null

  const employeeId = typeof profile.employee_id === 'string' ? profile.employee_id.trim() : ''
  const part = typeof profile.part === 'string' ? profile.part.trim() : ''
  const photo = typeof profile.photo === 'string' && profile.photo.trim() ? profile.photo.trim() : undefined

  return {
    uid: profile.id,
    name,
    employeeId,
    office: officeFromPart(part),
    email: '',
    photo,
  }
}

async function getRemoteDirectory(currentUid: string): Promise<Colleague[] | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,employee_id,part,photo')
      .neq('id', currentUid)
      .order('name', { ascending: true })
      .limit(200)

    if (error) return null
    if (!Array.isArray(data)) return []

    return data
      .map(profile => mapProfile(profile as RemoteProfile))
      .filter((profile): profile is Colleague => Boolean(profile))
  } catch {
    return null
  }
}

function sortByName(entries: Colleague[]): Colleague[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

function uniqueColleagues(entries: Colleague[]): Colleague[] {
  const seen = new Set<string>()
  const unique: Colleague[] = []
  for (const entry of entries) {
    const key = entry.uid || `employee:${entry.employeeId}` || `name:${entry.name}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
  }
  return sortByName(unique)
}

function ensureSampleColleagueSchedules(): void {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(SAMPLE_DIRECTORY_SEEDED_KEY)) return

  const schedules = getSchedules()
  const sampleUids = new Set(DEMO_COLLEAGUES.map(c => c.uid))
  const existingUids = new Set(schedules.filter(e => sampleUids.has(e.uid)).map(e => e.uid))
  const sampleEntries = buildDemoSchedules().filter(e => sampleUids.has(e.uid) && !existingUids.has(e.uid))

  if (sampleEntries.length) saveSchedules([...schedules, ...sampleEntries])
  try {
    localStorage.setItem(SAMPLE_DIRECTORY_SEEDED_KEY, '1')
  } catch {
    // Non-critical marker; schedules were already seeded if storage allowed it.
  }
}

export async function getColleagueDirectory(session: Session): Promise<Colleague[]> {
  if (session.isDemo) return sortByName(DEMO_COLLEAGUES)

  rememberSessionProfile(session)

  const remote = await getRemoteDirectory(session.uid)
  if (remote && remote.length) return uniqueColleagues(remote)

  const local = readLocalDirectory().filter(u => u.uid !== session.uid)
  if (local.length) return uniqueColleagues(local)

  ensureSampleColleagueSchedules()
  return sortByName(DEMO_COLLEAGUES.filter(u => u.uid !== DEMO_ME.uid))
}

export function findColleagueInDirectory(uid: string, directory: Colleague[]): Colleague | undefined {
  return directory.find(u => u.uid === uid) ?? DEMO_COLLEAGUES.find(u => u.uid === uid)
}

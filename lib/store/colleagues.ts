import { supabase } from '@/lib/supabase'
import { DEMO_COLLEAGUES, DEMO_ME, type Colleague } from '@/lib/demo-data'
import type { Session } from '@/lib/auth'

export const COLLEAGUE_DIRECTORY_KEY = 'railink_colleague_directory_v1'
export const SAMPLE_DIRECTORY_SEEDED_KEY = 'railink_sample_directory_seeded_v1'
const DEMO_UIDS = new Set([DEMO_ME.uid, ...DEMO_COLLEAGUES.map(u => u.uid)])

interface RemoteProfile {
  id: unknown
  name: unknown
  employee_id: unknown
  part: unknown
  photo: unknown
}

function officeFromPart(part?: string): string {
  const trimmed = part?.trim()
  return trimmed ? `${trimmed}파트` : 'RaiLink'
}

async function syncSessionProfile(session: Session): Promise<void> {
  if (session.isDemo) return
  try {
    await supabase.from('profiles').upsert({
      id: session.uid,
      name: session.name || '',
      employee_id: session.employeeId || '',
      part: session.part ?? null,
      photo: session.photo ?? null,
    }, { onConflict: 'id' })
  } catch {
    // The directory depends on the profiles table. If it has not been created
    // yet, search simply returns no real colleagues instead of demo data.
  }
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
      // Admin (operations) accounts are hidden from the directory. RLS already
      // blocks them; this explicit filter makes the intent visible and is a
      // safety net if the policy is ever relaxed.
      .eq('is_admin', false)
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

export async function getColleagueDirectory(session: Session): Promise<Colleague[]> {
  if (session.isDemo) return sortByName(DEMO_COLLEAGUES)

  await syncSessionProfile(session)
  const remote = await getRemoteDirectory(session.uid)
  return uniqueColleagues(remote ?? [])
}

export function findColleagueInDirectory(uid: string, directory: Colleague[]): Colleague | undefined {
  return directory.find(u => u.uid === uid)
}

export function isDemoColleagueUid(uid: string): boolean {
  return DEMO_UIDS.has(uid)
}

import { supabase } from '@/lib/supabase'
import { DEMO_COLLEAGUES, DEMO_ME, type Colleague } from '@/lib/demo-data'
import type { Session } from '@/lib/auth'
import type { Visibility, ProfileType } from '@/lib/types/schedule'

/** A colleague resolved by exact 사번 lookup — carries visibility so the search
 *  card can flag a 비공개 계정. Directory entries are always public (RLS hides
 *  private profiles), so they don't need this. */
export type ProfileLookup = Colleague & { visibility: Visibility }

export const COLLEAGUE_DIRECTORY_KEY = 'railink_colleague_directory_v1'
export const SAMPLE_DIRECTORY_SEEDED_KEY = 'railink_sample_directory_seeded_v1'
const DEMO_UIDS = new Set([DEMO_ME.uid, ...DEMO_COLLEAGUES.map(u => u.uid)])

interface RemoteProfile {
  id: unknown
  name: unknown
  employee_id: unknown
  part: unknown
  photo: unknown
  profile_type: unknown
}

function toProfileType(v: unknown): ProfileType {
  return v === 'personal' ? 'personal' : 'ktx_attendant'
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
    profileType: toProfileType(profile.profile_type),
  }
}

async function getRemoteDirectory(currentUid: string): Promise<Colleague[] | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,employee_id,part,photo,profile_type')
      .neq('id', currentUid)
      // Admin (operations) accounts are hidden from the directory. RLS already
      // blocks them; this explicit filter makes the intent visible and is a
      // safety net if the policy is ever relaxed.
      .eq('is_admin', false)
      .order('name', { ascending: true })
      .limit(200)

    if (error) {
      // Surface the supabase error — without this it was being swallowed and
      // an empty directory looked identical to a real RLS/permission failure.
      console.error('[colleagues] directory query failed', error)
      return null
    }
    if (!Array.isArray(data)) return []

    if (data.length === 0) {
      // RLS-filtered to zero rows. This is the canonical case behind "검색이
      // 안 돼" reports: other accounts exist but their visibility is 'private'
      // (e.g. legacy share_schedule=false rows auto-migrated to private), or
      // no other accounts have been created yet.
      console.warn('[colleagues] directory returned 0 rows — RLS hid every other profile (likely visibility=private)')
    }

    return data
      .map(profile => mapProfile(profile as RemoteProfile))
      .filter((profile): profile is Colleague => Boolean(profile))
  } catch (e) {
    console.error('[colleagues] directory query threw', e)
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

/** Exact-사번 lookup via the find_profile_by_employee_id RPC. Finds even private
 *  accounts (which the directory hides) so the requester can send a share
 *  request. Returns null when nothing matches. */
export async function findProfileByEmployeeId(employeeId: string): Promise<ProfileLookup | null> {
  const { data, error } = await supabase.rpc('find_profile_by_employee_id', {
    target_employee_id: employeeId,
  })
  if (error) {
    console.error('[colleagues] sabun RPC failed', error)
    return null
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('[colleagues] sabun RPC returned 0 rows for', employeeId)
    return null
  }
  const r = data[0] as {
    id: string; name: string; employee_id: string
    part: string | null; photo: string | null; visibility: Visibility
  }
  return {
    uid: r.id,
    name: r.name,
    employeeId: r.employee_id,
    office: officeFromPart(r.part ?? undefined),
    email: '',
    photo: r.photo ?? undefined,
    visibility: r.visibility,
    // 사번 lookup only matches accounts that have a 사번 → always KTX.
    profileType: 'ktx_attendant',
  }
}

/** Exact-email lookup via find_profile_by_email (real accounts only). Finds even
 *  private accounts (directory hides them) so the requester can connect. Carries
 *  profileType for the search badge. Returns null when nothing matches. */
export async function findProfileByEmail(email: string): Promise<ProfileLookup | null> {
  const { data, error } = await supabase.rpc('find_profile_by_email', {
    target_email: email,
  })
  if (error) {
    console.error('[colleagues] email RPC failed', error)
    return null
  }
  if (!Array.isArray(data) || data.length === 0) return null
  const r = data[0] as {
    id: string; name: string; employee_id: string
    part: string | null; photo: string | null; visibility: Visibility; profile_type: string
  }
  return {
    uid: r.id,
    name: r.name,
    employeeId: r.employee_id,
    office: officeFromPart(r.part ?? undefined),
    email: '',
    photo: r.photo ?? undefined,
    visibility: r.visibility,
    profileType: toProfileType(r.profile_type),
  }
}

export function isDemoColleagueUid(uid: string): boolean {
  return DEMO_UIDS.has(uid)
}

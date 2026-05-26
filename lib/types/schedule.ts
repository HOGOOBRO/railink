export interface ScheduleEntry {
  uid: string
  date: string       // "YYYY-MM-DD"
  diaNr?: string
  trainNr?: string   // "대표열번1 · 대표열번2"
  startTime?: string // "HH:MM"
  endTime?: string   // "HH:MM" (24:00+ allowed for 익일 종료)
  isOff: boolean
}

export type CompareColor =
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'c6' | 'c7' | 'c8' | 'c9' | 'c10'

export interface CompareEntry {
  uid: string
  name: string
  employeeId: string
  color: CompareColor
  photo?: string
  office?: string
}

// §19 Compare groups. A group is a saved view (filter) over colleagues; the
// same person may appear in several groups. We keep full CompareEntry members
// (not bare ids) so the strip renders before the colleague directory loads and
// while offline — matching how the legacy compare store already persisted.
export interface Group {
  id: string
  name: string            // user-set, 1–12 chars, trimmed
  members: CompareEntry[] // max 10, color assigned per-group on add
}

export interface GroupsState {
  groups: Group[]            // max 8; groups[0] is the undeletable 기본 group
  activeGroupId: string | null
}

/** 하루치 비행 레그(구간) 하나. 노선이 캡쳐에 명시된 항공사(아시아나 등)에서, 편명→
 *  노선 룩업표 대신 캡쳐의 SECTOR/STD/STA를 그대로 저장한다. std/sta는 각 공항 현지
 *  시각("HH:MM") — 날짜 넘김(익일 도착)은 placeShift가 instant 비교로 자동 처리하므로
 *  여기엔 시·분만 둔다. */
export interface Flight {
  flight?: string   // 편명 예: "OZ349" 또는 "349"
  from?: string     // 출발 공항 IATA 예: "ICN"
  to?: string       // 도착 공항 IATA 예: "NKG"
  std?: string      // 출발 현지시각 "HH:MM"
  sta?: string      // 도착 현지시각 "HH:MM"
  /** 쇼업(공항 출근) 시각 "HH:MM" — 보통 트립 첫 레그에만. 실제 근무 시작이라 블록
   *  시작에 쓴다. terminal은 출근 터미널/장소(T2=인천제2, G=김포 등). */
  showup?: string
  terminal?: string
}

export interface ScheduleEntry {
  uid: string
  date: string       // "YYYY-MM-DD"
  diaNr?: string
  trainNr?: string   // "대표열번1 · 대표열번2"
  startTime?: string // "HH:MM"
  endTime?: string   // "HH:MM" (24:00+ allowed for 익일 종료)
  isOff: boolean
  /** 하루 여러 구간(다중 레그). 노선 명시 항공사에서만 채워진다. 첫 레그 출발/마지막
   *  레그 도착이 그날 근무의 출도착이 되고, 노선 문자열·레그별 상세에 쓰인다. */
  flights?: Flight[]
}

export type CompareColor =
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'c6' | 'c7' | 'c8' | 'c9' | 'c10'

// Profile visibility (search/directory listing only — NOT schedule access,
// which always goes through schedule_shares consent). See RaiLink_Sharing_Spec.
export type Visibility = 'public' | 'private'

// Account identity type. Both are 100% equal in rights/features — this only
// records whether the user has KTX identity data (사번·파트) or not. personal
// users sign up freely or via an invite link. Never surface as a hierarchy
// ("외부/게스트") in copy.
export type ProfileType = 'ktx_attendant' | 'personal'

// schedule_shares consent status.
export type ShareStatus = 'pending' | 'accepted' | 'revoked'

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

// 약속 잡기 (Appointment). A pinned event on the shared shift calendar — either a
// group appointment (find a common free day + invite colleagues) or a solo
// personal event (shown to colleagues as "일정 있음" by default). Distinguished
// visually by the brand pin marker, not a separate hue.
export interface Appointment {
  id: string
  type: 'group' | 'solo'
  date: string            // 'YYYY-MM-DD'
  title: string
  start?: string          // 'HH:MM' (24h) — undefined = 시간 미정
  end?: string            // 'HH:MM'
  place?: string
  memo?: string
  ownerUid: string        // creator; the × delete shows only in their column
  participants: string[]  // uids incl. owner; solo = [owner]
  // solo only: 'busy' = colleagues see "일정 있음"; 'title' = title shown.
  // group is always shared to participants.
  visibility?: 'busy' | 'title'
  // ── populated by the remote read only (Supabase) ──
  participantStatuses?: Record<string, AppointmentStatus>  // uid → consent state
  myStatus?: AppointmentStatus                              // my own consent state
  busyMasked?: boolean   // solo 'busy' seen by a colleague — title was hidden
}

// appointment_participants consent. Distinct from ShareStatus ('revoked'): an
// invitee can 'decline' an appointment.
export type AppointmentStatus = 'pending' | 'accepted' | 'declined'

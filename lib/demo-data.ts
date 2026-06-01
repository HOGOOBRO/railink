/**
 * Demo data — 1:1 port of the design prototype's `makeSchedules()`
 * (railink/project/prototype.jsx) + the colleague directory
 * (railink/project/screens-c.jsx). Deterministic so the calendar,
 * compare strip, search and timeline all show meaningful content.
 */
import type { ScheduleEntry, ProfileType } from '@/lib/types/schedule'

export interface Colleague {
  uid: string
  name: string
  employeeId: string
  office: string
  email: string
  photo?: string
  /** Identity type for the search badge. Absent → treat as 'ktx_attendant'
   *  (legacy/demo KTX colleagues). personal users have no 사번/office. */
  profileType?: ProfileType
}

/** Seeded "me" — the demo account (Theo). Uses an @railink.app address:
 * RaiLink is an independent app, so demo data must not imply a @korail.com
 * (official Korail) identity. */
export const DEMO_ME = {
  uid: 'demo-me-001',
  email: 'theo@railink.app',
  pw: 'demo1234',
  name: 'Theo',
  employeeId: '110512',
  part: 'B',
  photo: '/avatars/avatar-5.svg',
} as const

/** Memorable demo credentials shown on the login card / prefilled.
 * Same identity as DEMO_ME so the card, sign-in and menu all read "Theo". */
export const DEMO_LOGIN = {
  email: 'demo.theo@railink.app',
  pw: 'demo1234',
} as const

/** Demo colleagues (search directory). Half intentionally have no photo. */
export const DEMO_COLLEAGUES: Colleague[] = [
  { uid: 'u1',  name: '고양이가', employeeId: '102204', office: '서울 · B',  email: 'demo.minjun@railink.app', photo: '/avatars/cat-1.jpg' },
  { uid: 'u2',  name: '세상을', employeeId: '108839', office: '서울 · A',  email: 'demo.jiho@railink.app',   photo: '/avatars/cat-2.jpg' },
  { uid: 'u3',  name: '최예진', employeeId: '113207', office: '광명 · B',  email: 'demo.yejin@railink.app' },
  { uid: 'u4',  name: '구한다', employeeId: '105621', office: '서울 · C',  email: 'demo.doyoon@railink.app', photo: '/avatars/cat-3.jpg' },
  { uid: 'u5',  name: '한가람', employeeId: '120044', office: '부산 · B',  email: 'demo.garam@railink.app' },
  { uid: 'u6',  name: '얍', employeeId: '117788', office: '대전 · A',  email: 'demo.subin@railink.app',  photo: '/avatars/cat-4.jpg' },
  { uid: 'u7',  name: '윤하늘', employeeId: '123456', office: '동대구 · B', email: 'demo.haneul@railink.app' },
  { uid: 'u8',  name: '강예나', employeeId: '129002', office: '서울 · B',  email: 'demo.yena@railink.app',   photo: '/avatars/avatar-8.svg' },
  { uid: 'u9',  name: '문지원', employeeId: '104871', office: '광명 · A',  email: 'demo.jiwon@railink.app' },
  { uid: 'u10', name: '서가온', employeeId: '118330', office: '부산 · C',  email: 'demo.gaon@railink.app',   photo: '/avatars/avatar-11.svg' },
  { uid: 'u11', name: '장태리', employeeId: '127015', office: '대전 · B',  email: 'demo.taeri@railink.app' },
  { uid: 'u12', name: '임도하', employeeId: '116602', office: '서울 · A',  email: 'demo.doha@railink.app',   photo: '/avatars/avatar-12.svg' },
  // One personal contact so the badge + email-only-discovery model is visible in
  // demo. No 사번/office; reachable by email/name, no "KTX 승무원" chip.
  { uid: 'u13', name: '이수진', employeeId: '', office: '', email: 'demo.sujin@railink.app', profileType: 'personal' },
]

const DIAS = ['H1055', 'H1G37', 'H1130', 'H1091', 'H1048', 'H1007', 'H1082', 'H1071', 'H1095']
// [대표열번1, 대표열번2, 출근(decimal h), 퇴근(decimal h, >24 = 익일)]
const TR: [string, string, number, number][] = [
  ['16', '216', 10.97, 20.17],
  ['869', '864', 12.20, 20.15],
  ['287', '224', 13.63, 25.13],
  ['73', '104', 21.63, 35.82],   // 21:38 → 11:49 익일
  ['1011', '1114', 9.97, 21.50],
  ['251', '232', 19.80, 32.52],  // 19:48 → 08:31 익일
  ['4135', '9292', 6.37, 15.73],
  ['209', '4022', 9.28, 19.80],
]

/** Decimal hour → "HH:MM" (hour may exceed 24 to encode 익일 종료). */
function hm(h: number): string {
  let hour = Math.floor(h)
  let min = Math.round((h - hour) * 60)
  if (min === 60) { hour += 1; min = 0 }
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function daysOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Months the demo seeds, anchored on today: previous, current, next — so the
 * calendar always opens onto a populated month and prev/next navigation has data.
 * (Demo data used to be pinned to a fixed past month, leaving "today" empty.) */
function demoMonths(): { year: number; month: number }[] {
  const now = new Date()
  return [-1, 0, 1].map(off => {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
}

const TODAY_DIA = {
  diaNr: 'H1055', trainNr: '16 · 216', startTime: hm(10.97), endTime: hm(20.17),
} as const

/** Deterministic per-user month schedule (ported from prototype), anchored to the
 * given year/month so demo data tracks "today" instead of a fixed past month. */
function generateForUser(
  uid: string, userSeed: number, intensity: number, year: number, month: number,
): ScheduleEntry[] {
  let s = userSeed + (year * 12 + month) * 131   // vary per month, stay deterministic
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }

  const out: ScheduleEntry[] = []
  const lastDay = daysOfMonth(year, month)
  let i = 1
  while (i <= lastDay) {
    const r = rand()
    if (r < 0.22 * (1 / intensity)) {
      const type = rand() < 0.4 ? 'S(주휴)' : 'S'
      out.push({ uid, date: iso(year, month, i), diaNr: type, isOff: true })
      i++
      continue
    }
    const t = TR[Math.floor(rand() * TR.length)]
    const dia = DIAS[Math.floor(rand() * DIAS.length)]
    out.push({
      uid, date: iso(year, month, i), diaNr: dia, trainNr: `${t[0]} · ${t[1]}`,
      startTime: hm(t[2]), endTime: hm(t[3]), isOff: false,
    })
    // Overnight (박차) = end hour past 24. The card bleeds into the next morning,
    // so reserve the next day as a continuation (~) and skip it — otherwise a fresh
    // shift on that day would visually overlap the bleed-over (한 사람 두 카드 겹침).
    if (t[3] > 24) {
      if (i + 1 <= lastDay) {
        out.push({
          uid, date: iso(year, month, i + 1), diaNr: `~(${dia})`, trainNr: `${t[0]} · ${t[1]}`,
          startTime: hm(t[2]), endTime: hm(t[3]), isOff: false,
        })
      }
      i += 2
    } else {
      i++
    }
  }
  return out
}

/** "HH:MM" → hour number (hour may exceed 24 for 익일 종료). */
function endHour(t?: string): number {
  return t ? parseInt(t.slice(0, t.indexOf(':')), 10) : 0
}

/** Force a uid's `todayIso()` entry to the canonical (non-overnight) "today" shift
 * so the opening month always shows a shift. If the previous day is an overnight
 * shift, trim its bleed-over so it can't overlap today's forced card. */
function forceToday(rows: ScheduleEntry[], uid: string): void {
  const now = new Date()
  const date = iso(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const forced: ScheduleEntry = { uid, date, isOff: false, ...TODAY_DIA }
  const hit = rows.find(e => e.uid === uid && e.date === date)
  if (hit) Object.assign(hit, forced)
  else rows.push(forced)

  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const prevDate = iso(y.getFullYear(), y.getMonth() + 1, y.getDate())
  const prev = rows.find(e => e.uid === uid && e.date === prevDate)
  if (prev && !prev.isOff && endHour(prev.endTime) > 24) {
    prev.endTime = '23:30'   // keep yesterday a workday, but no bleed into today
  }
}

/** All demo schedules: me + 12 colleagues, across prev/current/next month. */
export function buildDemoSchedules(): ScheduleEntry[] {
  const out: ScheduleEntry[] = []
  for (const { year, month } of demoMonths()) {
    out.push(...generateForUser(DEMO_ME.uid, 42, 1.0, year, month))
    DEMO_COLLEAGUES.forEach((c, i) =>
      out.push(...generateForUser(c.uid, 100 + i * 7, 1.1 + (i % 3) * 0.1, year, month)),
    )
  }
  forceToday(out, DEMO_ME.uid)
  return out
}

/** "My" schedule for an arbitrary uid (used when a user "uploads" their sheet) —
 * same deterministic data as the demo me, anchored to the current month range. */
export function buildMyScheduleFor(uid: string): ScheduleEntry[] {
  const out: ScheduleEntry[] = []
  for (const { year, month } of demoMonths()) {
    out.push(...generateForUser(uid, 42, 1.0, year, month))
  }
  forceToday(out, uid)
  return out
}

export function findColleague(uid: string): Colleague | undefined {
  return DEMO_COLLEAGUES.find(c => c.uid === uid)
}

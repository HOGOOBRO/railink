/**
 * Demo data — 1:1 port of the design prototype's `makeSchedules()`
 * (railink/project/prototype.jsx) + the colleague directory
 * (railink/project/screens-c.jsx). Deterministic so the calendar,
 * compare strip, search and timeline all show meaningful content.
 */
import type { ScheduleEntry } from '@/lib/types/schedule'

export interface Colleague {
  uid: string
  name: string
  employeeId: string
  office: string
  email: string
  photo?: string
}

/** Seeded "me" — the demo account (이서연). Uses an @railink.app address:
 * RaiLink is an independent app, so demo data must not imply a @korail.com
 * (official Korail) identity. */
export const DEMO_ME = {
  uid: 'demo-me-001',
  email: 'seoyeon.lee@railink.app',
  pw: 'demo1234',
  name: '이서연',
  employeeId: '110512',
  part: 'B',
  photo: '/avatars/avatar-5.svg',
} as const

/** Memorable demo credentials shown on the login card / prefilled.
 * These alias to the DEMO_ME account at sign-in (prototype parity:
 * the prototype's login card shows these, the menu shows the real email). */
export const DEMO_LOGIN = {
  email: 'demo.minjun@railink.app',
  pw: 'demo1234',
} as const

/** Demo colleagues (search directory). Half intentionally have no photo. */
export const DEMO_COLLEAGUES: Colleague[] = [
  { uid: 'u1',  name: '김민준', employeeId: '102204', office: '서울 · B',  email: 'demo.minjun@railink.app', photo: '/avatars/avatar-1.svg' },
  { uid: 'u2',  name: '박지호', employeeId: '108839', office: '서울 · A',  email: 'demo.jiho@railink.app',   photo: '/avatars/avatar-6.svg' },
  { uid: 'u3',  name: '최예진', employeeId: '113207', office: '광명 · B',  email: 'demo.yejin@railink.app' },
  { uid: 'u4',  name: '정도윤', employeeId: '105621', office: '서울 · C',  email: 'demo.doyoon@railink.app', photo: '/avatars/avatar-4.svg' },
  { uid: 'u5',  name: '한가람', employeeId: '120044', office: '부산 · B',  email: 'demo.garam@railink.app' },
  { uid: 'u6',  name: '오수빈', employeeId: '117788', office: '대전 · A',  email: 'demo.subin@railink.app',  photo: '/avatars/avatar-9.svg' },
  { uid: 'u7',  name: '윤하늘', employeeId: '123456', office: '동대구 · B', email: 'demo.haneul@railink.app' },
  { uid: 'u8',  name: '강예나', employeeId: '129002', office: '서울 · B',  email: 'demo.yena@railink.app',   photo: '/avatars/avatar-8.svg' },
  { uid: 'u9',  name: '문지원', employeeId: '104871', office: '광명 · A',  email: 'demo.jiwon@railink.app' },
  { uid: 'u10', name: '서가온', employeeId: '118330', office: '부산 · C',  email: 'demo.gaon@railink.app',   photo: '/avatars/avatar-11.svg' },
  { uid: 'u11', name: '장태리', employeeId: '127015', office: '대전 · B',  email: 'demo.taeri@railink.app' },
  { uid: 'u12', name: '임도하', employeeId: '116602', office: '서울 · A',  email: 'demo.doha@railink.app',   photo: '/avatars/avatar-12.svg' },
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

const YEAR = 2026
const MONTH = 5 // May 2026

function iso(day: number): string {
  return `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Deterministic per-user May 2026 schedule (ported from prototype). */
function generateForUser(uid: string, userSeed: number, intensity: number): ScheduleEntry[] {
  let s = userSeed
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }

  const out: ScheduleEntry[] = []
  const lastDay = 31
  let i = 1
  while (i <= lastDay) {
    const r = rand()
    if (r < 0.22 * (1 / intensity)) {
      const type = rand() < 0.4 ? 'S(주휴)' : 'S'
      out.push({ uid, date: iso(i), diaNr: type, isOff: true })
      i++
    } else if (r < 0.32) {
      // Night shift spans 2 days
      const t = TR[Math.floor(rand() * TR.length)]
      const dia = DIAS[Math.floor(rand() * DIAS.length)]
      out.push({
        uid, date: iso(i), diaNr: dia, trainNr: `${t[0]} · ${t[1]}`,
        startTime: hm(t[2]), endTime: hm(t[3]), isOff: false,
      })
      if (i + 1 <= lastDay) {
        out.push({
          uid, date: iso(i + 1), diaNr: `~(${dia})`, trainNr: `${t[0]} · ${t[1]}`,
          startTime: hm(t[2]), endTime: hm(t[3]), isOff: false,
        })
      }
      i += 2
    } else {
      const t = TR[Math.floor(rand() * TR.length)]
      const dia = DIAS[Math.floor(rand() * DIAS.length)]
      out.push({
        uid, date: iso(i), diaNr: dia, trainNr: `${t[0]} · ${t[1]}`,
        startTime: hm(t[2]), endTime: hm(t[3]), isOff: false,
      })
      i++
    }
  }
  return out
}

/** All demo schedules: me + 12 colleagues, for May 2026. */
export function buildDemoSchedules(): ScheduleEntry[] {
  const me = generateForUser(DEMO_ME.uid, 42, 1.0)
  // Force May 19 (today) to be a workday for me, with H1055.
  const may19 = me.find(e => e.date === iso(19))
  const forced: ScheduleEntry = {
    uid: DEMO_ME.uid, date: iso(19), diaNr: 'H1055',
    trainNr: '16 · 216', startTime: hm(10.97), endTime: hm(20.17), isOff: false,
  }
  if (may19) Object.assign(may19, forced)
  else me.push(forced)

  const colleagues = DEMO_COLLEAGUES.flatMap((c, i) =>
    generateForUser(c.uid, 100 + i * 7, 1.1 + (i % 3) * 0.1),
  )
  return [...me, ...colleagues]
}

/** "My" May 2026 schedule for an arbitrary uid (used when a user
 * "uploads" their sheet — same deterministic data as the demo me). */
export function buildMyScheduleFor(uid: string): ScheduleEntry[] {
  const me = generateForUser(uid, 42, 1.0)
  const forced: ScheduleEntry = {
    uid, date: iso(19), diaNr: 'H1055',
    trainNr: '16 · 216', startTime: hm(10.97), endTime: hm(20.17), isOff: false,
  }
  const may19 = me.find(e => e.date === iso(19))
  if (may19) Object.assign(may19, forced)
  else me.push(forced)
  return me
}

export function findColleague(uid: string): Colleague | undefined {
  return DEMO_COLLEAGUES.find(c => c.uid === uid)
}

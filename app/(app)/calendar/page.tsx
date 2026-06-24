'use client'

import { type ReactNode, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useToast } from '@/components/ui/Toast'
import {
  BrandMark, SearchIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, UploadIcon, ArrowRightIcon, EditIcon, UserPlusIcon, CakeIcon, CloseIcon, PinIcon, BellIcon,
} from '@/components/ui/icons'
import { CalCell, type CellBar } from '@/components/calendar/CalCell'
import { DetailSheet } from '@/components/calendar/DetailSheet'
import { MenuSheet } from '@/components/calendar/MenuSheet'
import { InviteCreateSheet } from '@/components/calendar/InviteCreateSheet'
import { InvitePromptSheet, type InvitePromptTrigger } from '@/components/calendar/InvitePromptSheet'
import { PersonalHintCard } from '@/components/calendar/PersonalHintCard'
import { SearchOverlay } from '@/components/calendar/SearchOverlay'
import { UploadModal } from '@/components/calendar/UploadModal'
import { GroupTabs } from '@/components/calendar/GroupTabs'
import { ManageGroupsSheet } from '@/components/calendar/ManageGroupsSheet'
import { CompareMemberSheet } from '@/components/calendar/CompareMemberSheet'
import { AppointmentWizard } from '@/components/calendar/AppointmentWizard'
import { FabSpeedDial } from '@/components/calendar/FabSpeedDial'
import { CalendarSkeleton, CalendarGridSkeleton } from '@/components/calendar/CalendarSkeleton'
import { BootSplash } from '@/components/loading/BootSplash'
import { Spinner } from '@/components/ui/Spinner'
import { useDelayedFlag } from '@/lib/use-delayed-flag'
import type { MonthPerson, MonthShift } from '@/components/calendar/MonthTimeline'
import { getCurrentSession, getCachedSession, hasPersistedSession, getPersistedIdentity, logout, getMarketingConsent, setMarketingConsent, getJobCategory, setJobCategory, type Session, type PersistedIdentity } from '@/lib/auth'
import { JOB_OPTIONS, findAirline } from '@/lib/profile-fields'
import { builtinCode } from '@/lib/roster-codes'
import { track } from '@/lib/analytics'
import {
  getMonthSchedules,
  getRemoteMonthSchedules,
  getRemoteMonthSchedulesForUsers,
  replaceRemoteUserScheduleMonths,
  replaceUserScheduleMonths,
  replaceUsersMonthCache,
} from '@/lib/store/schedules'
import {
  getGroupsState, saveGroupsState, activeGroupOf, allMemberUids,
  addToActiveGroup, removeFromActiveGroup, setActiveGroup,
  createGroup, renameGroup, deleteGroup, reorderGroups, MAX_PER_GROUP,
  enableRemoteGroupSync, disableRemoteGroupSync, hydrateGroupsFromRemote,
  noteGroupOverflow,
} from '@/lib/store/groups'
import {
  findColleagueInDirectory,
  getColleagueDirectory,
  findProfileByEmployeeId,
  findProfileByEmail,
  isDemoColleagueUid,
} from '@/lib/store/colleagues'
import { myViewerShareStatuses, requestShare, cancelShare, listShares } from '@/lib/store/shares'
import { getMemberBirthdays, getMyBirthday } from '@/lib/store/birthdays'
import { consumePendingInvite } from '@/lib/store/invites'
import { getMemberColors, setMemberColor } from '@/lib/store/member-colors'
import {
  getMonthAppointments, addAppointment, deleteAppointment,
  getRemoteMonthAppointments, createRemoteAppointment, deleteRemoteAppointment, respondRemoteAppointment,
  getMyPendingApptInvites, type PendingApptInvite,
} from '@/lib/store/appointments'
import { isPushSupported, enablePush, getPushStatus, pushNeedsIosInstall } from '@/lib/push'
import { buildDemoBirthdays, type Colleague } from '@/lib/demo-data'
import {
  DOW_KR, buildMonthCells, hmToDecimal,
} from '@/lib/schedule-utils'
import { routeForFlights, flightEndpoints, airportTz, endpointsFromLegs, routeFromLegs } from '@/lib/airline-routes'
import { holidayNameFor } from '@/lib/holidays-kr'
import type { ParsedScheduleRow } from '@/lib/parse/schedule-file'
import type { ApptCard } from '@/components/calendar/MonthTimeline'
import type { Appointment, CompareEntry, CompareColor, GroupsState, ScheduleEntry, ShareStatus } from '@/lib/types/schedule'

const BRAND = 'var(--brand)'
const cssColor = (c: CompareColor) => `var(--${c})`

// One-time migration notice (§6). Value 'skipped-new-user' permanently blocks it
// for accounts that never had compares, so they never see the notice at all.
const MIGRATION_KEY = 'rl.migrationNotice.dismissed'

const KST_TZ = 'Asia/Seoul'

// 특정 타임존(tz)에서의 벽시계(year/month/day hh:mm)를 UTC epoch(ms)로 환산.
// 항공편 시각은 각 공항 현지시각이라 인천(KST) 기준으로 맞추려면 이게 필요하다.
function wallToUtcMs(year: number, month: number, day: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(year, month - 1, day, hh, mm)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess))
  const g = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const localAsUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
  return guess - (localAsUtc - guess) // guess - offset
}

// 출발(공항 현지) + 도착(공항 현지)을 인천(KST) 기준 타임라인 위치로 환산.
// 국내/같은 시간대면 기존 동작 그대로(KTX·일반 근무 안전). 외국 공항이 끼면 KST로 변환하고
// 원래 현지시각은 메모(localTime)로 남긴다.
function placeShift(
  year: number, month: number,
  depDay: number, depLocal: string, fromAirport: string | undefined,
  arrDay: number, arrLocal: string, toAirport: string | undefined,
): { day: number; start: number; end: number; depLabel?: string; arrLabel?: string } {
  const fromTz = airportTz(fromAirport)
  const toTz = airportTz(toAirport)
  if (fromTz === KST_TZ && toTz === KST_TZ) {
    const start = hmToDecimal(depLocal)
    let end = hmToDecimal(arrLocal)
    if (arrDay > depDay) end += 24 * (arrDay - depDay)
    else if (end < start) end += 24
    return { day: depDay, start, end }
  }
  // 파서는 익일 종료를 24+로 저장(예: 17:50 → "41:50")하지만, 국제선은 출·도착
  // 타임존이 달라 그 +24를 신뢰하면 안 된다(이중계산 → 37시간짜리 블록). 실제 벽시계
  // (0-23)로 환산한 뒤, 실제 instant 비교(while)로 날짜 넘김을 판단한다.
  const sh = Number(depLocal.split(':')[0]) % 24
  const sm = Number(depLocal.split(':')[1])
  const eh = Number(arrLocal.split(':')[0]) % 24
  const em = Number(arrLocal.split(':')[1])
  const depUtc = wallToUtcMs(year, month, depDay, sh, sm, fromTz)
  let arrUtc = wallToUtcMs(year, month, arrDay, eh, em, toTz)
  while (arrUtc <= depUtc) arrUtc += 86_400_000
  const dk = new Date(depUtc + 9 * 3_600_000) // KST = UTC+9
  const ak = new Date(arrUtc + 9 * 3_600_000)
  const start = dk.getUTCHours() + dk.getUTCMinutes() / 60
  // 라벨: 각 공항을 그 공항 현지시각으로(인천은 인천, LA는 LA) + 외국 공항이면 한국시각도
  // 함께(예: "LAX 17:50 · 한국 09:50"). 블록 위치/길이는 KST instant(start/end)로 잡는다.
  const pad = (n: number) => String(n).padStart(2, '0')
  const kstClk = (x: Date) => `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`
  const depLabel = `${fromAirport ?? ''} ${pad(sh)}:${pad(sm)}`.trim()
    + (fromTz !== KST_TZ ? ` (한국시간 ${kstClk(dk)})` : '')
  const arrLabel = `${toAirport ?? ''} ${pad(eh)}:${pad(em)}`.trim()
    + (toTz !== KST_TZ ? ` (한국시간 ${kstClk(ak)})` : '')
  // KST 출발일이 다른 달로 넘어가면(월말 국제선) 그 달 1일에 잘못 그려지므로, 같은 달일
  // 때만 KST 날짜를 쓰고 아니면 출발 셀 날짜로 둔다.
  const day = (dk.getUTCFullYear() === year && dk.getUTCMonth() === month - 1) ? dk.getUTCDate() : depDay
  return { day, start, end: start + (arrUtc - depUtc) / 3_600_000, depLabel, arrLabel }
}

// 한국(국내) 공항 — 아웃/인바운드 방향과 '외국 체류' 레이오버 판별의 기준. 국내선
// 구간(예: GMP→CJU)은 방향 배지·레이오버 없이 그대로 그린다.
const HOME_AIRPORTS = new Set(['ICN', 'GMP', 'CJU', 'PUS', 'RSU', 'TAE', 'KWJ', 'USN', 'KUV', 'WJU', 'HIN', 'KPO', 'MWX', 'CJJ'])
// 베이스(집) — 서울베이스 기준 ICN·GMP만. 그 외 스테이션(국내 CJU·RSU 포함, 해외 전부)에서
// 자면 전부 '체류'다. 방향 배지(flightDir)는 '한국 vs 외국'이라 HOME_AIRPORTS(전 한국공항)를
// 그대로 쓰고, 체류 판정만 이 BASE로 좁힌다.
const BASE_AIRPORTS = new Set(['ICN', 'GMP'])

// 노선으로 아웃바운드(한국 출발)/인바운드(한국 도착) 판별. 둘 다 한국이거나(왕복)
// 둘 다 외국이면 방향 없음(undefined).
function flightDir(from?: string, to?: string): '아웃바운드' | '인바운드' | undefined {
  if (!from || !to) return undefined
  const fromHome = HOME_AIRPORTS.has(from), toHome = HOME_AIRPORTS.has(to)
  if (fromHome && !toHome) return '아웃바운드'
  if (toHome && !fromHome) return '인바운드'
  return undefined
}

// One person's working shifts across the month, for the continuous timeline.
// 항공편은 공항 현지시각이라 인천(KST) 기준으로 환산해 위치를 잡는다(placeShift).
// 비행 사이 외국 체류는 '레이오버' 연속 블록으로 채운다. 순수 REST는 카드로 안 띄운다.
function monthShifts(entryOf: (iso: string) => ScheduleEntry | undefined, year: number, month: number, airline?: string): MonthShift[] {
  const dim = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  const out: MonthShift[] = []
  const skip = new Set<number>()
  const at = (d: number) => entryOf(`${year}-${mm}-${String(d).padStart(2, '0')}`)
  const rt = (trainNr?: string) => routeForFlights(airline, trainNr) ?? undefined
  // 비행에는 REST(레이오버 마커)를 코드로 붙이지 않는다(인바운드 비행이 쉬는 것처럼 보임).
  const flightDia = (raw?: string) => (raw === 'REST' ? undefined : raw)
  for (let d = 1; d <= dim; d++) {
    if (skip.has(d)) continue
    const e = at(d)
    if (!e || e.isOff || (e.diaNr && e.diaNr.startsWith('~('))) continue
    // 레이오버(휴식) 마커 — 항공 승무원의 시각·편명 없는 순수 REST만 스킵(체류 블록이 대체).
    // KTX/일반 계정은 영향 없게 airline일 때만.
    if (airline && e.diaNr === 'REST' && !e.startTime && !e.endTime && !e.trainNr) continue
    // 노선 명시 항공사(아시아나 등): 저장된 레그로 노선·시차·레그별 상세를 만든다.
    // 편명 룩업표 대신 SECTOR를 그대로 쓰므로 노선 수에 제약이 없다.
    if (airline && e.flights?.length) {
      const legs = e.flights
      const first = legs[0], last = legs[legs.length - 1]
      const { from, to } = endpointsFromLegs(legs)
      if (first.std && last.sta) {
        // 근무 시작 = 쇼업(있으면). 쇼업은 실제 출근 시각이라 첫 비행 출발보다 빠르다.
        // 없으면 첫 비행 출발로. 쇼업은 보통 한국공항(KST)이라 시차 병기 없이 '쇼업 HH:MM'.
        const showupLeg = legs.find(l => l.showup)
        const startLocal = showupLeg?.showup ?? (first.std as string)
        const p = placeShift(year, month, d, startLocal, from, d, last.sta, to)
        const legViews = legs.map(lg => {
          // 두 공항이 다 있을 때만 시차 환산(placeShift). 한쪽이 미상이면 KST 기본값 때문에
          // 엉뚱한 '한국시간'이 붙으므로, 그냥 원문 라벨(공항+시각)만 쓴다.
          const lp = lg.from && lg.to
            ? placeShift(year, month, d, lg.std ?? '', lg.from, d, lg.sta ?? '', lg.to)
            : { depLabel: undefined, arrLabel: undefined }
          return {
            flight: lg.flight,
            route: [lg.from, lg.to].filter(Boolean).join('→') || undefined,
            depLabel: lp.depLabel ?? ((lg.from || lg.std) ? `${lg.from ?? ''} ${lg.std ?? ''}`.trim() : undefined),
            arrLabel: lp.arrLabel ?? ((lg.to || lg.sta) ? `${lg.to ?? ''} ${lg.sta ?? ''}`.trim() : undefined),
            dir: flightDir(lg.from, lg.to),
          }
        })
        const depLabel = showupLeg?.showup
          ? `쇼업 ${showupLeg.terminal ? `${showupLeg.terminal} ` : ''}${showupLeg.showup}`
          : (p.depLabel ?? ((from || first.std) ? `${from ?? ''} ${first.std ?? ''}`.trim() : undefined))
        const arrLabel = p.arrLabel ?? ((to || last.sta) ? `${to ?? ''} ${last.sta ?? ''}`.trim() : undefined)
        out.push({ day: p.day, dia: flightDia(e.diaNr), trainNr: e.trainNr, start: p.start, end: p.end, route: routeFromLegs(legs) ?? undefined, depLabel, arrLabel, dir: flightDir(from, to), fromAirport: from, toAirport: to, legs: legViews })
        continue
      }
    }
    const hasStart = !!e.startTime, hasEnd = !!e.endTime
    if (!hasStart && !hasEnd) {
      // STBY(대기): 로스터에 시각이 없고('확인요망') 종일 대기 성격 → 하루종일 밴드로
      // 그려 "이 날 비어있지 않음"이 한눈에 보이게 한다.
      if (airline && builtinCode(e.diaNr)?.category === 'standby') {
        out.push({ day: d, dia: e.diaNr || 'STBY', start: 0, end: 24, standby: true })
        continue
      }
      // 그 외 시간 없는 코드: 편명/노선도 없으면 '의도된 코드'(훈련 등) — 원래 시간이 없는
      // 근무다. 편명은 있는데 시간만 없으면 인식 누락(경고 대상). 이 둘을 구분한다.
      const codeOnly = !e.trainNr && !e.flights?.length
      out.push({ day: d, dia: e.diaNr, trainNr: e.trainNr, start: 0, end: 0, noTime: true, codeOnly, route: rt(e.trainNr) })
      continue
    }
    if (hasStart && hasEnd) {
      const ep = flightEndpoints(airline, e.trainNr)
      const p = placeShift(year, month, d, e.startTime as string, ep.from, d, e.endTime as string, ep.to)
      out.push({ day: p.day, dia: flightDia(e.diaNr), trainNr: e.trainNr, start: p.start, end: p.end, route: rt(e.trainNr), depLabel: p.depLabel, arrLabel: p.arrLabel, dir: flightDir(ep.from, ep.to), fromAirport: ep.from, toAirport: ep.to })
      continue
    }
    // 한쪽 시각만 = 밤샘 연속근무. 시작만 있는 날 + 다음날 끝만 있는 날을 하나로 병합.
    if (hasStart) {
      const nx = at(d + 1)
      if (nx && !nx.isOff && nx.endTime && !nx.startTime) {
        const trainNr = e.trainNr || nx.trainNr
        const ep = flightEndpoints(airline, trainNr)
        const p = placeShift(year, month, d, e.startTime as string, ep.from, d + 1, nx.endTime, ep.to)
        out.push({ day: p.day, dia: flightDia(e.diaNr || nx.diaNr), trainNr, start: p.start, end: p.end, route: rt(trainNr), depLabel: p.depLabel, arrLabel: p.arrLabel, dir: flightDir(ep.from, ep.to), fromAirport: ep.from, toAirport: ep.to })
        skip.add(d + 1)
        continue
      }
      out.push({ day: d, dia: e.diaNr, trainNr: e.trainNr, start: hmToDecimal(e.startTime as string), end: 24, cont: 'start', route: rt(e.trainNr) })
      continue
    }
    out.push({ day: d, dia: e.diaNr, trainNr: e.trainNr, start: 0, end: hmToDecimal(e.endTime as string), cont: 'end', route: rt(e.trainNr) })
  }

  // 레이오버 후처리: 외국에 도착한 비행 → 다음 외국발 비행 사이를 연속 '체류' 블록으로.
  const flights = out
    .filter(s => s.fromAirport || s.toAirport)
    .sort((a, b) => ((a.day - 1) * 24 + a.start) - ((b.day - 1) * 24 + b.start))
  for (let i = 0; i < flights.length - 1; i++) {
    const a = flights[i], b = flights[i + 1]
    const aAway = !!a.toAirport && !BASE_AIRPORTS.has(a.toAirport)
    const bAway = !!b.fromAirport && !BASE_AIRPORTS.has(b.fromAirport)
    // 같은 트립일 때만 체류로 잇는다: 도착공항 == 다음 비행 출발공항. (서로 다른 외국
    // 트립을 한 덩어리로 잘못 묶지 않도록.)
    // 바로 인접한 두 비행만 본다(i, i+1). 그래서 사이에 귀국편(→ICN/GMP)이 끼면 둘이
    // 더 이상 인접하지 않아 자연히 안 이어진다 = "집에 가면 끊김"이 이미 보장됨. 시간 가드 불필요.
    if (!aAway || !bAway || a.toAirport !== b.fromAirport) continue
    const aEnd = (a.day - 1) * 24 + a.end
    const bStart = (b.day - 1) * 24 + b.start
    if (bStart <= aEnd) continue
    // 같은 트립: 아웃바운드 비행·체류·인바운드 비행이 맞닿는 모서리를 붙여 한 근무처럼.
    a.connectBottom = true
    b.connectTop = true
    out.push({ day: a.day, start: a.end, end: a.end + (bStart - aEnd), layover: true, dia: `${a.toAirport} 체류`, connectTop: true, connectBottom: true })
  }
  return out
}

export default function CalendarPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const t = useTranslations('calendar')
  const tFields = useTranslations('fields')

  const today = useMemo(() => new Date(), [])
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  // Seed from the SPA-lifetime session cache so client-side navigation back to
  // calendar doesn't flash the boot gate (session would otherwise start null).
  const [session, setSession] = useState<Session | null>(() => getCachedSession())
  // 콜드 부팅 폴백-렌더: 폰에 지속 세션 흔적이 있으면(재방문 사용자) 저장된 신원을
  // 읽어둔다. 세션 해석이 너무 오래 걸리면(아래 게이트의 bootStuck) BootSplash에
  // 무한히 묶이는 대신 이 신원으로 캘린더 스켈레톤을 띄워 탈출구를 준다. localStorage는
  // 서버 렌더엔 없으므로 hydration 불일치를 피하려 첫 렌더는 false로 두고 마운트
  // 직후 effect에서 채운다.
  const [likelyAuthed, setLikelyAuthed] = useState(false)
  const [bootIdentity, setBootIdentity] = useState<PersistedIdentity | null>(null)
  useEffect(() => {
    // 클라이언트 전용 저장소를 마운트 후 1회 읽는 의도된 단발 갱신(lazy initializer로
    // 첫 렌더에 읽으면 서버엔 localStorage가 없어 hydration이 깨진다).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLikelyAuthed(hasPersistedSession())
    setBootIdentity(getPersistedIdentity())
  }, [])
  const [groupsState, setGroupsState] = useState<GroupsState>({ groups: [], activeGroupId: null })
  const [mySched, setMySched] = useState<ScheduleEntry[]>([])
  const [colSched, setColSched] = useState<Record<string, ScheduleEntry[]>>({})
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  // Starts true: the directory fetch is the *last* step of the boot effect, so
  // opening the search overlay before it even starts must read as "loading",
  // not "no colleagues" (the empty state is only valid after a completed fetch).
  const [colleagueLoading, setColleagueLoading] = useState(true)
  // 첫 directory+share 동기화가 끝났는지(1회성). colleagueLoading은 월 이동마다
  // 다시 true가 되므로 빈 동료 CTA 게이트로 쓰면 매 이동마다 CTA가 깜빡인다.
  const [shareSynced, setShareSynced] = useState(false)
  const [shareStatus, setShareStatus] = useState<Record<string, ShareStatus>>({})
  const [pendingCount, setPendingCount] = useState(0)
  const [colorOverrides, setColorOverrides] = useState<Record<string, CompareColor>>({})
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [reload, setReload] = useState(0)
  // Compared colleagues' birthdays I'm allowed to see (uid → 'YYYY-MM-DD'); RLS
  // returns only accepted-share owners. My own birthday drives the nudge card.
  const [colBirthdays, setColBirthdays] = useState<Record<string, string>>({})
  const [myBirthday, setMyBirthday] = useState<string | null>(null)
  const [bdayNudgeDismissed, setBdayNudgeDismissed] = useState(true)
  // 푸시 알림 너지 — null=숨김 / 'enable'=탭 한 번 구독(지원 기기) / 'install'=
  // iOS 사파리 탭(설치해야 알림 가능). 둘 다 1회성, 거절·기존 구독자는 제외.
  const [pushNudge, setPushNudge] = useState<null | 'enable' | 'install'>(null)
  // 수신 동의 1회 프롬프트 — 가입 폼을 안 거친 계정(Google 가입, 동의 기능 이전
  // 가입자)에게만 뜬다 (marketing_consent_at IS NULL).
  const [mktAsk, setMktAsk] = useState(false)
  const [mktBusy, setMktBusy] = useState(false)
  // 직무 1회 프롬프트 — personal 계정 중 직무 미응답(Google 가입·직무 수집 이전
  // 가입자)에게만 뜬다 (job_category IS NULL). 확장 우선순위용, 선택 안 해도 됨.
  const [jobAsk, setJobAsk] = useState(false)
  const [jobBusy, setJobBusy] = useState(false)
  const [jobSel, setJobSel] = useState<string | null>(null)
  const [jobOther, setJobOther] = useState('')

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadStep, setUploadStep] = useState<'pick' | 'preview' | 'manual'>('pick')
  const [manageOpen, setManageOpen] = useState(false)
  const [manageStartCreate, setManageStartCreate] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  // 초대 권유 시트(노출·거절 계측). open과 trigger를 분리해 둔다 — 닫힘 애니메이션
  // 동안에도 마지막 변형 카피가 유지되도록(open=false 시 trigger는 그대로).
  const [nudgeOpen, setNudgeOpen] = useState(false)
  const [nudgeTrigger, setNudgeTrigger] = useState<InvitePromptTrigger | null>(null)
  const [firstCompareNudgePending, setFirstCompareNudgePending] = useState(false)
  // 주 버튼("초대 링크 만들기")으로 닫힐 때 dismiss 이중계수를 막는 플래그.
  const nudgeViaCtaRef = useRef(false)
  // Email to pre-scope the invite when opened from a failed email search.
  const [invitePrefillEmail, setInvitePrefillEmail] = useState<string | null>(null)
  // Default true = hidden, so the personal first-entry card never flashes for
  // KTX users or before the session resolves. Set from localStorage in the loader.
  const [hintDismissed, setHintDismissed] = useState(true)
  const [memberSheet, setMemberSheet] = useState<CompareEntry | null>(null)
  // 약속 잡기 — appointments visible to me this month (local store, MVP).
  const [appts, setAppts] = useState<Appointment[]>([])
  // True while the month's appointments are in flight (remote accounts) — lets
  // the detail sheet say "확인 중" instead of silently showing zero 약속.
  const [apptsLoading, setApptsLoading] = useState(true)
  // 받은 약속 초대(pending, 월 무관) — 초대 발견성 배너용. 실계정만(데모엔 초대 없음).
  const [apptInvites, setApptInvites] = useState<PendingApptInvite[]>([])
  // 이 세션에서 응답(수락/거절)한 약속 id — 부팅 effect의 초대 재조회가 늦게
  // 도착해도 응답한 초대가 배너에 되살아나지 않도록 거른다.
  const respondedApptIds = useRef<Set<string>>(new Set())
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardPreday, setWizardPreday] = useState<{ y: number; m: number; d: number } | null>(null)
  // First-load gate for the calendar skeleton (⑤). True until the initial
  // month data resolves; stays false afterwards so month/reload navigation
  // keeps the previous content visible instead of re-flashing a skeleton.
  const [booting, setBooting] = useState(true)
  // True once the real calendar has rendered at least once. Distinguishes the
  // cold boot (full-page skeleton ⑤ per design §5) from a later cache-less month
  // navigation, where the chrome (top bar · group tabs · compare pills) is
  // already on screen and unchanged — there we keep it and skeleton only the grid
  // so the group chips don't disappear/reappear (the flicker users reported).
  const bootedOnce = useRef(false)
  // 디렉터리+share 동기화가 한 번이라도 끝났는지. true가 된 뒤로는 reload 범프
  // (동료 추가)나 월 이동이 검색 목록을 "불러오는 중"으로 되돌리지 않게 한다 —
  // 검색 중에 추가할 때마다 목록이 깜빡(새로고침)되던 문제 방지. 갱신은 백그라운드.
  const directorySynced = useRef(false)
  // 그룹 서버 동기화를 이번 세션에서 한 번이라도 맞췄는지. reload·월 이동마다
  // 서버를 다시 읽으면, 방금 추가한 멤버(낙관 반영)를 stale 서버 값으로 덮어쓸
  // 수 있어 1회만 hydrate한다. 이후엔 로컬이 권위, 변경은 서버로 push만.
  const groupsHydrated = useRef(false)
  // Name of the colleague whose schedule is being fetched right now (④) — drives
  // the inline "불러오는 중" chip + bar. null when nothing is mid-fetch.
  const [loadingColleague, setLoadingColleague] = useState<string | null>(null)
  // True while the month's colleague schedules are in flight with *nothing*
  // cached to show — drives the generic "동료 근무표 불러오는 중" bar so the
  // my-schedule-only window doesn't read as "동료가 일정을 안 올렸나?".
  // Cached months render in the same paint as mine and sync silently, so this
  // stays false for them. Re-derived at the top of every boot-effect run.
  const [colsSyncing, setColsSyncing] = useState(false)

  // Loader: resolve the session (demo localStorage OR Supabase), then read
  // the localStorage schedule/compare stores. setState runs after the await,
  // so it is not a synchronous effect-body update.
  useEffect(() => {
    let alive = true
    ;(async () => {
      let s: Session | null = null
      try {
        s = await getCurrentSession()
      } catch {
        if (alive) router.replace('/login')
        return
      }
      if (!alive) return
      if (!s) { router.replace('/login'); return }
      // 실계정: 이번 세션 첫 부팅에 서버 그룹을 읽어 로컬과 맞춘다(기기 재설치
      // 복원). 1회만 — 이후 부팅은 로컬을 권위로 두고 서버엔 push만 한다.
      if (s.isDemo) {
        disableRemoteGroupSync()
      } else if (!groupsHydrated.current) {
        enableRemoteGroupSync(s.uid)
        groupsHydrated.current = true
        // 서버 그룹 동기화는 부팅(스플래시 해제)을 막지 않는다. setSession을 이 네트워크
        // 왕복 뒤로 미루면, proxy 콜드스타트/락 지연이 그대로 스플래시 시간이 된다(무한
        // 스플래시의 두 경로 중 하나였다). 첫 페인트는 로컬 그룹으로 즉시 그리고, 재설치
        // 복원처럼 서버에 더 최신 그룹이 있으면 hydrate가 로컬에 써넣은 뒤 reload를 한 번
        // 튕겨 다시 읽어 반영한다.
        const before = JSON.stringify(getGroupsState(s.uid))
        void hydrateGroupsFromRemote(s.uid).then(next => {
          if (!alive) return
          if (JSON.stringify(next) !== before) setReload(n => n + 1)
        })
      }
      // Groups + members. Demo colleagues are hidden from real accounts — filter
      // each group's members (same isolation rule the compare store had).
      const st = getGroupsState(s.uid)
      let groups = st.groups
      if (!s.isDemo) {
        let changed = false
        groups = groups.map(g => {
          const members = g.members.filter(m => !isDemoColleagueUid(m.uid))
          if (members.length !== g.members.length) changed = true
          return members.length === g.members.length ? g : { ...g, members }
        })
        if (changed) saveGroupsState(s.uid, { groups, activeGroupId: st.activeGroupId })
      }
      const activeGroupId = groups.some(g => g.id === st.activeGroupId)
        ? st.activeGroupId : (groups[0]?.id ?? null)
      const nextGroups: GroupsState = { groups, activeGroupId }
      const memberUids = allMemberUids(nextGroups)

      let mine = getMonthSchedules(s.uid, year, month)
      let cols: Record<string, ScheduleEntry[]> = {}
      // Colleague months are mirrored into the local store after every remote
      // sync (replaceUsersMonthCache below), so a revisited month paints the
      // colleague chips together with my own schedule instead of popping them
      // in after the network round trip.
      if (!s.isDemo) {
        for (const uid of memberUids) {
          const cached = getMonthSchedules(uid, year, month)
          if (cached.length) cols[uid] = cached
        }
      }
      // Nothing cached for any colleague → the gap is real this run; announce
      // the in-flight fetch instead of silently showing only my schedule.
      const colsPending = !s.isDemo && memberUids.length > 0 && Object.keys(cols).length === 0
      setColsSyncing(colsPending)

      setSession(s)
      setGroupsState(nextGroups)
      setMySched(mine)
      setColSched(cols)
      setColorOverrides(getMemberColors(s.uid))
      // 약속 잡기 — 데모는 localStorage, 실계정은 Supabase(remote, async).
      if (s.isDemo) {
        setAppts(getMonthAppointments(s.uid, year, month))
        setApptsLoading(false)
      } else {
        setAppts([])
        setApptsLoading(true)
        getRemoteMonthAppointments(year, month)
          .then(a => { if (alive) setAppts(a) })
          .catch(() => { /* SQL 미적용 등 — 약속만 비움 */ })
          .finally(() => { if (alive) setApptsLoading(false) })
        // 받은 약속 초대 배너 — 월과 무관한 전체 pending 초대. 실패해도 배너만
        // 안 뜰 뿐 날짜 탭 경로는 동작하지만, 원인 추적을 위해 콘솔엔 남긴다.
        getMyPendingApptInvites()
          .then(list => { if (alive) setApptInvites(list.filter(i => !respondedApptIds.current.has(i.id))) })
          .catch(e => console.warn('[appt-invites]', e))
      }
      // Have a locally-cached month already? Show it immediately and let the
      // remote sync update in place — never make a returning user stare at a
      // skeleton for data we already hold. When the target month has *no* local
      // cache (e.g. navigating to a not-yet-visited month) re-arm the skeleton (⑤)
      // so the remote fetch shows loading feedback instead of a bare empty grid.
      // Cleared unconditionally at the end of this effect (covers demo + remote +
      // empty-remote paths), so it can never hang. Cached months stay instant —
      // the demo's local-sync branch resolves before the 150ms gate, no flash.
      // Also hold the skeleton when NO colleague month is cached yet (colsPending):
      // gating boot on my-schedule alone would paint my-only with the shared bars
      // missing, which reads as "shared schedules vanished" on a cold open. Returning
      // users with cached colleagues have colsPending=false, so they stay instant.
      setBooting(mine.length === 0 || colsPending)
      // Personal first-entry hint: shown until dismissed (persisted per uid).
      setHintDismissed(
        s.profileType !== 'personal' ||
        (typeof window !== 'undefined' && localStorage.getItem(`railink_hint_dismissed_${s.uid}`) === '1'),
      )

      if (s.isDemo) {
        for (const uid of memberUids) cols[uid] = getMonthSchedules(uid, year, month)
        if (!alive) return
        // 새 객체로 — cols는 위에서 이미 state로 커밋된 참조라, 같은 참조를 다시
        // 넘기면 React가 업데이트를 건너뛴다(지금은 다른 state 변화 덕에 우연히
        // 렌더되지만 잠재 지뢰).
        setColSched({ ...cols })
        // Demo birthdays are local (no Supabase) so the cake marker is demoable.
        const allB = buildDemoBirthdays()
        const demoB: Record<string, string> = {}
        for (const uid of memberUids) if (allB[uid]) demoB[uid] = allB[uid]
        setColBirthdays(demoB)
      } else {
        // Birthdays — kicked off *concurrently* with the schedule fetch (not
        // after it) so cake markers land together with the month data instead
        // of popping in late. Caught independently so a birthday error never
        // blanks the calendar. RLS returns only colleagues who shared their
        // schedule with me (accepted); my own row decides the nudge card.
        const birthdaysPromise = Promise.all([
          getMemberBirthdays(memberUids),
          getMyBirthday(),
        ]).catch(() => null) // best-effort; leave markers/nudge off

        try {
          const [remoteMine, remoteCols] = await Promise.all([
            getRemoteMonthSchedules(s.uid, year, month),
            getRemoteMonthSchedulesForUsers(memberUids, year, month),
          ])
          if (!alive) return
          if (!remoteMine.length && mine.length) {
            await replaceRemoteUserScheduleMonths(s.uid, mine)
          } else {
            mine = remoteMine
          }
          cols = remoteCols
          // Mirror the fetch into the local cache (empty results clear stale
          // months) so the next visit paints colleagues with no gap.
          replaceUsersMonthCache(memberUids, year, month, remoteCols)
        } catch {
          // Keep the cached prefill — wiping it here would blank colleague
          // chips that are already on screen.
        }
        if (!alive) return
        setMySched(mine)
        setColSched({ ...cols })
        setColsSyncing(false)

        // 생일(케이크 마커·넛지)은 부가 정보라 첫 화면을 막지 않는다 — await 대신
        // 백그라운드로 받아 마커만 나중에 채워, 부팅 임계경로에서 콜드 네트워크 호출
        // 하나(생일)를 뺀다. 화면은 근무표가 뜨는 즉시 그려지고 케이크는 잠시 뒤 붙는다.
        birthdaysPromise.then(birthdays => {
          if (!alive || !birthdays) return
          const [memberB, myB] = birthdays
          setColBirthdays(memberB)
          setMyBirthday(myB)
          setBdayNudgeDismissed(
            myB !== null ||
            (typeof window !== 'undefined' && localStorage.getItem(`railink_bday_nudge_${s.uid}`) === '1'),
          )
        })
      }

      // Primary month data is on screen now — drop the first-load skeleton (⑤)
      // and clear any inline colleague-fetch indicator (④). Subsequent
      // month/reload runs leave booting false, so navigation keeps the prior
      // content rather than re-flashing a skeleton.
      if (alive) { setBooting(false); bootedOnce.current = true; setLoadingColleague(null) }

      // Invite connect — runs before the directory fetch so a freshly-created
      // accepted share's counterpart is included in the directory below (used to
      // resolve their name for auto-grouping). No-op (no network) when there's
      // no stashed token, so non-invited mounts pay nothing.
      if (!s.isDemo) {
        const invitedOwner = await consumePendingInvite()
        if (!alive) return
        if (invitedOwner) showToast(t('toast.inviteConnected', { name: invitedOwner.name }), 'success')
      }

      // 첫 동기화에서만 로딩 표시를 띄운다. 이후 reload(동료 추가)·월 이동은
      // 이미 로드된 디렉터리를 백그라운드로 갱신할 뿐, 검색 목록을 비우지 않는다.
      if (!directorySynced.current) setColleagueLoading(true)
      // §4/§5 share statuses are fetched *concurrently* with the directory, and
      // colleagueLoading stays on until both land — otherwise the search rows
      // appear first with every pill reading "추가" and flip to "요청 중" a beat
      // later. The stray .catch() only mutes the unhandled-rejection warning if
      // we bail out before the await below; the await still sees the error.
      const shareInfoPromise = s.isDemo ? null : Promise.all([myViewerShareStatuses(), listShares()])
      shareInfoPromise?.catch(() => {})
      let directoryList: Colleague[] = []
      try {
        directoryList = await getColleagueDirectory(s)
        if (!alive) return
        setColleagues(directoryList)
      } catch {
        if (alive) setColleagues([])
      }

      // §4 — my viewer-side share status drives the search overlay's actions.
      // §5 — pending requests where I'm the owner feed the inbox banner + badge.
      if (!s.isDemo && shareInfoPromise) {
        // §6 — one-time migration notice. Shown only to accounts that already had
        // compares (local groups/compare data); brand-new accounts are marked
        // 'skipped-new-user' so they never see it.
        // 반드시 auto-grouping(아래)보다 먼저: auto-grouping이 railink_groups_v1을
        // 써넣고 effect를 재실행시키므로, 뒤에서 검사하면 새 기기/시크릿 로그인이
        // "옛 비교 데이터 보유 유저"로 오판돼 마이그레이션 시트가 떠버린다.
        if (alive && typeof window !== 'undefined' && !localStorage.getItem(MIGRATION_KEY)) {
          let hadCompares = false
          try {
            const g = JSON.parse(localStorage.getItem('railink_groups_v1') ?? '{}')
            const c = JSON.parse(localStorage.getItem('railink_compare_v4') ?? '{}')
            // 그룹 "개수"가 아니라 "멤버 보유" 기준 — 멤버 없는 빈 그룹만 있는
            // 유저는 비교한 적이 없으므로 마이그레이션 안내 대상이 아니다.
            const groups: { members?: unknown[] }[] = g[s.uid]?.groups ?? []
            hadCompares = groups.some(gr => (gr.members?.length ?? 0) > 0) || (c[s.uid]?.length ?? 0) > 0
          } catch { /* treat as new user */ }
          if (hadCompares) setMigrationOpen(true)
          else localStorage.setItem(MIGRATION_KEY, 'skipped-new-user')
        }
        try {
          const [statuses, shares] = await shareInfoPromise
          if (!alive) return
          setShareStatus(statuses)
          setPendingCount(shares.incoming.length)

          // Invite auto-grouping: an accepted share I can view whose counterpart
          // isn't in any of my groups only arises from consume_invite (normal
          // adds put the person in a group first, then request). Add them to the
          // active/기본 group so inviter↔invitee both surface in compare. Reload
          // to pull the new member's schedule.
          const inGroupUids = new Set(allMemberUids(nextGroups))
          const ungrouped = shares.viewing.filter(v => !inGroupUids.has(v.ownerId))
          if (ungrouped.length) {
            let addedAny = false
            const overflowUids: string[] = []
            for (const v of ungrouped) {
              const prof = directoryList.find(d => d.uid === v.ownerId)
              const res = addToActiveGroup(s.uid, {
                uid: v.ownerId,
                name: prof?.name ?? '동료',
                employeeId: prof?.employeeId ?? '',
                photo: prof?.photo,
                office: prof?.office,
              })
              // entry set OR alreadyIn → it's grouped; null+!alreadyIn means the
              // active group is at the 10-person cap. Guard the reload on a real
              // change so a capped group can't loop the mount effect forever.
              if (res.entry || res.alreadyIn) addedAny = true
              else overflowUids.push(v.ownerId)
            }
            // Multi-use invite can connect more people than fit in one 그룹. Tell
            // the owner so the overflow connections aren't silently lost — once
            // per uid (noteGroupOverflow) so this doesn't re-toast every mount.
            if (overflowUids.length && noteGroupOverflow(s.uid, overflowUids) > 0) {
              showToast(
                t('toast.groupOverflow', { count: overflowUids.length, max: MAX_PER_GROUP }),
                'default',
              )
            }
            if (addedAny) { if (alive) setReload(n => n + 1); return }
          }

          // Reconciler: groups ≡ share intent. Any pending outgoing whose owner
          // isn't in any of my groups (legacy / failed-cancel / cross-device drift)
          // gets silently cleaned up. Fire-and-forget; next-mount catches retries.
          const inGroup = new Set(allMemberUids(nextGroups))
          const orphans = shares.outgoing.filter(o => !inGroup.has(o.ownerId)).map(o => o.ownerId)
          if (orphans.length) {
            setShareStatus(s2 => {
              const out = { ...s2 }
              for (const uid of orphans) delete out[uid]
              return out
            })
            for (const uid of orphans) cancelShare(uid).catch(() => { /* retried next mount */ })
          }
        } catch { /* search falls back to "요청"; banner stays hidden */ }

      }
      // Directory + share statuses are both in — search rows render complete.
      // (The auto-grouping `return` above skips this on purpose: it bumps
      // `reload`, the effect re-runs, and that pass releases the flag.)
      if (alive) { setColleagueLoading(false); setShareSynced(true); directorySynced.current = true }
    })()
    return () => { alive = false }
  }, [router, year, month, reload, showToast, t])

  function dismissMigration() {
    if (typeof window !== 'undefined') localStorage.setItem(MIGRATION_KEY, 'dismissed')
    setMigrationOpen(false)
  }

  // The calendar reads from the active group only; switching tabs is a pure
  // read-side swap (colSched already holds every group's members).
  const activeGroup = useMemo(() => activeGroupOf(groupsState), [groupsState])
  // Apply per-owner color overrides (stored locally only) before downstream
  // consumers (bars, timeline, pills) read cmp.color.
  const compares = useMemo<CompareEntry[]>(() => {
    const base = activeGroup?.members ?? []
    return base.map(m => {
      const o = colorOverrides[m.uid]
      return o ? { ...m, color: o } : m
    })
  }, [activeGroup, colorOverrides])

  // My schedule for the visible month, by ISO date.
  const myByDate = useMemo(() => {
    const m = new Map<string, ScheduleEntry>()
    for (const e of mySched) m.set(e.date, e)
    return m
  }, [mySched])

  // Each compared colleague's schedule for the visible month, by ISO date.
  const compareByDate = useMemo(() => {
    const map = new Map<string, Map<string, ScheduleEntry>>()
    for (const c of compares) {
      const inner = new Map<string, ScheduleEntry>()
      for (const e of colSched[c.uid] ?? []) inner.set(e.date, e)
      map.set(c.uid, inner)
    }
    return map
  }, [compares, colSched])

  const hasMySchedule = myByDate.size > 0

  // 열려 있는 오버레이가 하나라도 있는지(권유 시트 자신은 제외) — 트리거 ① 가드와
  // 하단 JSX가 공유한다. early-return 위에서 선언해야 훅(가드 effect)이 참조할 수 있다.
  const overlayOpen = detailOpen || searchOpen || uploadOpen || menuOpen || manageOpen || inviteOpen || !!memberSheet || wizardOpen

  // 권유 시트를 띄우는 순간 노출 1회 계측(trigger별). open/trigger를 같이 세팅한다.
  // 데모 계정엔 띄우지 않는다 — 가입 전 사용자라 초대 흐름이 무의미하고(데모의 목표는
  // 가입 전환), invite_prompt_view도 발사하지 않는다. first_compare·schedule_create 등
  // 기존 활성화 지표는 호출부에서 따로 계측되므로 영향 없음.
  const showNudge = useCallback((trigger: InvitePromptTrigger) => {
    if (session?.isDemo) return
    nudgeViaCtaRef.current = false
    setNudgeTrigger(trigger)
    setNudgeOpen(true)
    track('invite_prompt_view', { trigger, demo: 'no' })
  }, [session?.isDemo])

  // X·백드롭·스와이프(=거절)로 닫힐 때만 dismiss. 주 버튼 경로(nudgeViaCtaRef)는 제외.
  const closeNudge = useCallback(() => {
    if (!nudgeViaCtaRef.current && nudgeTrigger) {
      track('invite_prompt_dismiss', { trigger: nudgeTrigger, demo: session?.isDemo ? 'yes' : 'no' })
    }
    setNudgeOpen(false)
  }, [nudgeTrigger, session?.isDemo])

  // 주 버튼: 권유 시트를 닫고 기존 친구 초대 시트를 연다(거기서 invite_create가 발사됨).
  const handleNudgeCreate = useCallback(() => {
    nudgeViaCtaRef.current = true
    setNudgeOpen(false)
    setInviteOpen(true)
  }, [])

  // 트리거 ① 오버레이 가드: 첫 겹쳐보기 직후, 다른 시트가 다 닫혀 화면이 깨끗해지면 띄운다.
  useEffect(() => {
    if (!firstCompareNudgePending || overlayOpen || nudgeOpen) return
    setFirstCompareNudgePending(false)
    showNudge('first_compare')
  }, [firstCompareNudgePending, overlayOpen, nudgeOpen, showNudge])

  // first_compare — 내 일정 위에 동료 일정이 처음 겹쳐 그려진 순간(활성화 지표).
  // 계정당 1회: 기존 1회성 플래그들과 같은 per-uid localStorage 가드(브라우저
  // 단위라 새 기기에선 드물게 중복 — 기존 이벤트들과 동일하게 수용).
  useEffect(() => {
    if (!session || booting || typeof window === 'undefined') return
    const key = `railink_first_compare_${session.uid}`
    if (localStorage.getItem(key) === '1') return
    const colleagueDrawn = compares.some(c => (compareByDate.get(c.uid)?.size ?? 0) > 0)
    if (!hasMySchedule || !colleagueDrawn) return
    localStorage.setItem(key, '1')
    track('first_compare', { demo: session.isDemo ? 'yes' : 'no' })
    // 변형 ① 권유 예약 — 실제 노출은 위 가드 effect가 화면이 깨끗해질 때 처리.
    setFirstCompareNudgePending(true)
  }, [session, booting, compares, compareByDate, hasMySchedule])

  const weeks = buildMonthCells(year, month)
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const todayD = isCurrentMonth ? today.getDate() : null
  // 단일 "now" 소스(today)로 오늘 이전 날짜를 판정. 셀 iso(YYYY-MM-DD)와 사전순 비교 —
  // 엄격한 '<' 이므로 오늘은 과거가 아니고, 월 경계도 자동 처리된다(이전 달 셀은 전부 과거).
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const workDays = useMemo(
    () => [...myByDate.values()].filter(e => !e.isOff).length,
    [myByDate],
  )
  const offDays = myByDate.size - workDays

  // Bars per in-month day, ordered [me, ...compares].
  const barsByIso = useMemo(() => {
    const map = new Map<string, CellBar[]>()
    weeks.flat().forEach(c => {
      if (c.isOther || !c.iso) return
      const bars: CellBar[] = []
      const mine = myByDate.get(c.iso)
      if (mine) bars.push({ color: BRAND, isOff: mine.isOff })
      for (const cmp of compares) {
        const e = compareByDate.get(cmp.uid)?.get(c.iso)
        if (e) bars.push({ color: cssColor(cmp.color), isOff: e.isOff })
      }
      if (bars.length) map.set(c.iso, bars)
    })
    return map
  }, [weeks, myByDate, compares, compareByDate])

  // Birthdays falling in the visible month, keyed by day-of-month → [{name,color}].
  // The people currently on the calendar = me + compared colleagues (design
  // handoff §6). My own birthday (myBirthday, brand color) is always mine to see;
  // colleagues come from colBirthdays, which is already RLS-gated to accepted
  // shares. Match on month+day, ignoring year, so it recurs every year. Me first
  // so a shared day reads as mine.
  const birthdaysByDay = useMemo(() => {
    const map = new Map<number, { name: string; color: CompareColor | 'brand'; photo?: string }[]>()
    const mm = String(month).padStart(2, '0')
    const add = (day: number, entry: { name: string; color: CompareColor | 'brand'; photo?: string }) => {
      const list = map.get(day) ?? []
      list.push(entry)
      map.set(day, list)
    }
    if (session && myBirthday && myBirthday.slice(5, 7) === mm) {
      add(Number(myBirthday.slice(8, 10)), { name: session.name, color: 'brand', photo: session.photo })
    }
    for (const cmp of compares) {
      const b = colBirthdays[cmp.uid]
      if (!b || b.slice(5, 7) !== mm) continue
      add(Number(b.slice(8, 10)), { name: cmp.name, color: cmp.color, photo: cmp.photo })
    }
    return map
  }, [session, myBirthday, compares, colBirthdays, month])

  // 약속 잡기 — entry lookup over already-loaded month data (me + compares),
  // fed to the wizard's finder/overlap checks (decision #3: per-month reuse).
  const entryOf = useCallback(
    (uid: string, iso: string): ScheduleEntry | undefined =>
      uid === session?.uid ? myByDate.get(iso) : compareByDate.get(uid)?.get(iso),
    [session, myByDate, compareByDate],
  )

  // Appointments → timeline cards. Decimal hours; untimed → a default 09:00 slot
  // (flagged) so it still gets a card; overnight end normalized to 24+.
  const apptCards = useMemo<ApptCard[]>(() => appts.filter(a => {
    // 화면에 있는 사람(나+활성 그룹 비교 동료) 중 거절하지 않은 참여자가 있는
    // 약속만. 없으면 핀만 뜨고 시트엔 카드가 없는 "고스트 핀"이 된다 — 비교
    // 안 하는 share 동료의 solo busy, 내가 거절한 약속이 그 케이스.
    if (!session) return false
    const visible = new Set([session.uid, ...compares.map(c => c.uid)])
    return a.participants.some(uid => visible.has(uid) && a.participantStatuses?.[uid] !== 'declined')
  }).map(a => {
    const day = Number(a.date.slice(8, 10))
    const untimed = !a.start
    const start = a.start ? hmToDecimal(a.start) : 9
    let end = a.end ? hmToDecimal(a.end) : start + 2
    if (end <= start) end += 24
    return {
      id: a.id, ownerUid: a.ownerUid, participants: a.participants,
      participantStatuses: a.participantStatuses, myStatus: a.myStatus,
      day, title: a.title, start, end, untimed, hasEnd: !!a.end, place: a.place, memo: a.memo,
    }
  }), [appts, session, compares])

  // Days (of the visible month) carrying ≥1 appointment → CalCell pin marker.
  // apptCards 기준(가시성 필터 후)이라 고스트 핀이 생기지 않는다.
  const apptDays = useMemo(() => new Set(apptCards.map(c => c.day)), [apptCards])

  // 활성(active) 항공사만 전용 경험(자동 인식 파서·노선·시차·이미지 우선)을 켠다.
  // 준비중 항공사로 가입한 사용자는 태그(session.airline)만 저장돼 있고 일반
  // 근무자처럼 동작하다, 그 항공사가 active로 바뀌고 배포되면 자동 승격된다
  // (재가입·마이그레이션 불필요). 테마는 globals.css가 air-premia로 한정해 안전.
  const liveAirline = session && !session.isDemo && findAirline(session.airline)?.active
    ? session.airline
    : undefined

  // Timeline items for the selected date.
  // People (columns) with their month-long shifts — fed to the continuous
  // timeline so overnight shifts span the midnight divider as one card.
  // Pending colleagues (share not yet accepted) get an empty-shifts column
  // with a "수락 대기 중" notice rather than disappearing.
  const monthPeople = useMemo<MonthPerson[]>(() => {
    if (!session) return []
    const ppl: MonthPerson[] = [{
      uid: session.uid,
      color: BRAND, name: session.name, tag: t('compare.selfTag'), photo: session.photo,
      shifts: monthShifts(iso => myByDate.get(iso), year, month, liveAirline),
    }]
    for (const c of compares) {
      const pending = !session.isDemo && shareStatus[c.uid] === 'pending'
      ppl.push({
        uid: c.uid,
        color: cssColor(c.color), name: c.name, photo: c.photo,
        shifts: pending ? [] : monthShifts(iso => compareByDate.get(c.uid)?.get(iso), year, month, liveAirline),
        pending,
      })
    }
    return ppl
  }, [session, liveAirline, compares, myByDate, compareByDate, year, month, shareStatus, t])

  const closeOverlays = useCallback(() => {
    setDetailOpen(false); setSearchOpen(false); setUploadOpen(false)
    setMenuOpen(false); setManageOpen(false); setMemberSheet(null); setInviteOpen(false)
    setWizardOpen(false)
  }, [])

  // 약속 잡기 — open the full-screen wizard (closes any open sheet first so it
  // never stacks; decision #7). `preday` pre-fills the date when opened from a day.
  const openWizard = (preday?: { y: number; m: number; d: number } | null) => {
    const day = preday && typeof preday === 'object' && 'd' in preday ? preday : null
    closeOverlays(); setWizardPreday(day); setWizardOpen(true)
  }

  async function refreshAppts(y: number, m: number) {
    if (!session) return
    if (session.isDemo) { setAppts(getMonthAppointments(session.uid, y, m)); return }
    setApptsLoading(true)
    try { setAppts(await getRemoteMonthAppointments(y, m)) }
    catch { /* leave current */ }
    finally { setApptsLoading(false) }
  }

  async function handleApptComplete(appt: Omit<Appointment, 'id'>, message: string) {
    if (!session) return
    setWizardOpen(false)
    try {
      if (session.isDemo) addAppointment(appt)
      else await createRemoteAppointment(appt)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('toast.apptSaveFailed'), 'danger')
      return
    }
    const ay = Number(appt.date.slice(0, 4)), am = Number(appt.date.slice(5, 7))
    // Jump to the appointment's month if it's elsewhere (the month effect reloads
    // appts); otherwise refresh in place.
    if (ay !== year || am !== month) { setYear(ay); setMonth(am) }
    else await refreshAppts(year, month)
    showToast(message, 'success')
  }

  async function handleApptDelete(id: string) {
    if (!session) return
    try {
      if (session.isDemo) deleteAppointment(id)
      else await deleteRemoteAppointment(id)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('toast.apptDeleteFailed'), 'danger')
      return
    }
    await refreshAppts(year, month)
  }

  // 받은 그룹 약속 초대 수락/거절(실계정만; 데모엔 초대 개념 없음).
  async function handleApptRespond(id: string, accept: boolean) {
    if (!session || session.isDemo) return
    try {
      await respondRemoteAppointment(id, accept)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('toast.apptRespondFailed'), 'danger')
      return
    }
    // 서버 반영은 성공 — 화면은 즉시 낙관 갱신한다. (이전엔 재조회에만 의존했는데,
    // 그 재조회가 조용히 실패하면 점선 카드가 그대로 남아 "나갔다 들어와야 반영"
    // 으로 보였다.) 재조회는 best-effort 동기화로 강등.
    const st = accept ? ('accepted' as const) : ('declined' as const)
    setAppts(list => list.map(a => a.id === id
      ? { ...a, myStatus: st, participantStatuses: { ...a.participantStatuses, [session.uid]: st } }
      : a))
    // 부팅 effect의 초대 재조회(월 이동마다)가 늦게 도착해 응답한 초대를 배너에
    // 되살리는 레이스 방지 — 응답 이력은 ref로 들고 도착분을 거른다.
    respondedApptIds.current.add(id)
    setApptInvites(list => list.filter(i => i.id !== id))
    showToast(accept ? t('toast.apptAccepted') : t('toast.apptDeclined'), accept ? 'success' : 'default')
    refreshAppts(year, month)
  }

  // 푸시 너지 노출 판정 — 부팅과 무관. 한 번 닫으면(localStorage) 두 모드 공통으로
  // 다시 안 뜬다. iOS 사파리 탭은 설치 안내, 그 외 지원 기기는 즉시 구독 너지.
  useEffect(() => {
    if (!session || session.isDemo) return
    if (typeof window !== 'undefined' && localStorage.getItem('railink_push_nudge_dismissed') === '1') return
    let alive = true
    // 비동기 .then 안에서만 set — effect 내 동기 setState 캐스케이드 회피.
    getPushStatus().then(st => {
      if (!alive) return
      if (pushNeedsIosInstall()) { setPushNudge('install'); return }
      if (!isPushSupported() || st !== 'disabled') return
      if (Notification.permission !== 'default') return // 켰다 끈/거부한 사용자는 조르지 않음
      setPushNudge('enable')
    }).catch(() => {})
    return () => { alive = false }
  }, [session])

  // 수신 동의 프롬프트 노출 판정 — DB의 marketing_consent_at(응답 시각)이 진실
  // 출처. localStorage 가드는 답이 확인된 뒤의 재조회만 막는 캐시다(first_compare
  // 의 per-uid 가드와 같은 패턴). 다른 브라우저에서 이미 답했다면 첫 조회에서
  // answeredAt이 보이므로 다시 묻지 않는다.
  useEffect(() => {
    if (!session || session.isDemo) return
    const key = `railink_mkt_asked_${session.uid}`
    if (typeof window !== 'undefined' && localStorage.getItem(key)) return
    let alive = true
    getMarketingConsent().then(r => {
      if (!alive || !r) return
      if (r.answeredAt) { localStorage.setItem(key, '1'); return }
      setMktAsk(true)
    }).catch(() => {})
    return () => { alive = false }
  }, [session])

  // 시트의 두 버튼과 backdrop 닫기가 공유하는 응답 경로. 닫기 = 미동의(적극적
  // 동의가 아니면 false) — 단, 저장까지 성공해야 가드를 채워 다시 안 묻는다.
  // 저장 실패 시 가드를 비워 두면 다음 마운트에 자연 재시도된다.
  async function answerMarketing(consent: boolean) {
    if (!session || mktBusy) return
    setMktBusy(true)
    const res = await setMarketingConsent(consent)
    setMktBusy(false)
    setMktAsk(false)
    if (!res.ok) return
    localStorage.setItem(`railink_mkt_asked_${session.uid}`, '1')
    if (consent) showToast(t('toast.marketingThanks'), 'success')
  }

  // 직무 프롬프트 노출 판정 — personal && job_category IS NULL 일 때만. job엔 별도
  // "물어본 시각" 컬럼이 없어 답을 안 고르고 닫은 경우는 per-uid localStorage
  // 가드로만 막는다(같은 기기 재노출 방지). 직무를 실제로 고르면 서버 값이 차서
  // 모든 기기에서 다시 안 뜬다.
  useEffect(() => {
    // 항공 승무원(personal + airline)은 이미 직무가 식별돼 있으므로 묻지 않는다.
    if (!session || session.isDemo || session.profileType !== 'personal' || session.airline) return
    const key = `railink_job_asked_${session.uid}`
    if (typeof window !== 'undefined' && localStorage.getItem(key)) return
    let alive = true
    getJobCategory().then(r => {
      if (!alive || !r) return
      if (r.category) { localStorage.setItem(key, '1'); return }
      setJobAsk(true)
    }).catch(() => {})
    return () => { alive = false }
  }, [session])

  // 저장(직무 선택) 또는 닫기('나중에'·backdrop) 공유 경로. 닫기 = 미응답이라
  // 서버엔 안 쓰고 가드만 채워 다시 안 묻는다. 선택 시에만 서버 저장.
  async function answerJob(category: string | null) {
    if (!session || jobBusy) return
    if (category) {
      setJobBusy(true)
      const res = await setJobCategory(category, jobOther)
      setJobBusy(false)
      if (!res.ok) { showToast(res.message ?? t('toast.jobSaveFailed'), 'danger'); return }
      showToast(t('toast.jobThanks'), 'success')
    }
    setJobAsk(false)
    localStorage.setItem(`railink_job_asked_${session.uid}`, '1')
  }

  async function onPushNudgeEnable() {
    setPushNudge(null)
    const res = await enablePush()
    if (res.status === 'enabled') showToast(t('toast.pushEnabled'), 'success')
    else if (res.message) showToast(res.message, 'danger')
  }

  function dismissPushNudge() {
    if (typeof window !== 'undefined') localStorage.setItem('railink_push_nudge_dismissed', '1')
    setPushNudge(null)
  }

  // 약속 초대 배너 탭 → 가장 이른 초대의 날짜로 점프해 상세 시트를 연다.
  // (시트의 점선 약속 카드 탭 → 수락/거절 다이얼로그가 기존 흐름. 다른 달이면
  // year/month 변경이 월 effect를 깨워 그 달 약속을 로드한다 — 시트는 그동안
  // apptsLoading 표시.)
  function openFirstApptInvite() {
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    // 다가오는 초대 우선(리스트는 날짜 오름차순), 전부 지났으면 첫 항목으로.
    const first = apptInvites.find(i => i.date >= todayIso) ?? apptInvites[0]
    if (!first) return
    const y = Number(first.date.slice(0, 4)), m = Number(first.date.slice(5, 7)), d = Number(first.date.slice(8, 10))
    if (y !== year || m !== month) { setYear(y); setMonth(m) }
    setSelectedDate(new Date(y, m - 1, d))
    closeOverlays()
    setDetailOpen(true)
  }

  const openInvite = (prefillEmail?: string | null) => {
    // Coerce: openInvite is also used directly as an onClick handler (MenuSheet),
    // which would pass a click event here — only a real string should pre-fill.
    const email = typeof prefillEmail === 'string' ? prefillEmail : null
    closeOverlays(); setInvitePrefillEmail(email); setInviteOpen(true)
  }

  function dismissHint() {
    if (session && typeof window !== 'undefined') {
      localStorage.setItem(`railink_hint_dismissed_${session.uid}`, '1')
    }
    setHintDismissed(true)
  }

  function dismissBdayNudge() {
    if (session && typeof window !== 'undefined') {
      localStorage.setItem(`railink_bday_nudge_${session.uid}`, '1')
    }
    setBdayNudgeDismissed(true)
  }

  const openSearch = () => { closeOverlays(); setSearchQuery(''); setSearchOpen(true); refreshShareStatus() }

  function refreshShareStatus() {
    if (session && !session.isDemo) myViewerShareStatuses().then(setShareStatus).catch(() => {})
  }

  const lookupSabun = useCallback((employeeId: string) => findProfileByEmployeeId(employeeId), [])
  const lookupEmail = useCallback((email: string) => findProfileByEmail(email), [])
  const openUpload = () => { closeOverlays(); setUploadStep('pick'); setUploadOpen(true) }
  const openManualEdit = () => { closeOverlays(); setUploadStep('manual'); setUploadOpen(true) }

  // codebook("코드 관리")에서 "입력으로 돌아가기"로 복귀하면(?reopen=upload)
  // 직접입력을 다시 연다 — 캘린더로 나갔다 수동 재진입하는 흐름 제거.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('reopen') === 'upload') {
      setUploadStep('manual')
      setUploadOpen(true)
      router.replace('/calendar') // 쿼리 정리는 라우터로 (history API 직접 조작 대신)
    }
  }, [router])
  const openManage = (startCreate = false) => {
    closeOverlays(); setManageStartCreate(startCreate); setManageOpen(true)
  }

  // Active-group switch — read-side only; close the detail sheet so it can't show
  // a stale group's timeline.
  function switchGroup(id: string) {
    if (!session || id === groupsState.activeGroupId) return
    setGroupsState(setActiveGroup(session.uid, id))
    setDetailOpen(false)
  }

  function handleCreateGroup(): string | null {
    if (!session) return null
    const res = createGroup(session.uid)
    if (!res) return null
    setGroupsState({ ...res.state })
    return res.id
  }

  function handleRenameGroup(id: string, name: string): 'duplicate' | null {
    if (!session) return null
    const res = renameGroup(session.uid, id, name)
    setGroupsState({ ...res.state })
    return res.error === 'duplicate' ? 'duplicate' : null
  }

  function handleDeleteGroup(id: string) {
    if (!session) return
    const next = deleteGroup(session.uid, id)
    setGroupsState({ ...next })
    setDetailOpen(false)
  }

  function handleReorderGroups(orderedIds: string[]) {
    if (!session) return
    setGroupsState({ ...reorderGroups(session.uid, orderedIds) })
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth() + 1) }

  // Add/remove a colleague from the active compare group.
  // For real accounts the group IS the share-intent surface: adding fires a
  // share request when needed, removing from the last group cancels it.
  async function toggleCompare(uid: string, fallbackMeta?: Colleague) {
    if (!session) return
    const existing = compares.find(c => c.uid === uid)

    if (existing) {
      const next = removeFromActiveGroup(session.uid, uid)
      setReload(n => n + 1)
      showToast(t('toast.compareRemoved', { name: existing.name }))

      if (session.isDemo) return
      // Only cancel if the colleague is gone from EVERY group — multi-group
      // membership shouldn't silently nuke the share for the other tab.
      const stillInAnyGroup = allMemberUids(next).includes(uid)
      const status = shareStatus[uid]
      if (!stillInAnyGroup && (status === 'pending' || status === 'accepted')) {
        setShareStatus(s => { const n = { ...s }; delete n[uid]; return n })
        cancelShare(uid).catch(() => { /* fail-quiet; reconciler picks it up next mount */ })
      }
      return
    }

    // Private (사번-only) accounts aren't in the directory list, so fall back to
    // the profile the search row passed in.
    const meta = findColleagueInDirectory(uid, colleagues) ?? fallbackMeta
    if (!meta) return
    const res = addToActiveGroup(session.uid, {
      uid, name: meta.name, employeeId: meta.employeeId, photo: meta.photo, office: meta.office,
    })
    if (!res.entry && !res.alreadyIn) {
      showToast(t('toast.compareCap', { max: MAX_PER_GROUP }), 'danger')
      return
    }
    setReload(n => n + 1)
    if (res.alreadyIn) return
    // Newly added → the reload effect is now fetching their month schedule.
    // Show the inline "불러오는 중" bar (④) without covering my calendar; it
    // clears when the loader finishes (setLoadingColleague(null) in the effect).
    setLoadingColleague(meta.name)

    if (session.isDemo) {
      showToast(t('toast.addedToGroup', { name: meta.name, group: res.group.name }), 'success')
      return
    }

    const status = shareStatus[uid]
    if (status === 'accepted') {
      showToast(t('toast.addedToGroup', { name: meta.name, group: res.group.name }), 'success')
      return
    }
    if (status === 'pending') {
      showToast(t('toast.addedPending', { name: meta.name }), 'success')
      return
    }

    // none / revoked → send a share request in the background.
    // On failure roll the group membership back so groups ≡ share intent stays true.
    setShareStatus(s => ({ ...s, [uid]: 'pending' }))
    const r = await requestShare(uid)
    if (!r.ok) {
      removeFromActiveGroup(session.uid, uid)
      setShareStatus(s => { const n = { ...s }; delete n[uid]; return n })
      setReload(n => n + 1)
      showToast(r.message, 'danger')
      return
    }
    // Re-assert: the setReload above re-fires the mount effect which fetches
    // shareStatus from the server. If that fetch returned BEFORE this RPC
    // committed (likely — same-tick race), it would have nulled the optimistic
    // pending. Re-set it after the RPC actually succeeded.
    setShareStatus(s => ({ ...s, [uid]: 'pending' }))
    track('share_request')
    showToast(t('toast.shareRequested', { name: meta.name }), 'success')
  }

  async function handleUploadSave(rows: ParsedScheduleRow[]) {
    if (!session) throw new Error(t('errors.notLoggedIn'))
    // 일반 personal 계정은 KTX 다이/열번 개념이 없어 저장 시 그 필드를 지운다(단일
    // 저장 길목 보장). 단 활성 항공사 승무원(personal + active airline)은 편명·코드가
    // 유의미하므로 제외 — 안 그러면 YP 편명이 저장 직전에 날아간다. 준비중 항공사는
    // 파서가 없어 일반과 동일하게 strip(liveAirline 기준).
    const normalized = session.profileType === 'personal' && !liveAirline
      ? rows.map(row => (row.isOff ? row : { ...row, diaNr: undefined, trainNr: undefined }))
      : rows
    const entries = normalized.map(row => ({ ...row, uid: session.uid }))
    if (!session.isDemo) {
      await replaceRemoteUserScheduleMonths(session.uid, entries)
    }
    replaceUserScheduleMonths(session.uid, entries)
    const first = entries[0]?.date
    const savedYear = first ? Number(first.slice(0, 4)) : year
    const savedMonth = first ? Number(first.slice(5, 7)) : month
    if (first) {
      setYear(savedYear)
      setMonth(savedMonth)
    }
    setUploadOpen(false); setUploadStep('pick')
    setMySched(getMonthSchedules(session.uid, savedYear, savedMonth))
    track('schedule_create', { demo: session.isDemo ? 'yes' : 'no' })
    showToast(t('toast.uploadDone', { count: entries.length }), 'success')
    // 변형 ② 권유 — 업로드할 때마다 띄움(캡 없음). 연결된 친구 수로 카피만 분기.
    showNudge(compares.length === 0 ? 'upload_empty' : 'upload_has_friends')
  }

  async function handleLogout() {
    setMenuOpen(false)
    disableRemoteGroupSync() // 대기 중 그룹 push 폐기 — 다음 계정으로 새지 않게
    try {
      await logout()
    } catch {
      // signOut already best-effort-cleared storage; navigate anyway.
    }
    // Hard navigation rather than router.replace — defeats any in-memory
    // session state the supabase client (or the prefetched /login bundle)
    // might still be holding, which was causing the "/login → /calendar
    // 튕겨나옴" bounce-back even after signOut cleared localStorage.
    if (typeof window !== 'undefined') {
      window.location.replace('/login')
    }
  }

  // Cold-boot loading visuals are delay-gated: a fast resolve (session/data
  // already warm) shows a neutral surface for a beat, never flashing a loader.
  // Only a genuinely slow resolve reveals the splash (①) / skeleton (⑤).
  const showBoot = useDelayedFlag(!session, 200)
  const showSkeleton = useDelayedFlag(!!session && booting, 150)
  // 세션 해석이 비정상적으로 오래(>4s) 걸리면(락 교착·proxy 콜드스타트) BootSplash에
  // 무한히 묶이는 대신, 재방문 사용자에겐 저장된 신원으로 캘린더 스켈레톤을 띄워
  // 탈출구를 준다. 정상(빠른) 부팅은 이 분기에 닿기 전 session이 채워져 영향이 없다.
  // 토큰이 만료/무효라 위 로더의 getCurrentSession이 끝내 null을 내면 그쪽에서 /login으로 보낸다.
  const bootStuck = useDelayedFlag(!session, 4000)
  if (!session) {
    if (bootStuck && likelyAuthed) {
      return <CalendarSkeleton name={bootIdentity?.name ?? ''} photo={bootIdentity?.photo} year={year} month={month} />
    }
    return showBoot ? <BootSplash /> : <div className="min-h-[100dvh] bg-surface" />
  }
  // Cold boot only: nothing has rendered yet, so the full skeleton (⑤) is right.
  // A cache-less month navigation also flips `booting`, but there the chrome is
  // already loaded — we fall through and skeleton only the grid (below).
  if (booting && !bootedOnce.current) {
    return showSkeleton
      ? <CalendarSkeleton name={session.name} photo={session.photo} year={year} month={month} />
      : <div className="min-h-[100dvh] bg-surface" />
  }

  // overlayOpen 은 first_compare 가드 effect와 공유하려고 early-return 위에서 선언했다.
  const compareColorOf = (c: CompareEntry) => cssColor(c.color)
  const hasGroups = groupsState.groups.length > 0
  const atCompareCap = compares.length >= MAX_PER_GROUP
  const isEmptyGroup = hasGroups && compares.length === 0

  return (
    <div className="relative flex flex-col min-h-[100dvh] bg-bg">
      {/* ── Top bar ── */}
      <header
        className="border-b border-line sticky top-0 z-topbar"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'saturate(180%) blur(14px)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="h-topbar flex items-center gap-2 px-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-7 h-7 grid place-items-center text-brand shrink-0">
              <BrandMark size={22} />
            </span>
            <span className="font-en text-subtitle font-[400] tracking-tight text-ink-900">RaiLink</span>
          </div>
          <button
            onClick={openSearch}
            aria-label={t('header.searchAria')}
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 hover:bg-bg transition-colors"
          >
            <SearchIcon size={20} />
          </button>
          <button
            onClick={() => { closeOverlays(); setMenuOpen(true) }}
            aria-label={pendingCount > 0 ? t('header.menuAriaPending', { count: pendingCount }) : t('header.menuAria')}
            className="w-10 grid place-items-center"
          >
            <span className="relative">
              <Avatar name={session.name} photo={session.photo} size="default" color="brand" />
              {pendingCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand border-2 border-white"
                  aria-hidden="true"
                />
              )}
            </span>
          </button>
        </div>
      </header>

      {/* ── Compare-group tab zone + strip ── */}
      <section className="bg-surface border-b border-line pb-3.5">
        {hasGroups ? (
          <GroupTabs
            groups={groupsState.groups}
            activeGroupId={groupsState.activeGroupId}
            activeGroupName={activeGroup?.name ?? ''}
            onSelect={switchGroup}
            onAddGroup={() => openManage(true)}
            onManage={() => openManage(false)}
            onReorder={handleReorderGroups}
            showToast={showToast}
          />
        ) : (
          <div className="flex items-center justify-between px-4 pt-3 mb-2">
            <span className="text-[11px] font-bold text-ink-500 tracking-wider uppercase">
              {t('compare.sectionLabel')}
            </span>
            <span className="font-en text-[11px] font-semibold text-ink-500">{t('compare.countSuffix', { count: compares.length })}</span>
          </div>
        )}

        <div className="flex gap-2.5 overflow-x-auto px-4 pt-1 pb-1 items-start" style={{ scrollbarWidth: 'none' }}>
          <PersonPill name={session.name} photo={session.photo} ringColor={BRAND} avatarColor="brand" self />

          {isEmptyGroup ? null : (
            compares.map(c => {
              const pending = !session.isDemo && shareStatus[c.uid] === 'pending'
              return (
                <button
                  key={c.uid}
                  onClick={() => { closeOverlays(); setMemberSheet(c) }}
                  aria-label={t('compare.profileAria', { name: c.name })}
                >
                  <PersonPill
                    name={c.name}
                    photo={c.photo}
                    ringColor={compareColorOf(c)}
                    avatarColor={c.color}
                    pending={pending}
                    editable={!pending}
                  />
                </button>
              )
            })
          )}

          <button
            onClick={() => atCompareCap
              ? showToast(t('toast.compareCap', { max: MAX_PER_GROUP }), 'danger')
              : openSearch()}
            className={`shrink-0 flex flex-col items-center gap-1.5 w-14 ${atCompareCap ? 'opacity-40' : ''}`}
            aria-label={t('compare.addAria')}
          >
            <span className="w-12 h-12 rounded-full bg-brand-050 text-brand grid place-items-center shadow-[inset_0_0_0_1.5px_var(--brand-100)]">
              <PlusIcon size={20} />
            </span>
            <span className="text-[11px] font-semibold text-brand">{t('compare.add')}</span>
          </button>
        </div>

        {/* Empty compare group → invite-first CTA (P0): a 0-colleague calendar is
            a dead end, so lead with 초대 (the viral move), 동료 찾기 as a fallback.
            shareSynced 게이트(1회성): 새 기기/시크릿 첫 부팅은 auto-grouping이 서버
            share로 그룹을 복원하기 전이라, 게이트 없이는 빈 CTA가 먼저 번쩍인다.
            (colleagueLoading은 월 이동마다 true로 돌아와 CTA가 깜빡여서 못 쓴다.) */}
        {shareSynced && compares.length === 0 && !(nudgeOpen && nudgeTrigger === 'upload_empty') && (
          <div className="mx-4 mt-1 flex flex-col items-center text-center gap-1 rounded-lg bg-brand-050 border border-brand-100 px-5 py-5">
            <p className="text-callout font-bold text-ink-900">{t('empty.title')}</p>
            <p className="text-caption text-ink-500 leading-relaxed">
              {t.rich('empty.body', { br: () => <br /> })}
            </p>
            <button
              onClick={() => openInvite()}
              className="mt-3 w-full max-w-[260px] h-btn rounded-sm bg-brand text-ink-on-brand font-semibold text-callout inline-flex items-center justify-center gap-2"
            >
              <UserPlusIcon size={17} /> {t('empty.invite')}
            </button>
            <button onClick={openSearch} className="mt-1.5 text-caption font-semibold text-brand py-1">
              {t('empty.findColleague')}
            </button>
          </div>
        )}
      </section>

      {/* ── Inbox banner (§5): pending requests where I'm the owner ── */}
      {pendingCount > 0 && (
        <button
          onClick={() => router.push('/settings/info?focus=shares')}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-brand-050 border-b border-line text-left"
        >
          <span className="flex-1 text-caption font-semibold text-ink-700">
            {t.rich('banner.shareRequests', { count: pendingCount, n: (c) => <span className="font-en">{c}</span> })}
          </span>
          <span className="text-brand shrink-0"><ArrowRightIcon size={16} /></span>
        </button>
      )}

      {/* ── 약속 초대 배너: 초대가 어느 달에 있든 발견되도록 (날짜 핀만으로는
          그 달로 넘겨야만 보인다). 탭 → 해당 날짜로 점프 + 상세 시트 오픈. ── */}
      {apptInvites.length > 0 && (
        <button
          onClick={openFirstApptInvite}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-brand-050 border-b border-line text-left"
        >
          <span className="text-brand shrink-0"><PinIcon size={14} /></span>
          <span className="flex-1 text-caption font-semibold text-ink-700">
            {t.rich('banner.apptInvites', { count: apptInvites.length, n: (c) => <span className="font-en">{c}</span> })}
          </span>
          <span className="text-brand shrink-0"><ArrowRightIcon size={16} /></span>
        </button>
      )}

      {/* ── Push nudge ── 1회성. enable=탭 즉시 구독 / install=iOS 설치 안내(/install). */}
      {pushNudge && (
        <div className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-line">
          <span className="shrink-0 text-brand"><BellIcon size={16} /></span>
          {pushNudge === 'enable' ? (
            <button onClick={onPushNudgeEnable} className="flex-1 text-caption font-semibold text-ink-700 text-left">
              {t.rich('banner.pushEnable', { a: (c) => <span className="text-brand">{c}</span> })}
            </button>
          ) : (
            <button onClick={() => { dismissPushNudge(); router.push('/install') }} className="flex-1 text-caption font-semibold text-ink-700 text-left">
              {t.rich('banner.pushInstall', { a: (c) => <span className="text-brand">{c}</span> })}
            </button>
          )}
          <button
            onClick={dismissPushNudge}
            aria-label={t('banner.pushDismissAria')}
            className="shrink-0 text-ink-300 hover:text-ink-500 p-1"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* ── Birthday nudge ── one-time, dismissible. Shown to real accounts who
          are comparing someone but haven't set their own birthday yet. */}
      {!session.isDemo && compares.length > 0 && myBirthday === null && !bdayNudgeDismissed && (
        <div className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-line">
          <span className="shrink-0" style={{ color: '#E8669B' }}><CakeIcon size={16} /></span>
          <button
            onClick={() => router.push('/settings/info?focus=birthday')}
            className="flex-1 text-caption font-semibold text-ink-700 text-left"
          >
            {t('banner.birthday')}
          </button>
          <button
            onClick={dismissBdayNudge}
            aria-label={t('banner.birthdayDismissAria')}
            className="shrink-0 text-ink-300 hover:text-ink-500 p-1"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* ── Month bar ── */}
      <div className="bg-surface flex flex-col">
        <div className="flex items-center justify-between h-topbar px-4">
          <button
            onClick={prevMonth}
            aria-label={t('month.prevAria')}
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 hover:bg-bg transition-colors"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <div className="flex flex-col items-center gap-1">
            <span className="font-kr text-title font-bold tracking-tight text-ink-900">
              {t('month.label', { year, month })}
            </span>
            {!isCurrentMonth && (
              <button
                onClick={goToday}
                className="font-kr text-[10px] font-semibold tracking-wide text-brand bg-brand-050 px-2 py-0.5 rounded-pill leading-none"
              >
                {t('month.today')}
              </button>
            )}
          </div>
          <button
            onClick={nextMonth}
            aria-label={t('month.nextAria')}
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 hover:bg-bg transition-colors"
          >
            <ChevronRightIcon size={20} />
          </button>
        </div>

        {/* DOW row */}
        <div className="grid grid-cols-7 border-b-2 border-divider">
          {DOW_KR.map((d, i) => (
            <div
              key={d}
              className={`text-center font-kr text-[13px] font-bold py-1 ${
                i === 0 ? 'text-danger' : i === 6 ? 'text-c1' : 'text-ink-700'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid — cache-less month navigation shows a grid-only skeleton (keeps the
            already-loaded chrome/chips fixed). The sub-150ms window before
            `showSkeleton` arms renders the real empty grid (date numbers, no bars),
            which has identical cell height (h-14) so neither path jumps. */}
        {booting && showSkeleton ? (
          <CalendarGridSkeleton year={year} month={month} />
        ) : (
        <div className="flex flex-col gap-px bg-bg">
          {weeks.map((wk, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-px">
              {wk.map((c, ci) => (
                <button
                  key={ci}
                  disabled={c.isOther}
                  onClick={() => {
                    if (c.isOther || !c.iso) return
                    setSelectedDate(new Date(year, month - 1, c.d))
                    closeOverlays()
                    setDetailOpen(true)
                  }}
                  className={c.isOther ? 'cursor-default' : 'cursor-pointer'}
                >
                  <CalCell
                    d={c.d}
                    isOther={c.isOther}
                    today={!c.isOther && c.d === todayD}
                    selected={
                      !c.isOther && !!selectedDate &&
                      selectedDate.getFullYear() === year &&
                      selectedDate.getMonth() === month - 1 && selectedDate.getDate() === c.d
                    }
                    bars={c.iso ? barsByIso.get(c.iso) ?? [] : []}
                    dow={ci}
                    holiday={holidayNameFor(c.iso)}
                    isPast={!!c.iso && c.iso < todayIso}
                    hasBirthday={!c.isOther && birthdaysByDay.has(c.d)}
                    hasAppointment={!c.isOther && apptDays.has(c.d)}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
        )}
      </div>

      {/* ── Footer ── 근무표 유무 양쪽 모두 한 줄 인라인. 없을 땐 등록 진입점, 있을 땐 카운터. */}
      {/* FAB(56px, bottom 36px)가 이 영역 위에 떠 있어 범례를 가렸음 — FAB가 뜨는
          경우(hasMySchedule)에만 하단 여백을 확보해 범례가 FAB 위로 올라오게 한다. */}
      <div
        className="px-4 pt-3 text-caption text-ink-500"
        style={{ paddingBottom: hasMySchedule ? 'calc(108px + env(safe-area-inset-bottom))' : '24px' }}
      >
        {hasMySchedule ? (
          <div className="bg-bg px-3.5 py-2.5 rounded-md">
            <div className="flex items-center gap-2">
              <span className="text-brand shrink-0"><UploadIcon size={14} /></span>
              <span>
                {t.rich('footer.summary', {
                  workDays,
                  offDays,
                  compareCount: compares.length,
                  strong: (c) => <strong className="font-en text-ink-700">{c}</strong>,
                })}
              </span>
            </div>
            <div className="border-t border-line my-2.5" />
            <CalendarLegend />
          </div>
        ) : (
          <button
            onClick={openUpload}
            className="w-full flex items-center gap-2 bg-brand-050 px-3.5 py-2.5 rounded-md text-left"
          >
            <span className="text-brand shrink-0"><UploadIcon size={14} /></span>
            <span className="flex-1 text-ink-700 font-semibold">{t('footer.noSchedule')}</span>
            <span className="text-brand font-semibold shrink-0">{t('footer.register')}</span>
          </button>
        )}
      </div>

      <div className="flex-1" />

      {/* ── ④ 동료 불러오기 인라인 바 ── 추가한 동료 일정을 페치하는 동안만.
          전체화면 가림 없이 내 캘린더 유지. FAB와 겹치지 않게 FAB는 잠시 숨김. */}
      {loadingColleague && !overlayOpen && (
        <div
          className="absolute left-4 right-4 z-fab flex items-center gap-2.5 bg-surface border border-line rounded-md px-3.5 py-3 shadow-[0_8px_24px_rgba(13,30,55,0.12)]"
          style={{ bottom: 'calc(30px + env(safe-area-inset-bottom))' }}
        >
          <Spinner size={20} color="var(--c1)" />
          <div className="text-[13px] font-medium text-ink-700">
            {t.rich('loading.colleague', { name: loadingColleague, strong: (c) => <strong className="text-ink-900">{c}</strong> })}
          </div>
        </div>
      )}

      {/* ── 동료 근무표 첫 로드 인라인 바 ── 캐시가 전혀 없는 달에서만, 원격
          fetch가 끝날 때까지. 내 근무만 먼저 보이는 갭이 "동료가 일정을 안
          올렸다"로 읽히지 않게 한다. 부팅 스켈레톤(⑤)이 떠 있으면 그쪽이
          이미 로딩을 말하므로 생략. */}
      {colsSyncing && !booting && !loadingColleague && !overlayOpen && (
        <div
          className="absolute left-4 right-4 z-fab flex items-center gap-2.5 bg-surface border border-line rounded-md px-3.5 py-3 shadow-[0_8px_24px_rgba(13,30,55,0.12)]"
          style={{ bottom: 'calc(30px + env(safe-area-inset-bottom))' }}
        >
          <Spinner size={20} color="var(--c1)" />
          <div className="text-[13px] font-medium text-ink-700">{t('loading.colleagues')}</div>
        </div>
      )}

      {/* ── FAB speed-dial ── 일정 추가 / 근무표 등록 통합 진입점(결정 #5). 데모·
          실계정 모두 노출(백엔드 연동 완료). 오버레이·동료 로딩 중엔 숨김. */}
      {!overlayOpen && !loadingColleague && !(colsSyncing && !booting) && (
        <FabSpeedDial onAppointment={openWizard} onUpload={openUpload} />
      )}

      {/* ── Personal first-entry hint (non-blocking, dismissible) ── */}
      {!overlayOpen && session.profileType === 'personal' && !hasMySchedule && !hintDismissed && (
        <PersonalHintCard
          ownerName={compares[0]?.name}
          onRegister={() => { dismissHint(); openUpload() }}
          onDismiss={dismissHint}
        />
      )}

      {/* ── Date detail ── */}
      <BottomSheet open={detailOpen} onClose={() => setDetailOpen(false)}>
        {selectedDate && (
          <DetailSheet
            date={selectedDate}
            year={year}
            month={month}
            today={today}
            people={monthPeople}
            birthdaysByDay={birthdaysByDay}
            appointments={apptCards}
            apptsLoading={apptsLoading}
            selfUid={session.uid}
            airline={liveAirline}
            onDeleteAppt={handleApptDelete}
            onRespond={handleApptRespond}
            onClose={() => setDetailOpen(false)}
            onAddCompare={openSearch}
            onEdit={openManualEdit}
          />
        )}
      </BottomSheet>

      {/* ── Menu ── */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <MenuSheet
          session={session}
          compareCount={compares.length}
          hasPending={pendingCount > 0}
          onManageSchedule={openUpload}
          onInvite={openInvite}
          onLogout={handleLogout}
        />
      </BottomSheet>

      {/* ── 초대 권유 시트(노출·거절 계측) ── */}
      <BottomSheet open={nudgeOpen} onClose={closeNudge}>
        {nudgeTrigger && (
          <InvitePromptSheet
            trigger={nudgeTrigger}
            onClose={closeNudge}
            onCreate={handleNudgeCreate}
          />
        )}
      </BottomSheet>

      {/* ── 친구 초대 ── */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <InviteCreateSheet
          groups={groupsState.groups}
          activeGroupId={groupsState.activeGroupId}
          onClose={() => setInviteOpen(false)}
          showToast={showToast}
          inviterName={session.name}
          initialEmail={invitePrefillEmail}
        />
      </BottomSheet>

      {/* ── 수신 동의 1회 프롬프트 ── */}
      <BottomSheet open={mktAsk} onClose={() => answerMarketing(false)}>
        <div className="px-5 pt-2 pb-8">
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('marketingSheet.title')}</h3>
          <p className="mt-2 text-callout text-ink-700 leading-relaxed">
            {t('marketingSheet.body')}
          </p>
          <div className="flex gap-2.5 mt-4">
            <Button variant="outline" className="flex-1" disabled={mktBusy} onClick={() => answerMarketing(false)}>
              {t('marketingSheet.decline')}
            </Button>
            <Button className="flex-1" disabled={mktBusy} onClick={() => answerMarketing(true)}>
              {t('marketingSheet.accept')}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* 직무 1회 프롬프트 — 마케팅 시트가 떠 있으면 그게 먼저(한 번에 하나만).
          가입 폼을 안 거친 personal 계정(주로 Google 가입)의 직무를 백필한다. */}
      <BottomSheet open={jobAsk && !mktAsk} onClose={() => answerJob(null)}>
        <div className="px-5 pt-2 pb-8">
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('jobSheet.title')}</h3>
          <p className="mt-2 text-callout text-ink-700 leading-relaxed">
            {t('jobSheet.body')}
          </p>
          <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label={t('jobSheet.ariaLabel')}>
            {JOB_OPTIONS.map(opt => {
              const active = jobSel === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setJobSel(active ? null : opt.value)}
                  className={`px-3.5 py-2 rounded-pill border-2 text-[14px] font-bold transition-colors ${
                    active ? 'border-brand bg-brand-050 text-brand' : 'border-line bg-surface text-ink-700'
                  }`}
                >
                  {tFields('job.' + opt.value)}
                </button>
              )
            })}
          </div>
          {jobSel === 'other' && (
            <input
              value={jobOther}
              onChange={e => setJobOther(e.target.value)}
              placeholder={t('jobSheet.otherPlaceholder')}
              className="w-full mt-3 px-3.5 h-12 rounded-sm border-2 border-line bg-surface font-kr text-body placeholder:text-ink-500 focus:outline-none focus:border-brand"
            />
          )}
          <div className="flex gap-2.5 mt-5">
            <Button variant="outline" className="flex-1" disabled={jobBusy} onClick={() => answerJob(null)}>
              {t('jobSheet.later')}
            </Button>
            <Button
              className="flex-1"
              disabled={jobBusy || !jobSel || (jobSel === 'other' && !jobOther.trim())}
              onClick={() => answerJob(jobSel)}
            >
              {t('jobSheet.submit')}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* ── Compare-member mini profile ── */}
      <BottomSheet open={!!memberSheet} onClose={() => setMemberSheet(null)}>
        {memberSheet && (
          <CompareMemberSheet
            member={memberSheet}
            pending={!session.isDemo && shareStatus[memberSheet.uid] === 'pending'}
            isDemo={session.isDemo}
            usedBy={compares.reduce((acc, c) => {
              if (c.uid !== memberSheet.uid && !(c.color in acc)) acc[c.color] = c.name
              return acc
            }, {} as Partial<Record<CompareColor, string>>)}
            onClose={() => setMemberSheet(null)}
            onRemove={() => {
              const m = memberSheet
              setMemberSheet(null)
              toggleCompare(m.uid)
            }}
            onChangeColor={color => {
              const owner = setMemberColor(session.uid, memberSheet.uid, color)
              setColorOverrides(owner)
              // Reflect on the open sheet so the swatch check moves immediately.
              setMemberSheet(s => s ? { ...s, color } : s)
            }}
          />
        )}
      </BottomSheet>

      {/* ── Search overlay ── */}
      {searchOpen && (
        <SearchOverlay
          query={searchQuery}
          setQuery={setSearchQuery}
          colleagues={colleagues}
          loading={colleagueLoading}
          comparedUids={new Set(compares.map(c => c.uid))}
          activeGroupName={hasGroups ? activeGroup?.name ?? null : null}
          onOpenManage={() => openManage(false)}
          onClose={() => setSearchOpen(false)}
          onToggle={toggleCompare}
          shareGated={!session.isDemo}
          shareStatus={shareStatus}
          lookupSabun={lookupSabun}
          lookupEmail={lookupEmail}
          onInvite={openInvite}
        />
      )}

      {/* ── Manage groups ── */}
      <BottomSheet open={manageOpen} onClose={() => setManageOpen(false)}>
        <ManageGroupsSheet
          groups={groupsState.groups}
          startCreate={manageStartCreate}
          onClose={() => setManageOpen(false)}
          onRename={handleRenameGroup}
          onDelete={handleDeleteGroup}
          onCreate={handleCreateGroup}
          showToast={showToast}
        />
      </BottomSheet>

      {/* ── Upload modal ── */}
      {uploadOpen && (
        <UploadModal
          step={uploadStep}
          defaultYear={year}
          defaultMonth={month}
          userName={session.isDemo ? undefined : session.name}
          userId={session.uid}
          isPersonal={session.profileType === 'personal'}
          airline={liveAirline}
          initialRows={mySched.map(e => ({
            date: e.date, isOff: e.isOff,
            diaNr: e.diaNr, trainNr: e.trainNr,
            startTime: e.startTime, endTime: e.endTime,
          }))}
          onPreview={() => setUploadStep('preview')}
          onManual={() => setUploadStep('manual')}
          onBack={() => setUploadStep('pick')}
          onClose={() => { setUploadOpen(false); setUploadStep('pick') }}
          onSave={handleUploadSave}
        />
      )}

      {/* ── Migration notice (§6): one-time, dismissal persists ── */}
      <BottomSheet open={migrationOpen} onClose={dismissMigration}>
        <div className="px-5 pt-2 pb-8">
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('migration.title')}</h3>
          <p className="mt-2 text-callout text-ink-700 leading-relaxed">
            {t('migration.body')}
          </p>
          <div className="mt-4">
            <Button block onClick={() => { dismissMigration(); openSearch() }}>
              {t('migration.action')}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* ── 약속 잡기 위저드 (전체화면) ── */}
      {wizardOpen && (
        <AppointmentWizard
          selfUid={session.uid}
          selfName={session.name}
          selfPhoto={session.photo}
          compares={compares}
          preday={wizardPreday}
          year={year}
          month={month}
          today={today}
          entryOf={entryOf}
          onClose={() => setWizardOpen(false)}
          onComplete={handleApptComplete}
        />
      )}
    </div>
  )
}

/* 표시 안내 — 셀의 각 표시가 무슨 뜻인지 한눈에. 비주얼은 실제 셀과 동일하게
 * 그려 매칭이 바로 되도록 한다. 핵심 혼동(연한 칩=근무 vs 취소선=휴무 vs
 * 그냥 숫자=일정 없음)을 분명히 구분. CalCell의 마커와 1:1 — 셀에 마커를
 * 추가하면 여기도 같이. 2열 그리드 고정: flex-wrap은 폭에 따라 줄바꿈이
 * 들쭉날쭉해 훑기 어렵다. */
function CalendarLegend() {
  const t = useTranslations('calendar.legend')
  return (
    <div>
      <p className="text-[11px] font-bold text-ink-700 mb-2">{t('title')}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12px] text-ink-700 leading-none">
        {/* 오늘 */}
        <LegendItem label={t('today')}>
          <span className="w-[18px] h-[18px] rounded-full bg-brand inline-block" />
        </LegendItem>
        {/* 공휴일 */}
        <LegendItem label={t('holiday')}>
          <span className="relative inline-grid place-items-center w-[18px] h-[18px]">
            <span className="absolute top-[1px] w-[9px] h-[2px] rounded-[1px] bg-danger" />
            <span className="font-en text-[12px] text-danger">1</span>
          </span>
        </LegendItem>
        {/* 근무 1명 — 그 사람 색 칩 */}
        <LegendItem label={t('workColor')}>
          <span
            className="font-en text-[12px] font-semibold px-[6px] py-[1px] rounded-pill leading-none"
            style={{ background: 'color-mix(in oklab, var(--brand) 16%, white)', color: 'var(--brand)' }}
          >
            1
          </span>
        </LegendItem>
        {/* 근무 2명+ — 색 점 */}
        <LegendItem label={t('multiWork')}>
          <span className="inline-flex items-center w-[18px] justify-center">
            {[BRAND, 'var(--c1)', 'var(--c2)'].map((c, i) => (
              <span
                key={i}
                className="w-[6px] h-[6px] rounded-full shadow-[0_0_0_1px_#fff]"
                style={{ background: c, marginLeft: i > 0 ? -2 : 0 }}
              />
            ))}
          </span>
        </LegendItem>
        {/* 휴무 — 취소선 */}
        <LegendItem label={t('off')}>
          <span className="font-en text-[12px] text-ink-500 line-through decoration-ink-300">1</span>
        </LegendItem>
        {/* 일정 없음 — 그냥 숫자 */}
        <LegendItem label={t('noSchedule')}>
          <span className="font-en text-[12px] text-ink-900">1</span>
        </LegendItem>
        {/* 약속 — 셀 좌상단 brand 핀 */}
        <LegendItem label={t('appointment')}>
          <span className="text-brand inline-grid place-items-center">
            <PinIcon size={12} />
          </span>
        </LegendItem>
        {/* 생일 — 셀 우상단 핑크 점 (비교 동료 생일) */}
        <LegendItem label={t('birthday')}>
          <span
            className="w-[7px] h-[7px] rounded-full inline-block"
            style={{ background: '#E8669B', boxShadow: '0 0 0 1.5px #fff' }}
          />
        </LegendItem>
      </div>
    </div>
  )
}

function LegendItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-grid place-items-center w-[18px] h-[18px] shrink-0">{children}</span>
      <span>{label}</span>
    </span>
  )
}

function PersonPill({ name, photo, ringColor, avatarColor, self, pending, editable }: {
  name: string
  photo?: string
  ringColor: string
  avatarColor: 'brand' | CompareColor
  self?: boolean
  pending?: boolean
  /** Colleague pill — show a small pencil badge (in the colleague's color) to
   *  hint the pill is tappable to recolor. */
  editable?: boolean
}) {
  const t = useTranslations('calendar.compare')
  return (
    <div className="shrink-0 flex flex-col items-center gap-1.5 w-14">
      <div
        className={`relative w-12 h-12 rounded-full bg-white grid place-items-center ${pending ? 'opacity-50' : ''}`}
        style={{ boxShadow: `inset 0 0 0 2px ${pending ? 'var(--line-2)' : ringColor}` }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className={`w-[42px] h-[42px] rounded-full object-cover ${pending ? 'grayscale' : ''}`} />
        ) : (
          <Avatar name={name} size="lg" className="!w-[42px] !h-[42px]" color={pending ? 'brand' : avatarColor} />
        )}
        {self && (
          <span className="absolute -right-1 -bottom-0.5 bg-brand text-ink-on-brand text-[9px] font-bold px-1.5 rounded-pill shadow-[0_0_0_2px_#fff]">
            {t('selfTag')}
          </span>
        )}
        {editable && !self && (
          <span
            className="absolute -right-[3px] -bottom-[3px] w-[18px] h-[18px] rounded-full grid place-items-center text-white shadow-[0_0_0_2px_#fff]"
            style={{ background: ringColor }}
          >
            <EditIcon size={9} />
          </span>
        )}
      </div>
      <span className={`text-[11px] font-semibold max-w-[56px] truncate text-center ${pending ? 'text-ink-500' : 'text-ink-900'}`}>
        {name}
      </span>
      {pending && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-pill bg-bg text-ink-500 leading-none -mt-1">
          {t('pendingBadge')}
        </span>
      )}
    </div>
  )
}

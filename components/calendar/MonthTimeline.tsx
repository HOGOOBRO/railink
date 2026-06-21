'use client'
/* Continuous month timeline: one column per person, a single vertical time axis
 * running across the whole month so an overnight (박차) shift is ONE card crossing
 * the midnight divider. The whole thing lives in ONE scroll area (both axes), and
 * the time gutter is sticky-left — so you can scroll down while panned right to
 * the colleagues on the far side.
 *
 * 약속 잡기 layer (handoff §11, final white-card skin): appointments render INSIDE
 * each participant's own column at their day+time position (never full-width
 * bands — that would cover other columns). Each is a WHITE card (brand left rail +
 * brand-100 inset + 2px white halo) so it separates cleanly from the pastel shift
 * card behind without muddy navy tints. Content adapts to the card height (=
 * duration) so short appointments never overflow. An appointment overlapping a
 * shift docks to the RIGHT (left edge 46%) so the shift's left-aligned identity is
 * never covered; the skin is identical in every column, only the lane width moves.
 * No × on the card — tapping it opens the detail/delete dialog (handled upstream). */
import { useEffect, useRef, useState } from 'react'
import { fmtClock } from '@/lib/schedule-utils'
import { toInitials } from '@/components/ui/Avatar'
import { PinIcon } from '@/components/ui/icons'
import type { AppointmentStatus } from '@/lib/types/schedule'

/** 하루치 비행 한 구간의 표시용 정보(아시아나 등 다중 레그). 상세 시트에서 레그별로
 *  편명·노선·출도착(현지+한국시간)을 보여준다. */
export interface LegView {
  flight?: string
  route?: string      // "ICN→NKG"
  depLabel?: string   // "ICN 12:30" 또는 "FRA 19:40 (한국시간 03:40)"
  arrLabel?: string
  dir?: '아웃바운드' | '인바운드'
}

export interface MonthShift {
  day: number        // 1-based day of month
  dia?: string
  trainNr?: string
  start: number      // decimal hour within `day`
  end: number        // decimal hour; > 24 when the shift ends next day (박차)
  noTime?: boolean   // a working day with no 출퇴근 times
  codeOnly?: boolean // noTime이지만 편명/노선 없는 '의도된 코드'(훈련 등) — 경고 대신 코드만
  standby?: boolean  // STBY(대기) — 시각 미상이라 하루종일 밴드로 그린다(start 0, end 24)
  // 밤샘 연속근무로 한쪽 시각만 있는 날. 'end'=전날 시작분이 이 날에서 끝남(시작=0 채움),
  // 'start'=이 날 시작했고 익일 계속됨(끝=24 채움). 표시에서 0/24 대신 안내 라벨로 바꾼다.
  cont?: 'start' | 'end'
  route?: string     // 편명→노선("ICN→HKG→ICN"). 항공사 노선표에서 유도(lib/airline-routes).
  // 국제선: 각 공항 현지시각 라벨("ICN 20:25"/"LAX 17:50 · 한국 09:50"). 카드/상세는 이걸
  // 표시하고 블록 위치·길이는 start/end(KST instant)로. 없으면(국내/KTX) start/end 그대로.
  depLabel?: string
  arrLabel?: string
  dir?: '아웃바운드' | '인바운드'   // 한국 출발/도착 방향
  fromAirport?: string
  toAirport?: string
  layover?: boolean   // 외국 체류 연속 블록(비행 사이). dia에 "LAX 체류".
  // 같은 트립(아웃바운드→체류→인바운드)에서 위/아래로 맞닿는 세그먼트.
  // true면 그쪽 모서리 radius를 0으로 해 붙여 그린다(하나의 근무처럼).
  connectTop?: boolean
  connectBottom?: boolean
  legs?: LegView[]    // 다중 레그(아시아나). 상세 시트에서 구간별 표시.
}

/** One appointment positioned in the timeline. start/end are decimal hours
 *  (untimed → a default 09:00 slot, flagged `untimed`). */
export interface ApptCard {
  id: string
  ownerUid: string
  participants: string[]
  participantStatuses?: Record<string, AppointmentStatus>  // uid → consent (remote)
  myStatus?: AppointmentStatus
  day: number
  title: string
  start: number
  end: number
  untimed: boolean
  hasEnd: boolean
  place?: string
  memo?: string
}

const NO_TIME_H = 54
export interface MonthPerson {
  uid: string
  color: string
  name: string
  tag?: string
  photo?: string
  shifts: MonthShift[]
  /** Share request still pending — render an empty column with a notice. */
  pending?: boolean
}

const PXH = 14              // pixels per hour
export const DAY_PX = 24 * PXH
const LABEL_W = 46
const LANE_GAP = 6
const MIN_COL = 116
const MIN_CARD_H = 80
const MIN_APPT_H = 22
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21]   // a time mark every 3 hours

interface Placed { a: ApptCard; top: number; height: number; pending: boolean }

/** Group time-overlapping placed appts into clusters (sorted by top). */
function clusterAppts(items: Placed[]): Placed[][] {
  const sorted = [...items].sort((x, y) => x.top - y.top)
  const groups: Placed[][] = []
  for (const it of sorted) {
    const g = groups[groups.length - 1]
    const bottom = g ? Math.max(...g.map(z => z.top + z.height)) : -Infinity
    if (g && it.top < bottom) g.push(it)
    else groups.push([it])
  }
  return groups
}

export interface ShiftDetail {
  name: string
  dia?: string
  trainNr?: string
  start: number
  end: number
  noTime?: boolean
  depLabel?: string
  arrLabel?: string
  dir?: '아웃바운드' | '인바운드'
  route?: string       // 저장된 노선(아시아나) — routeForFlights 표가 없을 때 사용
  legs?: LegView[]     // 다중 레그 상세
  codeOnly?: boolean   // 시간 없는 의도된 코드(훈련 등) — 상세도 경고 대신 코드만
  standby?: boolean    // STBY — 상세에 '하루 종일 대기'로
}

export function MonthTimeline({
  people, year, month, today, appointments = [], onTapAppt, onTapShift,
}: {
  people: MonthPerson[]
  year: number
  month: number
  today: Date
  appointments?: ApptCard[]
  onTapAppt?: (a: ApptCard) => void
  onTapShift?: (s: ShiftDetail) => void
}) {
  const dim = new Date(year, month, 0).getDate()
  const monthH = dim * DAY_PX
  const yOf = (absHour: number) => absHour * PXH
  const todayDay = today.getFullYear() === year && today.getMonth() === month - 1 ? today.getDate() : -1
  const dayList = Array.from({ length: dim }, (_, i) => i + 1)

  // flat list of {top, day, hour} marks
  const marks = dayList.flatMap(d => HOUR_TICKS.map(h => ({ d, h, top: yOf((d - 1) * 24 + h) })))

  const ref = useRef<HTMLDivElement>(null)
  const [contentW, setContentW] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      setContentW(null)
      requestAnimationFrame(() => {
        if (ref.current) setContentW(ref.current.scrollWidth)
      })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [people.length])

  const timeCls = 'font-en text-[10.5px] font-bold text-brand-700 whitespace-nowrap shrink-0'
  const titleCls = 'flex-1 min-w-0 text-[11px] font-bold text-ink-900 truncate'

  return (
    <div ref={ref} className="relative flex" style={{ height: monthH, width: 'max-content', minWidth: '100%', gap: LANE_GAP }}>
      {/* gridlines (span all columns, behind the cards) */}
      {marks.map(({ d, h, top }) => (
        <div
          key={`grid-${d}-${h}`}
          className={`absolute border-t ${h === 0 ? 'border-line-2' : 'border-dashed border-line'}`}
          style={contentW != null
            ? { left: LABEL_W, width: contentW - LABEL_W, top }
            : { left: LABEL_W, right: 0, top }}
        />
      ))}

      {/* sticky time gutter: date at midnight, an hour mark every 3h */}
      <div className="sticky left-0 z-20 shrink-0 bg-surface" style={{ width: LABEL_W }}>
        {marks.map(({ d, h, top }) => h === 0 ? (
          <div
            key={`lab-${d}-${h}`}
            className={`absolute left-0 flex flex-col items-center leading-none font-en ${d === todayDay ? 'text-brand' : 'text-ink-500'}`}
            style={{ width: LABEL_W, top: top - 9 }}
          >
            <span className="text-[13px] font-bold">{d}</span>
            <span className="text-[10px] font-semibold">{DOW[new Date(year, month - 1, d).getDay()]}</span>
          </div>
        ) : (
          <span
            key={`lab-${d}-${h}`}
            className="absolute left-0 text-center font-en text-[10px] text-ink-300"
            style={{ width: LABEL_W, top: top - 6 }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {/* person columns — grow to fill, or stay MIN_COL and let the row scroll sideways */}
      {people.map((p, pi) => {
        // Shift bands (px) drive docking: an appointment overlapping one is pushed
        // to the right so the shift's left identity stays visible.
        const shiftBands: [number, number][] = []
        for (const s of p.shifts) {
          if (s.noTime) { const st0 = yOf((s.day - 1) * 24); shiftBands.push([st0, st0 + NO_TIME_H]); continue }
          const st0 = yOf((s.day - 1) * 24 + s.start)
          shiftBands.push([st0, Math.max(st0 + MIN_CARD_H, yOf((s.day - 1) * 24 + s.end))])
        }
        const hitsShift = (t: number, b: number) => shiftBands.some(([a, z]) => t < z && b > a)

        // ── shift 충돌 레인 ──
        // shift는 시각 절대배치라, 밤샘 비행(end>24로 다음날 영역 침범)·종일 STBY·codeOnly가
        // 같은 세로구간에서 겹쳐 그려진다(약속과 달리 근무끼리 비켜주는 로직이 없었음). 실제
        // 시간대(MIN_CARD_H 부풀림 제외)로 겹치는 것끼리 묶어 좌우 레인으로 나눈다. 트립 연속
        // 세그먼트(비행→체류→비행)는 시간상 맞닿기만 해(lo == 직전 hi) 안 겹치므로 full-width 유지
        // → KTX·단일근무·에어프레미아 등 겹침 없는 경우는 그대로(left:0/right:0).
        const trueBand = (s: MonthShift): [number, number] => {
          const dt = yOf((s.day - 1) * 24)
          if (s.standby) return [dt, dt + DAY_PX]
          if (s.noTime) return [dt, dt + NO_TIME_H]
          const t = yOf((s.day - 1) * 24 + s.start)
          return [t, yOf((s.day - 1) * 24 + s.end)]
        }
        const laneOf: ({ left: string; width: string } | null)[] = new Array(p.shifts.length).fill(null)
        {
          const items = p.shifts
            .map((s, i) => { const [lo, hi] = trueBand(s); return { i, lo, hi } })
            .sort((a, b) => a.lo - b.lo)
          let cluster: typeof items = []
          let clusterHi = -Infinity
          const flush = () => {
            const n = cluster.length
            if (n > 1) {
              cluster.forEach((it, k) => {
                laneOf[it.i] = { left: `calc(${(100 / n) * k}% + ${k > 0 ? 1 : 0}px)`, width: `calc(${100 / n}% - 1px)` }
              })
            }
            cluster = []
            clusterHi = -Infinity
          }
          for (const it of items) {
            if (cluster.length && it.lo >= clusterHi) flush()
            cluster.push(it)
            clusterHi = Math.max(clusterHi, it.hi)
          }
          flush()
        }
        const laneStyle = (i: number): React.CSSProperties =>
          laneOf[i] ? { left: laneOf[i]!.left, width: laneOf[i]!.width } : { left: 0, right: 0 }

        const placed: Placed[] = appointments
          .filter(a => a.participants.includes(p.uid) && a.participantStatuses?.[p.uid] !== 'declined')
          .map(a => {
            const top = yOf((a.day - 1) * 24 + a.start)
            const height = Math.max(MIN_APPT_H, yOf((a.day - 1) * 24 + a.end) - top)
            return { a, top, height, pending: a.participantStatuses?.[p.uid] === 'pending' }
          })

        const apptEls: React.ReactNode[] = []
        for (const cluster of clusterAppts(placed)) {
          const n = cluster.length
          const cTop = cluster[0].top
          const cBottom = Math.max(...cluster.map(c => c.top + c.height))
          const base = hitsShift(cTop, cBottom) ? 46 : 0   // left edge (%) of the appt region
          const span = 100 - base
          cluster.forEach((pl, i) => {
            const a = pl.a
            const h = pl.height
            const laneW = span / n
            const leftPct = base + laneW * i
            const lane = base === 0 && n === 1
              ? { left: 0, right: 0 }
              : { left: `calc(${leftPct}% + ${leftPct > 0 ? 1 : 0}px)`, width: `calc(${laneW}% - 2px)` }
            const startTxt = a.untimed ? '미정' : fmtClock(a.start)
            apptEls.push(
              <button
                key={a.id}
                onClick={() => onTapAppt?.(a)}
                aria-label={`약속 ${a.title}`}
                className="absolute flex overflow-hidden text-left rounded-[10px]"
                style={{
                  top: pl.top, height: h, zIndex: 5, ...lane,
                  background: '#fff',
                  borderLeft: `3px ${pl.pending ? 'dashed' : 'solid'} var(--brand)`,
                  boxShadow: '0 0 0 2px #fff, inset 0 0 0 1px var(--brand-100), 0 1px 2px rgba(14,19,32,0.08)',
                  opacity: pl.pending ? 0.6 : 1,
                  lineHeight: 1.25,
                  ...(h < 36
                    ? { flexDirection: 'row', alignItems: 'center', gap: 4, padding: '0 6px' }
                    : { flexDirection: 'column', gap: 3, padding: h < 56 ? '4px 7px 5px' : '5px 7px 6px', justifyContent: h < 56 ? 'center' : 'space-between' }),
                }}
              >
                {h < 36 ? (
                  <>
                    <span className="text-brand shrink-0 leading-none"><PinIcon size={9} /></span>
                    <span className={timeCls}>{startTxt}</span>
                    <span className={titleCls}>{a.title}</span>
                  </>
                ) : h < 56 ? (
                  <>
                    <div className="flex items-start gap-1 min-w-0">
                      <span className="text-brand shrink-0 leading-none" style={{ marginTop: 1 }}><PinIcon size={10} /></span>
                      <span className={titleCls}>{a.title}</span>
                    </div>
                    <span className={timeCls}>{a.untimed ? '시간 미정' : startTxt}</span>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-[3px] min-w-0">
                      <div className="flex items-start gap-1 min-w-0">
                        <span className="text-brand shrink-0 leading-none" style={{ marginTop: 1 }}><PinIcon size={11} /></span>
                        <span className={titleCls}>{a.title}</span>
                      </div>
                      <span className={timeCls}>{a.untimed ? '시간 미정' : startTxt}</span>
                    </div>
                    {!a.untimed && a.hasEnd && <span className={timeCls}>↓ {fmtClock(a.end)}</span>}
                  </>
                )}
              </button>,
            )
          })
        }

        return (
          <div key={pi} className="relative shrink-0" style={{ flex: `1 0 ${MIN_COL}px` }}>
            {p.pending && (
              <div
                className="absolute left-1 right-1 flex flex-col gap-1.5 px-2 py-2.5 rounded-md"
                style={{ top: 8, background: 'var(--bg)', border: '1px dashed var(--line-2)', borderLeftWidth: 3, borderLeftStyle: 'dashed', borderLeftColor: p.color }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <Initial name={p.name} photo={p.photo} color={p.color} />
                  <span className="font-bold text-[11px] text-ink-500 truncate">{p.name}</span>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-pill text-ink-500 self-start whitespace-nowrap" style={{ background: 'white', boxShadow: 'inset 0 0 0 1px var(--line-2)' }}>
                  수락 대기 중
                </span>
              </div>
            )}
            {p.shifts.map((s, si) => {
              if (s.layover) {
                // 외국 체류(레이오버) 연속 블록 — 비행 사이를 메운다. 채움용이라 MIN_CARD_H로
                // 강제로 키우지 않는다(짧은 턴어라운드 시 인바운드 카드와 겹침 방지).
                const lt = yOf((s.day - 1) * 24 + s.start)
                const lh = Math.max(2, yOf((s.day - 1) * 24 + s.end) - lt)
                return (
                  <div
                    key={si}
                    className="absolute overflow-hidden leading-tight"
                    style={{ ...laneStyle(si), top: lt, height: lh, background: `color-mix(in oklab, ${p.color} 5%, white)`, borderStyle: 'solid', borderColor: `color-mix(in oklab, ${p.color} 26%, white)`, borderLeftColor: p.color, borderTopWidth: s.connectTop ? 0 : 1, borderRightWidth: 1, borderBottomWidth: s.connectBottom ? 0 : 1, borderLeftWidth: 3, borderTopLeftRadius: s.connectTop ? 0 : 10, borderTopRightRadius: s.connectTop ? 0 : 10, borderBottomLeftRadius: s.connectBottom ? 0 : 10, borderBottomRightRadius: s.connectBottom ? 0 : 10, padding: '6px 8px' }}
                  >
                    <span className="text-[11px] font-bold text-ink-500">{s.dia}</span>
                  </div>
                )
              }
              if (s.standby) {
                // STBY — 하루종일 밴드(시각 미상). 줄무늬로 확정 비행과 구분.
                const st = yOf((s.day - 1) * 24)
                const h = yOf((s.day - 1) * 24 + 24) - st
                return (
                  <button
                    type="button"
                    key={si}
                    onClick={() => onTapShift?.({ name: p.name, dia: s.dia, start: 0, end: 24, standby: true })}
                    className="absolute flex flex-col gap-1 overflow-hidden leading-tight text-left"
                    style={{ ...laneStyle(si), top: st, height: h, background: `repeating-linear-gradient(45deg, color-mix(in oklab, ${p.color} 6%, white), color-mix(in oklab, ${p.color} 6%, white) 9px, color-mix(in oklab, ${p.color} 12%, white) 9px, color-mix(in oklab, ${p.color} 12%, white) 18px)`, borderStyle: 'solid', borderColor: `color-mix(in oklab, ${p.color} 26%, white)`, borderLeftColor: p.color, borderWidth: 1, borderLeftWidth: 3, borderRadius: 10, padding: '5px 6px' }}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <Initial name={p.name} photo={p.photo} color={p.color} />
                      <span className="font-bold text-[11px] text-ink-900 truncate">{p.name}</span>
                      {p.tag && <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">{p.tag}</span>}
                    </div>
                    <span className="font-en text-[12px] font-bold text-ink-900">{s.dia}</span>
                    <span className="text-[10px] font-semibold text-ink-500">종일 대기</span>
                  </button>
                )
              }
              if (s.noTime) {
                return (
                  <button
                    type="button"
                    key={si}
                    onClick={() => onTapShift?.({ name: p.name, dia: s.dia, trainNr: s.trainNr, start: s.start, end: s.end, noTime: true, codeOnly: s.codeOnly })}
                    className="absolute flex flex-col gap-1 overflow-hidden leading-tight text-left"
                    style={{ ...laneStyle(si), top: yOf((s.day - 1) * 24), height: NO_TIME_H, background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--line-2)', borderLeft: `3px ${s.codeOnly ? 'solid' : 'dashed'} ${p.color}`, borderRadius: 10, padding: '5px 6px' }}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <Initial name={p.name} photo={p.photo} color={p.color} />
                      <span className="font-bold text-[11px] text-ink-900 truncate">{p.name}</span>
                      {p.tag && <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">{p.tag}</span>}
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      {s.dia && <span className="font-bold text-[12px] text-ink-900 truncate">{s.dia}</span>}
                      {s.trainNr && <span className="font-en text-[11px] font-bold text-ink-700 truncate">{prettyTrain(s.trainNr)}</span>}
                      {/* 의도된 코드(대기·훈련 등)는 깔끔히 코드만. 진짜 시간 누락만 경고 배지. */}
                      {!s.codeOnly && (
                        <span className="text-[9px] font-bold px-1 rounded-pill text-ink-700 shrink-0 whitespace-nowrap" style={{ background: 'color-mix(in oklab, var(--warn) 38%, white)' }}>시간 미입력</span>
                      )}
                    </div>
                    {s.route && <span className="font-en text-[10px] font-bold text-ink-700 truncate">{s.route}</span>}
                  </button>
                )
              }
              const top = yOf((s.day - 1) * 24 + s.start)
              const h = Math.max(MIN_CARD_H, yOf((s.day - 1) * 24 + s.end) - top)
              // 블록이 짧으면 내용이 잘리므로 압축 레이아웃(출발→도착 한 줄). 길면 펼침.
              const compact = h < 104
              const depTxt = s.depLabel ?? (s.cont === 'end' ? '전날부터' : fmtClock(s.start))
              const arrTxt = s.arrLabel ?? (s.cont === 'start' ? '익일 계속' : fmtClock(s.end))
              return (
                <button
                  type="button"
                  key={si}
                  onClick={() => onTapShift?.({ name: p.name, dia: s.dia, trainNr: s.trainNr, start: s.start, end: s.end, depLabel: s.depLabel, arrLabel: s.arrLabel, dir: s.dir, route: s.route, legs: s.legs })}
                  className={`absolute flex flex-col overflow-hidden leading-tight text-left ${compact ? 'justify-center gap-1.5' : 'justify-between'}`}
                  style={{ ...laneStyle(si), top, height: h, background: `color-mix(in oklab, ${p.color} 12%, white)`, borderStyle: 'solid', borderColor: `color-mix(in oklab, ${p.color} 26%, white)`, borderLeftColor: p.color, borderTopWidth: s.connectTop ? 0 : 1, borderRightWidth: 1, borderBottomWidth: s.connectBottom ? 0 : 1, borderLeftWidth: 3, borderTopLeftRadius: s.connectTop ? 0 : 10, borderTopRightRadius: s.connectTop ? 0 : 10, borderBottomLeftRadius: s.connectBottom ? 0 : 10, borderBottomRightRadius: s.connectBottom ? 0 : 10, padding: '5px 6px 6px' }}
                >
                  {compact ? (
                    <>
                      <div className="flex items-center gap-1 min-w-0">
                        <Initial name={p.name} photo={p.photo} color={p.color} />
                        <span className="font-bold text-[11px] text-ink-900 truncate">{p.name}</span>
                        {p.tag && <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">{p.tag}</span>}
                      </div>
                      {(s.dir || s.dia) && (
                        <div className="flex items-center gap-1 min-w-0">
                          {s.dir && <span className="text-[10px] font-bold bg-white px-1 rounded-xs whitespace-nowrap shrink-0" style={{ color: p.color }}>{s.dir}</span>}
                          {s.dia && <span className="font-en text-[10px] font-bold bg-white px-1 rounded-xs whitespace-nowrap shrink-0" style={{ color: p.color }}>{s.dia}</span>}
                        </div>
                      )}
                      <span className="font-en text-[10.5px] font-bold text-ink-900 truncate">{depTxt} → {arrTxt}</span>
                    </>
                  ) : (
                    <>
                      {/* 윗묶음: 이름·근무코드·출발이 카드 상단에 붙어야 한다(자식 2개라
                          justify-between이 위/아래로 가른다 — 이름을 따로 빼면 3등분돼 가운데로 밀림). */}
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <Initial name={p.name} photo={p.photo} color={p.color} />
                          <span className="font-bold text-[11px] text-ink-900 truncate">{p.name}</span>
                          {p.tag && <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">{p.tag}</span>}
                        </div>
                        {s.dir && (
                          <div className="text-[12px] font-bold bg-white px-1.5 py-0.5 rounded-xs self-start whitespace-nowrap" style={{ color: p.color }}>{s.dir}</div>
                        )}
                        {s.dia && (
                          <div className="font-en text-[12px] font-bold bg-white px-1.5 py-0.5 rounded-xs self-start whitespace-nowrap" style={{ color: p.color }}>{s.dia}</div>
                        )}
                        {s.route && (
                          <div className="font-en text-[10px] font-bold text-ink-700 truncate self-start">{s.route}</div>
                        )}
                        <span className="font-en text-[11px] font-bold text-ink-900">{depTxt}</span>
                      </div>
                      <div className="flex items-end justify-between gap-1 min-w-0">
                        <span className="font-en text-[11px] font-bold text-ink-900">↓ {arrTxt}</span>
                        {s.trainNr && (
                          <span className="font-en text-[10px] font-bold text-ink-700 px-1.5 py-0.5 bg-bg rounded-xs truncate">{prettyTrain(s.trainNr)}</span>
                        )}
                      </div>
                    </>
                  )}
                </button>
              )
            })}

            {/* appointment cards (white, over the soft shift cards) */}
            {apptEls}
          </div>
        )
      })}
    </div>
  )
}

function prettyTrain(s: string): string {
  return s.split(/\s*[·,]\s*|\s+/).filter(Boolean).join(' · ')
}

function Initial({ name, photo, color }: { name: string; photo?: string; color: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className="rounded-full object-cover bg-bg shrink-0" style={{ width: 16, height: 16 }} />
  }
  return (
    <span className="rounded-full grid place-items-center text-[8px] leading-none font-bold text-white shrink-0" style={{ width: 16, height: 16, background: color }}>
      {toInitials(name)}
    </span>
  )
}

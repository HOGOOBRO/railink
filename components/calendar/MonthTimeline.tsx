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

export interface MonthShift {
  day: number        // 1-based day of month
  dia?: string
  trainNr?: string
  start: number      // decimal hour within `day`
  end: number        // decimal hour; > 24 when the shift ends next day (박차)
  noTime?: boolean   // a working day whose 출퇴근 times weren't read (OCR miss)
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
                // 외국 체류(레이오버) 연속 블록 — 비행 사이를 메운다. 줄무늬·점선으로 구분.
                const lt = yOf((s.day - 1) * 24 + s.start)
                const lh = Math.max(MIN_CARD_H, yOf((s.day - 1) * 24 + s.end) - lt)
                return (
                  <div
                    key={si}
                    className="absolute left-0 right-0 overflow-hidden leading-tight"
                    style={{ top: lt, height: lh, background: `color-mix(in oklab, ${p.color} 5%, white)`, borderStyle: 'solid', borderColor: `color-mix(in oklab, ${p.color} 26%, white)`, borderLeftColor: p.color, borderTopWidth: s.connectTop ? 0 : 1, borderRightWidth: 1, borderBottomWidth: s.connectBottom ? 0 : 1, borderLeftWidth: 3, borderTopLeftRadius: s.connectTop ? 0 : 10, borderTopRightRadius: s.connectTop ? 0 : 10, borderBottomLeftRadius: s.connectBottom ? 0 : 10, borderBottomRightRadius: s.connectBottom ? 0 : 10, padding: '6px 8px' }}
                  >
                    <span className="text-[11px] font-bold text-ink-500">{s.dia}</span>
                    {s.connectBottom && <div className="absolute pointer-events-none" style={{ left: 12, right: 8, bottom: 0, height: 1, background: `color-mix(in oklab, ${p.color} 28%, white)` }} />}
                  </div>
                )
              }
              if (s.noTime) {
                return (
                  <div
                    key={si}
                    className="absolute left-0 right-0 flex flex-col gap-1 overflow-hidden leading-tight"
                    style={{ top: yOf((s.day - 1) * 24), height: NO_TIME_H, background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--line-2)', borderLeft: `3px dashed ${p.color}`, borderRadius: 10, padding: '5px 6px' }}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <Initial name={p.name} photo={p.photo} color={p.color} />
                      <span className="font-bold text-[11px] text-ink-900 truncate">{p.name}</span>
                      {p.tag && <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">{p.tag}</span>}
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      {s.dia && <span className="font-en text-[11px] font-bold text-ink-500 truncate">{s.dia}</span>}
                      {s.trainNr && <span className="font-en text-[11px] font-bold text-ink-700 truncate">{prettyTrain(s.trainNr)}</span>}
                      <span className="text-[9px] font-bold px-1 rounded-pill text-ink-700 shrink-0 whitespace-nowrap" style={{ background: 'color-mix(in oklab, var(--warn) 38%, white)' }}>시간 미입력</span>
                    </div>
                    {s.route && <span className="font-en text-[10px] font-bold text-ink-700 truncate">{s.route}</span>}
                  </div>
                )
              }
              const top = yOf((s.day - 1) * 24 + s.start)
              const h = Math.max(MIN_CARD_H, yOf((s.day - 1) * 24 + s.end) - top)
              return (
                <button
                  type="button"
                  key={si}
                  onClick={() => onTapShift?.({ name: p.name, dia: s.dia, trainNr: s.trainNr, start: s.start, end: s.end, depLabel: s.depLabel, arrLabel: s.arrLabel, dir: s.dir })}
                  className="absolute left-0 right-0 flex flex-col justify-between overflow-hidden leading-tight text-left"
                  style={{ top, height: h, background: `color-mix(in oklab, ${p.color} 12%, white)`, borderStyle: 'solid', borderColor: `color-mix(in oklab, ${p.color} 26%, white)`, borderLeftColor: p.color, borderTopWidth: s.connectTop ? 0 : 1, borderRightWidth: 1, borderBottomWidth: s.connectBottom ? 0 : 1, borderLeftWidth: 3, borderTopLeftRadius: s.connectTop ? 0 : 10, borderTopRightRadius: s.connectTop ? 0 : 10, borderBottomLeftRadius: s.connectBottom ? 0 : 10, borderBottomRightRadius: s.connectBottom ? 0 : 10, padding: '5px 6px 6px' }}
                >
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
                    <span className="font-en text-[11px] font-bold text-ink-900">{s.depLabel ?? (s.cont === 'end' ? '전날부터' : fmtClock(s.start))}</span>
                  </div>
                  <div className="flex items-end justify-between gap-1 min-w-0">
                    <span className="font-en text-[11px] font-bold text-ink-900">↓ {s.arrLabel ?? (s.cont === 'start' ? '익일 계속' : fmtClock(s.end))}</span>
                    {s.trainNr && (
                      <span className="font-en text-[10px] font-bold text-ink-700 px-1.5 py-0.5 bg-bg rounded-xs truncate">{prettyTrain(s.trainNr)}</span>
                    )}
                  </div>
                  {s.connectBottom && <div className="absolute pointer-events-none" style={{ left: 12, right: 8, bottom: 0, height: 1, background: `color-mix(in oklab, ${p.color} 28%, white)` }} />}
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

'use client'
/* Continuous month timeline: one column per person, a single vertical time axis
 * running across the whole month so an overnight (박차) shift is ONE card crossing
 * the midnight divider. The whole thing lives in ONE scroll area (both axes), and
 * the time gutter is sticky-left — so you can scroll down while panned right to
 * the colleagues on the far side. */
import { useEffect, useRef, useState } from 'react'
import { fmtClock } from '@/lib/schedule-utils'
import { toInitials } from '@/components/ui/Avatar'

export interface MonthShift {
  day: number        // 1-based day of month
  dia?: string
  trainNr?: string
  start: number      // decimal hour within `day`
  end: number        // decimal hour; > 24 when the shift ends next day (박차)
  noTime?: boolean   // a working day whose 출퇴근 times weren't read (OCR miss)
}

const NO_TIME_H = 54
export interface MonthPerson {
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
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21]   // a time mark every 3 hours

export function MonthTimeline({
  people, year, month, today,
}: { people: MonthPerson[]; year: number; month: number; today: Date }) {
  const dim = new Date(year, month, 0).getDate()
  const monthH = dim * DAY_PX
  const yOf = (absHour: number) => absHour * PXH
  const todayDay = today.getFullYear() === year && today.getMonth() === month - 1 ? today.getDate() : -1
  const dayList = Array.from({ length: dim }, (_, i) => i + 1)

  // flat list of {top, day, hour} marks
  const marks = dayList.flatMap(d => HOUR_TICKS.map(h => ({ d, h, top: yOf((d - 1) * 24 + h) })))

  // Gridlines must span the full content width — but Safari/WebKit ignores
  // `width: max-content` under `min-width: 100%` inside an overflow scroller and
  // clamps the flex container to the viewport, so columns past the fold overflow it
  // and `right: 0` lines stop short. Measure the real content width and size the
  // lines to it so they reach the last column on every engine.
  const ref = useRef<HTMLDivElement>(null)
  const [contentW, setContentW] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setContentW(el.scrollWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [people.length])

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
      {people.map((p, pi) => (
        <div key={pi} className="relative shrink-0" style={{ flex: `1 0 ${MIN_COL}px` }}>
          {p.pending && (
            <div
              className="absolute left-1 right-1 flex flex-col gap-1.5 px-2 py-2.5 rounded-md"
              style={{
                top: 8,
                background: 'var(--bg)',
                border: '1px dashed var(--line-2)',
                borderLeftWidth: 3,
                borderLeftStyle: 'dashed',
                borderLeftColor: p.color,
              }}
            >
              <div className="flex items-center gap-1 min-w-0">
                <Initial name={p.name} photo={p.photo} color={p.color} />
                <span className="font-bold text-[11px] text-ink-500 truncate">{p.name}</span>
              </div>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-pill text-ink-500 self-start whitespace-nowrap"
                style={{ background: 'white', boxShadow: 'inset 0 0 0 1px var(--line-2)' }}
              >
                수락 대기 중
              </span>
            </div>
          )}
          {p.shifts.map((s, si) => {
            if (s.noTime) {
              return (
                <div
                  key={si}
                  className="absolute left-0 right-0 flex flex-col gap-1 overflow-hidden leading-tight"
                  style={{
                    top: yOf((s.day - 1) * 24), height: NO_TIME_H,
                    background: 'var(--bg)',
                    boxShadow: 'inset 0 0 0 1px var(--line-2)',
                    borderLeft: `3px dashed ${p.color}`,
                    borderRadius: 10,
                    padding: '5px 6px',
                  }}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <Initial name={p.name} photo={p.photo} color={p.color} />
                    <span className="font-bold text-[11px] text-ink-900 truncate">{p.name}</span>
                    {p.tag && (
                      <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">{p.tag}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 min-w-0">
                    {s.dia && <span className="font-en text-[11px] font-bold text-ink-500 truncate">{s.dia}</span>}
                    <span
                      className="text-[9px] font-bold px-1 rounded-pill text-ink-700 shrink-0 whitespace-nowrap"
                      style={{ background: 'color-mix(in oklab, var(--warn) 38%, white)' }}
                    >시간 미입력</span>
                  </div>
                </div>
              )
            }
            const top = yOf((s.day - 1) * 24 + s.start)
            const h = Math.max(MIN_CARD_H, yOf((s.day - 1) * 24 + s.end) - top)
            return (
              <div
                key={si}
                className="absolute left-0 right-0 flex flex-col justify-between overflow-hidden leading-tight"
                style={{
                  top, height: h,
                  background: `color-mix(in oklab, ${p.color} 12%, white)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${p.color} 30%, white)`,
                  borderLeft: `3px solid ${p.color}`,
                  borderRadius: 10,
                  padding: '5px 6px 6px',
                }}
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <Initial name={p.name} photo={p.photo} color={p.color} />
                    <span className="font-bold text-[11px] text-ink-900 truncate">{p.name}</span>
                    {p.tag && (
                      <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">{p.tag}</span>
                    )}
                  </div>
                  {s.dia && (
                    <div className="font-en text-[12px] font-bold bg-white px-1.5 py-0.5 rounded-xs self-start whitespace-nowrap" style={{ color: p.color }}>
                      {s.dia}
                    </div>
                  )}
                  <span className="font-en text-[11px] font-bold text-ink-900">{fmtClock(s.start)}</span>
                </div>
                <div className="flex items-end justify-between gap-1 min-w-0">
                  <span className="font-en text-[11px] font-bold text-ink-900">↓ {fmtClock(s.end)}</span>
                  {s.trainNr && (
                    <span className="font-en text-[10px] font-bold text-ink-700 px-1.5 py-0.5 bg-bg rounded-xs truncate">
                      {prettyTrain(s.trainNr)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
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

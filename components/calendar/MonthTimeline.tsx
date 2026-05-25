'use client'
/* Continuous month timeline: one column per person (scroll sideways to see
 * everyone), a single vertical time axis running across the whole month so an
 * overnight (박차) shift is ONE card crossing the midnight day-divider. */
import { fmtClock } from '@/lib/schedule-utils'
import { toInitials } from '@/components/ui/Avatar'

export interface MonthShift {
  day: number        // 1-based day of month
  dia?: string
  trainNr?: string
  start: number      // decimal hour within `day`
  end: number        // decimal hour; > 24 when the shift ends next day (박차)
}
export interface MonthPerson {
  color: string
  name: string
  tag?: string
  photo?: string
  shifts: MonthShift[]
}

const PXH = 18           // pixels per hour
export const DAY_PX = 24 * PXH
const LABEL_W = 46
const LANE_GAP = 6
const MIN_COL = 116
const MIN_CARD_H = 110
const DOW = ['일', '월', '화', '수', '목', '금', '토']

export function MonthTimeline({
  people, year, month, today,
}: { people: MonthPerson[]; year: number; month: number; today: Date }) {
  const dim = new Date(year, month, 0).getDate()
  const monthH = dim * DAY_PX
  const yOf = (absHour: number) => absHour * PXH
  const todayDay = today.getFullYear() === year && today.getMonth() === month - 1 ? today.getDate() : -1

  const dayList = Array.from({ length: dim }, (_, i) => i + 1)

  return (
    <div className="relative" style={{ height: monthH, paddingLeft: LABEL_W }}>
      {/* midnight day-dividers + date label in the gutter */}
      {dayList.map(d => (
        <div key={d} className="absolute left-0 right-0 border-t border-line-2" style={{ top: yOf((d - 1) * 24) }}>
          <div
            className={`absolute left-1 -top-1 leading-none font-en ${d === todayDay ? 'text-brand' : 'text-ink-500'}`}
            style={{ width: LABEL_W - 8 }}
          >
            <div className="text-[13px] font-bold">{d}</div>
            <div className="text-[10px] font-semibold">{DOW[new Date(year, month - 1, d).getDay()]}</div>
          </div>
        </div>
      ))}
      {/* faint noon reference per day */}
      {dayList.map(d => (
        <div key={`n${d}`} className="absolute left-0 right-0 border-t border-dashed border-line" style={{ top: yOf((d - 1) * 24 + 12) }}>
          <span className="absolute left-1 -top-2 font-en text-[9px] text-ink-300">12:00</span>
        </div>
      ))}

      {/* person columns — scroll sideways to reveal everyone */}
      <div className="absolute top-0 bottom-0 right-0 overflow-x-auto" style={{ left: LABEL_W }}>
        <div className="flex h-full" style={{ gap: LANE_GAP }}>
          {people.map((p, pi) => (
            <div key={pi} className="relative shrink-0" style={{ flex: `1 0 ${MIN_COL}px` }}>
              {p.shifts.map((s, si) => {
                const top = yOf((s.day - 1) * 24 + s.start)
                const h = Math.max(MIN_CARD_H, yOf((s.day - 1) * 24 + s.end) - top)
                return (
                  <div
                    key={si}
                    className="absolute left-0 right-0 flex flex-col gap-1 overflow-hidden leading-tight"
                    style={{
                      top, height: h,
                      background: `color-mix(in oklab, ${p.color} 12%, white)`,
                      boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${p.color} 30%, white)`,
                      borderLeft: `3px solid ${p.color}`,
                      borderRadius: 10,
                      padding: '5px 6px 6px',
                    }}
                  >
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
                    <div className="font-en text-[11px] font-semibold flex flex-col gap-px">
                      <span className="text-ink-900 font-bold">{fmtClock(s.start)}</span>
                      <span className="text-ink-500">↓</span>
                      <span className="text-ink-900 font-bold">{fmtClock(s.end)}</span>
                    </div>
                    {s.trainNr && (
                      <div className="mt-auto font-en text-[10px] font-bold text-ink-700 px-1.5 py-0.5 bg-bg rounded-xs self-start truncate max-w-full">
                        {prettyTrain(s.trainNr)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
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

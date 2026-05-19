/* Time-grid timeline with one no-overlap LANE per person.
 * Ported from the design prototype (railink/project/screens-b.jsx TimelineBody).
 * start/end are decimal hours; end may exceed 24 for 익일 종료. */
import { toInitials } from '@/components/ui/Avatar'
import { fmtClock } from '@/lib/schedule-utils'

export interface TimelineItem {
  color: string      // CSS color, e.g. 'var(--brand)'
  name: string
  tag?: string       // e.g. '나'
  photo?: string
  dia?: string
  trainNr?: string
  start: number
  end: number
}

const ROW_H = 24
const LANE_GAP = 4
const LABEL_W = 44

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return null

  const minStart = Math.min(...items.map(i => i.start))
  const maxEnd = Math.max(...items.map(i => i.end))
  const minH = Math.max(0, Math.floor(minStart - 1))
  const maxH = Math.min(28, Math.ceil(maxEnd + 1))
  const totalH = (maxH - minH) * ROW_H
  const yOf = (h: number) => ((h - minH) / (maxH - minH)) * totalH

  const span = maxH - minH
  const stepH = span <= 8 ? 2 : 3
  const hourTicks: number[] = []
  for (let h = minH; h <= maxH; h += stepH) hourTicks.push(h)

  const now = new Date()
  const NOW = now.getHours() + now.getMinutes() / 60
  const showNow = NOW >= minH && NOW <= maxH

  return (
    <div
      className="relative mt-1"
      style={{ height: totalH + 24, paddingLeft: LABEL_W }}
    >
      {/* Hour grid + labels */}
      {hourTicks.map(h => (
        <div
          key={h}
          className="absolute right-0 border-t border-dashed border-line"
          style={{ left: LABEL_W - 6, top: yOf(h), height: 0 }}
        >
          <span
            className="absolute font-en text-[11px] font-semibold text-ink-500 text-right"
            style={{ left: -LABEL_W, top: -8, width: LABEL_W - 8 }}
          >
            {String(h % 24).padStart(2, '0')}:00{h >= 24 ? '+' : ''}
          </span>
        </div>
      ))}

      {/* Now line */}
      {showNow && (
        <div
          className="absolute right-0 border-t-[1.5px] border-brand opacity-50 pointer-events-none"
          style={{ left: LABEL_W - 6, top: yOf(NOW), height: 0, zIndex: 1 }}
        >
          <span
            className="absolute w-2.5 h-2.5 rounded-full bg-brand"
            style={{ left: -6, top: -5 }}
          />
        </div>
      )}

      {/* Lanes */}
      <div
        className="absolute right-0 top-0 flex"
        style={{ left: LABEL_W, bottom: 24, gap: LANE_GAP }}
      >
        {items.map((it, i) => {
          const top = yOf(it.start)
          const h = Math.max(72, yOf(it.end) - top)
          return (
            <div key={i} className="flex-1 relative min-w-0">
              <div
                className="absolute left-0 right-0 flex flex-col gap-1 overflow-hidden shadow-sh1"
                style={{
                  top,
                  height: h,
                  background: `color-mix(in oklab, ${it.color} 12%, white)`,
                  border: `1px solid color-mix(in oklab, ${it.color} 30%, white)`,
                  borderLeft: `3px solid ${it.color}`,
                  borderRadius: 10,
                  padding: '6px 8px 8px',
                }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <TinyAvatar name={it.name} photo={it.photo} color={it.color} />
                  <span className="font-bold text-[12px] text-ink-900 truncate">
                    {it.name}
                  </span>
                  {it.tag && (
                    <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">
                      {it.tag}
                    </span>
                  )}
                </div>
                {it.dia && (
                  <div
                    className="font-en text-[13px] font-bold bg-white px-1.5 py-0.5 rounded-xs self-start whitespace-nowrap"
                    style={{ color: it.color }}
                  >
                    {it.dia}
                  </div>
                )}
                <div className="font-en text-[11px] text-ink-700 font-semibold flex flex-col gap-px">
                  <span className="text-ink-900 font-bold">{fmtClock(it.start)}</span>
                  <span className="text-ink-500">↓</span>
                  <span className="flex items-center gap-1">
                    <span className="text-ink-900 font-bold">{fmtClock(it.end)}</span>
                    {it.end > 24 && (
                      <span className="text-[8px] px-1 rounded-pill text-ink-700 shadow-[inset_0_0_0_1px_var(--line-2)]">
                        익일
                      </span>
                    )}
                  </span>
                </div>
                {it.trainNr && h > 130 && (
                  <div className="mt-auto font-en text-[10px] font-bold text-ink-700 px-1.5 py-0.5 bg-bg rounded-xs self-start">
                    {it.trainNr}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TinyAvatar({ name, photo, color }: { name: string; photo?: string; color: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className="w-[18px] h-[18px] rounded-full object-cover bg-bg shrink-0" />
  }
  return (
    <span
      className="w-[18px] h-[18px] rounded-full grid place-items-center text-[8px] font-bold text-white shrink-0"
      style={{ background: color }}
    >
      {toInitials(name)}
    </span>
  )
}

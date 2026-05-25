'use client'
/* Time-grid timeline with one column (LANE) per person, time on the vertical
 * axis. start/end are decimal hours; end may exceed 24 for 익일 종료. Items
 * without times render as separate "시간 미입력" cards below the grid. */
import { useState } from 'react'
import { toInitials } from '@/components/ui/Avatar'
import { fmtClock } from '@/lib/schedule-utils'

export interface TimelineItem {
  color: string      // CSS color, e.g. 'var(--brand)'
  name: string
  tag?: string       // e.g. '나'
  photo?: string
  dia?: string
  trainNr?: string
  start?: number     // decimal hour; undefined when the schedule has no time
  end?: number
  continued?: boolean // morning tail of an overnight (박차) shift started yesterday
  contStart?: number  // yesterday's start (decimal) — shown as "어제 HH:MM" on a continued card
}

type TimedItem = TimelineItem & { start: number; end: number }

const ROW_H = 24
const LANE_GAP = 6
const LABEL_W = 44
const MIN_CARD_H = 72
// Side-by-side lanes get cramped fast; cap how many share the grid and move the
// rest into a tap-to-expand list so diagram codes / times never truncate.
const MAX_LANES = 4

// Train numbers arrive from OCR/files in mixed forms ("55 44", "55 · 44",
// "55,44"); normalize to one " · "-joined form so every card reads the same.
function prettyTrain(s: string): string {
  return s.split(/\s*[·,]\s*|\s+/).filter(Boolean).join(' · ')
}

export function Timeline({ items, isToday = false }: { items: TimelineItem[]; isToday?: boolean }) {
  const [showOverflow, setShowOverflow] = useState(false)
  if (!items.length) return null
  const timed = items.filter((i): i is TimedItem => i.start != null && i.end != null)
  const untimed = items.filter(i => i.start == null || i.end == null)
  const laneTimed = timed.slice(0, MAX_LANES)
  const overflow = timed.slice(MAX_LANES)

  return (
    <div>
      {laneTimed.length > 0 && <TimedGrid items={laneTimed} compact={laneTimed.length > 1} isToday={isToday} />}

      {overflow.length > 0 && (
        <div className="mt-2.5">
          <button
            onClick={() => setShowOverflow(v => !v)}
            className="w-full h-9 rounded-md bg-bg text-callout font-semibold text-ink-700 active:scale-[.99]"
          >
            {showOverflow ? '접기' : `+${overflow.length}명 더 보기`}
          </button>
          {showOverflow && (
            <div className="mt-2 flex flex-col gap-2">
              {overflow.map((it, i) => <CompactRow key={`o${i}`} item={it} />)}
            </div>
          )}
        </div>
      )}

      {untimed.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {untimed.map((it, i) => (
            <UntimedCard key={`u${i}`} item={it} />
          ))}
        </div>
      )}
    </div>
  )
}

function TimedGrid({ items, compact, isToday }: { items: TimedItem[]; compact: boolean; isToday: boolean }) {
  const minStart = Math.min(...items.map(i => i.start))
  const maxEnd = Math.max(...items.map(i => i.end))
  const minH = Math.max(0, Math.floor(minStart - 1))
  const maxH = Math.min(40, Math.ceil(maxEnd + 1))
  const totalH = (maxH - minH) * ROW_H
  const yOf = (h: number) => ((h - minH) / (maxH - minH)) * totalH
  // A late-starting shift still renders MIN_CARD_H tall; grow the grid so the
  // lowest card bottom stays inside it (otherwise cards spill onto the action row).
  const gridH = Math.max(
    totalH,
    ...items.map(it => yOf(it.start) + Math.max(MIN_CARD_H, yOf(it.end) - yOf(it.start))),
  )

  const span = maxH - minH
  const stepH = span <= 8 ? 2 : 3
  const hourTicks: number[] = []
  for (let h = minH; h <= maxH; h += stepH) hourTicks.push(h)

  const now = new Date()
  const NOW = now.getHours() + now.getMinutes() / 60
  // Only on today — a "now" marker is meaningless on a past/future day's sheet.
  const showNow = isToday && NOW >= minH && NOW <= maxH

  const avatarPx = compact ? 16 : 18
  const padding = compact ? '5px 6px 6px' : '6px 8px 8px'

  return (
    <div className="relative mt-1" style={{ height: gridH + 24, paddingLeft: LABEL_W }}>
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
          style={{ left: LABEL_W - 6, top: yOf(NOW), height: 0 }}
        >
          <span className="absolute w-2.5 h-2.5 rounded-full bg-brand" style={{ left: -6, top: -5 }} />
        </div>
      )}

      {/* Lanes — one column per person (capped at MAX_LANES, so they fit width). */}
      <div className="absolute right-0 top-0 flex" style={{ left: LABEL_W, bottom: 24, gap: LANE_GAP }}>
        {items.map((it, i) => {
          const top = yOf(it.start)
          const h = Math.max(MIN_CARD_H, yOf(it.end) - top)
          return (
            <div key={i} className="flex-1 relative min-w-0">
              <div
                className="absolute left-0 right-0 flex flex-col gap-1 overflow-hidden"
                style={{
                  top,
                  height: h,
                  background: `color-mix(in oklab, ${it.color} 12%, white)`,
                  // inset ring instead of drop shadow so adjacent columns don't bleed
                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${it.color} 30%, white)`,
                  borderLeft: `3px solid ${it.color}`,
                  borderRadius: 10,
                  padding,
                }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <TinyAvatar name={it.name} photo={it.photo} color={it.color} px={avatarPx} />
                  <span className={`font-bold text-ink-900 truncate ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
                    {it.name}
                  </span>
                  {it.tag && (
                    <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">
                      {it.tag}
                    </span>
                  )}
                  {it.continued && (
                    <span
                      className="text-[9px] font-bold px-1 rounded-pill text-ink-700 shrink-0 whitespace-nowrap"
                      style={{ background: 'color-mix(in oklab, var(--warn) 28%, white)' }}
                    >
                      연속
                    </span>
                  )}
                </div>
                {it.dia && (
                  <div
                    className={`font-en font-bold bg-white px-1.5 py-0.5 rounded-xs self-start whitespace-nowrap ${compact ? 'text-[12px]' : 'text-[13px]'}`}
                    style={{ color: it.color }}
                  >
                    {it.dia}
                  </div>
                )}
                {it.continued ? (
                  <div className="font-en text-[11px] font-semibold flex flex-col gap-px">
                    <span className="text-ink-500">어제 {fmtClock(it.contStart ?? 0)}</span>
                    <span className="text-ink-500">↓</span>
                    <span className="text-ink-900 font-bold">{fmtClock(it.end)} 종료</span>
                  </div>
                ) : (
                  <div className="font-en text-[11px] text-ink-700 font-semibold flex flex-col gap-px">
                    <span className="text-ink-900 font-bold">{fmtClock(it.start)}</span>
                    <span className="text-ink-500">↓</span>
                    <span className="flex items-center gap-1 flex-wrap">
                      <span className="text-ink-900 font-bold">{fmtClock(it.end)}</span>
                      {it.end > 24 && (
                        <span className="text-[8px] px-1 rounded-pill text-ink-700 shadow-[inset_0_0_0_1px_var(--line-2)]">
                          익일
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {it.trainNr && (
                  <div className="mt-auto font-en text-[10px] font-bold text-ink-700 px-1.5 py-0.5 bg-bg rounded-xs self-start truncate max-w-full">
                    {prettyTrain(it.trainNr)}
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

function UntimedCard({ item }: { item: TimelineItem }) {
  return (
    <div
      className="flex items-center gap-2 rounded-[10px] px-3 py-2.5 min-w-0"
      style={{
        background: `color-mix(in oklab, ${item.color} 12%, white)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${item.color} 30%, white)`,
        borderLeft: `3px solid ${item.color}`,
      }}
    >
      <TinyAvatar name={item.name} photo={item.photo} color={item.color} px={18} />
      <span className="font-bold text-[12px] text-ink-900 truncate">{item.name}</span>
      {item.tag && (
        <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">
          {item.tag}
        </span>
      )}
      {item.dia && (
        <span
          className="font-en text-[12px] font-bold bg-white px-1.5 py-0.5 rounded-xs whitespace-nowrap shrink-0"
          style={{ color: item.color }}
        >
          {item.dia}
        </span>
      )}
      {item.trainNr && (
        <span className="font-en text-[10px] font-bold text-ink-700 px-1.5 py-0.5 bg-bg rounded-xs shrink-0 truncate">
          {prettyTrain(item.trainNr)}
        </span>
      )}
      <span className="ml-auto text-[11px] text-ink-500 shrink-0">시간 미입력</span>
    </div>
  )
}

// Compact one-line card for people beyond MAX_LANES (revealed by "+N명 더 보기").
function CompactRow({ item }: { item: TimedItem }) {
  const timeText = item.continued
    ? `어제 ${fmtClock(item.contStart ?? 0)} → ${fmtClock(item.end)} 종료`
    : `${fmtClock(item.start)}–${fmtClock(item.end)}${item.end > 24 ? ' 익일' : ''}`
  return (
    <div
      className="flex items-center gap-2 rounded-[10px] px-3 py-2.5 min-w-0"
      style={{
        background: `color-mix(in oklab, ${item.color} 12%, white)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${item.color} 30%, white)`,
        borderLeft: `3px solid ${item.color}`,
      }}
    >
      <TinyAvatar name={item.name} photo={item.photo} color={item.color} px={18} />
      <span className="font-bold text-[12px] text-ink-900 truncate">{item.name}</span>
      {item.tag && (
        <span className="text-[9px] font-bold px-1 rounded-pill bg-brand-050 text-brand shrink-0">{item.tag}</span>
      )}
      {item.continued && (
        <span
          className="text-[9px] font-bold px-1 rounded-pill text-ink-700 shrink-0 whitespace-nowrap"
          style={{ background: 'color-mix(in oklab, var(--warn) 28%, white)' }}
        >연속</span>
      )}
      {item.dia && (
        <span
          className="font-en text-[12px] font-bold bg-white px-1.5 py-0.5 rounded-xs whitespace-nowrap shrink-0"
          style={{ color: item.color }}
        >{item.dia}</span>
      )}
      <span className="ml-auto font-en text-[11px] font-semibold text-ink-700 shrink-0 whitespace-nowrap">{timeText}</span>
    </div>
  )
}

function TinyAvatar({ name, photo, color, px }: { name: string; photo?: string; color: string; px: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className="rounded-full object-cover bg-bg shrink-0" style={{ width: px, height: px }} />
  }
  return (
    <span
      className="rounded-full grid place-items-center text-[8px] leading-none font-bold text-white shrink-0"
      style={{ width: px, height: px, background: color }}
    >
      {toInitials(name)}
    </span>
  )
}

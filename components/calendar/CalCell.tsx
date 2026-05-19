/* Chip-style calendar cell (the user's chosen "C" variant).
 *   - no work        → plain mono day number
 *   - 1 worker       → day number in a soft-tinted chip in that user's color
 *   - 2+ workers     → mono day number + small stacked color dots
 *   - holiday only    → muted, struck-through day number
 * Today (warn dot) and selected (brand tint) overlay any state. */

export interface CellBar {
  color: string   // CSS color value, e.g. 'var(--brand)' or 'var(--c3)'
  isOff: boolean
}

interface CalCellProps {
  d: number
  isOther: boolean
  today: boolean
  selected: boolean
  bars: CellBar[]
}

export function CalCell({ d, isOther, today, selected, bars }: CalCellProps) {
  const work = bars.filter(b => !b.isOff)
  const offCount = bars.length - work.length
  const single = work.length === 1 ? work[0] : null

  let inner
  if (isOther) {
    inner = <span className="font-en text-[15px] font-[400] text-ink-300">{d}</span>
  } else if (single) {
    inner = (
      <span
        className="font-en text-[14px] font-semibold tracking-tight px-[9px] py-1 rounded-pill leading-none"
        style={{
          background: `color-mix(in oklab, ${single.color} 16%, white)`,
          color: single.color,
        }}
      >
        {d}
      </span>
    )
  } else if (offCount > 0 && work.length === 0) {
    inner = (
      <span className="font-en text-[15px] font-[400] text-ink-500 line-through decoration-ink-300">
        {d}
      </span>
    )
  } else {
    inner = <span className="font-en text-[15px] font-[400] text-ink-900">{d}</span>
  }

  return (
    <div
      className={`relative h-14 px-[4px] flex flex-col items-center justify-center gap-[2px] ${
        selected ? 'bg-brand-050 border-y border-brand-100' : 'bg-surface'
      }`}
    >
      {today && (
        <span className="absolute top-[4px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] rounded-[6px] bg-warn pointer-events-none" />
      )}
      {inner}
      {work.length >= 2 && (
        <div className="flex items-center h-[6px]">
          {work.slice(0, 4).map((b, i) => (
            <span
              key={i}
              className="w-[6px] h-[6px] rounded-full shadow-[0_0_0_1px_#fff]"
              style={{ background: b.color, marginLeft: i > 0 ? -2 : 0 }}
            />
          ))}
          {work.length > 4 && (
            <span className="ml-[3px] text-[9px] font-bold text-ink-500 leading-[6px]">
              +{work.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

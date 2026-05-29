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
  /** 0=일 ~ 6=토 — 토·일 셀에 옅은 배경, 일요일 숫자는 빨강. */
  dow?: number
  /** 한국 공휴일 (대체공휴일 포함). 빨강 배경 + 작은 캡션 라벨. */
  holiday?: string | null
}

export function CalCell({ d, isOther, today, selected, bars, dow, holiday }: CalCellProps) {
  const work = bars.filter(b => !b.isOff)
  const offCount = bars.length - work.length
  const single = work.length === 1 ? work[0] : null
  const isSun = dow === 0
  const isSat = dow === 6
  const isRed = !!holiday || (isSun && !isOther)

  // Day-number color. Selected/Today brand take precedence in the cell
  // background; the number itself follows weekend/holiday hue when there's
  // no worker chip overriding it.
  function numberColor(): string {
    if (isOther) return 'text-ink-300'
    if (isRed) return 'text-danger'
    if (isSat) return 'text-c1'
    return 'text-ink-900'
  }

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
      <span className={`font-en text-[15px] font-[400] line-through decoration-ink-300 ${numberColor()}`}>
        {d}
      </span>
    )
  } else {
    inner = <span className={`font-en text-[15px] font-[400] ${numberColor()}`}>{d}</span>
  }

  // Background priority: selected > red holiday tint > weekend tint > plain.
  let bgClass = 'bg-surface'
  if (selected) {
    bgClass = 'bg-brand-050 border-y border-brand-100'
  } else if (!isOther && holiday) {
    // soft red so the cell reads as a non-working day at a glance
    bgClass = ''
  } else if (!isOther && (isSat || isSun)) {
    bgClass = 'bg-surface-2'
  }

  const inlineHoliday = !selected && !isOther && holiday
    ? { background: 'rgba(220,38,38,0.06)' }
    : undefined

  return (
    <div
      className={`relative h-14 px-[4px] flex flex-col items-center justify-center gap-[2px] ${bgClass}`}
      style={inlineHoliday}
      title={holiday ?? undefined}
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

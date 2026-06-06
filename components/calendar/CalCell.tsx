/* Chip-style calendar cell (the user's chosen "C" variant).
 *   - no work        → plain mono day number (weekend/holiday hue applied)
 *   - 1 worker       → day number in a soft-tinted chip in that user's color
 *   - 2+ workers     → mono day number + small stacked color dots
 *   - holiday only    → muted, struck-through day number
 * Today (filled brand circle) beats every state — it overrides the weekend/
 * holiday hue and the single-worker chip so it can never be mistaken for a
 * holiday. Holidays carry a red bar above the number (never a dot) + red
 * number. Selected (brand tint) shades the cell background.
 * Birthday (compared colleague, gated by accepted share) → a small cake glyph in
 * the top-right corner, tinted to that colleague's compare color. Who it is shows
 * in the day detail sheet. */
import { CakeIcon } from '@/components/ui/icons'

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
  /** 오늘 이전 날짜. 전경(숫자·칩·도트·공휴일 바)만 톤다운한다 — 탭·편집은 그대로. */
  isPast?: boolean
  /** 이 날 생일인 비교 동료의 색(들). 있으면 우상단에 케이크 마커(첫 색으로 틴트). */
  birthdayColor?: string | null
}

export function CalCell({ d, isOther, today, selected, bars, dow, holiday, isPast, birthdayColor }: CalCellProps) {
  const work = bars.filter(b => !b.isOff)
  const offCount = bars.length - work.length
  const single = work.length === 1 ? work[0] : null
  const isSun = dow === 0
  const isSat = dow === 6
  const isRed = !!holiday || (isSun && !isOther)

  // 지난 날짜는 전경만 흐리게. 오늘은 항상 또렷(today가 dim을 이긴다), 다른 달 셀은 제외.
  // 배경/선택 하이라이트는 건드리지 않고, 인터랙션도 전혀 바뀌지 않는다 (순수 시각 큐).
  const dim = !!isPast && !today && !isOther
  const dimCls = dim ? ' opacity-40' : ''

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
  if (today && !isOther) {
    // Today → filled brand circle, white number. Highest-priority cell marker;
    // overrides weekend/holiday hue and the single-worker chip.
    inner = (
      <span className="font-en text-[14px] font-bold tracking-tight w-7 h-7 rounded-full bg-brand text-white grid place-items-center leading-none">
        {d}
      </span>
    )
  } else if (isOther) {
    inner = <span className="font-en text-[15px] font-[400] text-ink-300">{d}</span>
  } else if (single) {
    inner = (
      <span
        className={`font-en text-[14px] font-semibold tracking-tight px-[9px] py-1 rounded-pill leading-none${dimCls}`}
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
      <span className={`font-en text-[15px] font-[400] line-through decoration-ink-300 ${isRed ? 'text-danger' : isSat ? 'text-c1' : 'text-ink-300'}${dimCls}`}>
        {d}
      </span>
    )
  } else {
    inner = <span className={`font-en text-[15px] font-[400] ${numberColor()}${dimCls}`}>{d}</span>
  }

  // No weekend/holiday cell shading — weekends read through the number hue and
  // holidays through the red bar. Only the selected day tints its background.
  const bgClass = selected ? 'bg-brand-050 border-y border-brand-100' : 'bg-surface'

  return (
    <div
      className={`relative h-14 px-[4px] flex flex-col items-center justify-center gap-[2px] ${bgClass}`}
      title={holiday ?? undefined}
    >
      {/* Holiday marker — a small red bar above the number (only when NOT today,
          to stay distinct from today's filled circle). */}
      {holiday && !isOther && !today && (
        <span className={`absolute top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[2.5px] rounded-[2px] bg-danger pointer-events-none${dimCls}`} />
      )}
      {/* Birthday marker — top-right cake, tinted to the colleague's color.
          Who it is shows in the day detail sheet. */}
      {birthdayColor && !isOther && (
        <span
          className={`absolute top-[3px] right-[3px] pointer-events-none${dimCls}`}
          style={{ color: birthdayColor }}
        >
          <CakeIcon size={12} />
        </span>
      )}
      {inner}
      {work.length >= 2 && (
        <div className={`flex items-center h-[6px]${dimCls}`}>
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

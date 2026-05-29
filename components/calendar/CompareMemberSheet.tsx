'use client'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { CloseIcon, CheckIcon } from '@/components/ui/icons'
import type { CompareColor, CompareEntry } from '@/lib/types/schedule'

const COLOR_OPTIONS: CompareColor[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']

/** Tap-an-avatar mini profile sheet. The whole point: tapping a strip pill
 *  used to immediately remove the colleague (and silently cancel the share
 *  on the last-group case). Users tap to *look* — Instagram-story style —
 *  so removal goes behind an explicit button inside the sheet.
 *
 *  Color picker — owner-local override (saved to railink_member_colors_v1).
 *  Selecting a swatch updates the member's display color on this device only;
 *  the colleague is unaffected. */
export function CompareMemberSheet({
  member, pending, isDemo, usedBy, onRemove, onClose, onChangeColor,
}: {
  member: CompareEntry
  pending: boolean
  isDemo: boolean
  /** color → another colleague's name already using it (hint only, dups allowed). */
  usedBy?: Partial<Record<CompareColor, string>>
  onRemove: () => void
  onClose: () => void
  /** Optional in demo (color override is real-account only). */
  onChangeColor?: (color: CompareColor) => void
}) {
  const statusLabel = pending ? '수락 대기 중' : '공유 중'
  const statusTone = pending
    ? 'bg-bg text-ink-500'
    : 'bg-brand-050 text-brand'

  return (
    <div className="px-5 pt-2 pb-8">
      <div className="flex items-center justify-end">
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-1 pt-1 pb-5">
        <Avatar
          name={member.name}
          photo={member.photo}
          size="xl"
          color={member.color}
          className="!w-[84px] !h-[84px] text-[28px]"
        />
        <p className="mt-3 text-[20px] font-bold tracking-tight text-ink-900">{member.name}</p>
        <p className="font-en text-caption text-ink-500">{member.employeeId}</p>
        {member.office && (
          <p className="text-caption text-ink-500">{member.office}</p>
        )}
        {!isDemo && (
          <span className={`mt-2 text-[11px] font-bold px-2 py-0.5 rounded-pill leading-none ${statusTone}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {onChangeColor && (
        <section className="mb-4">
          <p className="px-1 pb-2.5 text-[11px] font-bold tracking-wider uppercase text-ink-500">
            표시 색상 <span className="font-normal text-ink-300">· 내 화면에만 적용</span>
          </p>
          <div className="grid grid-cols-5 gap-2.5">
            {COLOR_OPTIONS.map((c, i) => (
              <ColorSwatch
                key={c}
                color={c}
                index={i + 1}
                active={member.color === c}
                takenBy={member.color === c ? undefined : usedBy?.[c]}
                onClick={() => onChangeColor(c)}
              />
            ))}
          </div>
          <p className="px-1 pt-3 text-[11px] text-ink-300 leading-relaxed">
            색상은 내 화면에서만 보여요. 흐리게 표시된 색은 다른 동료가 쓰고 있어요.
          </p>
        </section>
      )}

      {pending && !isDemo && (
        <p className="mb-3 text-[11px] text-ink-500 text-center leading-relaxed">
          빼면 보낸 공유 요청도 함께 취소돼요.
        </p>
      )}

      <Button variant="danger-ghost" block onClick={onRemove}>
        비교에서 빼기
      </Button>
    </div>
  )
}

function ColorSwatch({
  color, index, active, takenBy, onClick,
}: {
  color: CompareColor
  index: number
  active: boolean
  /** another colleague's name already using this color (hint only). */
  takenBy?: string
  onClick: () => void
}) {
  const label = active ? `색 ${index}` : (takenBy ?? `색 ${index}`)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={takenBy ? `${color} 색상 · ${takenBy} 사용 중` : `${color} 색상`}
      aria-pressed={active}
      className="flex flex-col items-center gap-1"
    >
      <span
        className="aspect-square w-full rounded-full grid place-items-center"
        style={{
          background: `var(--${color})`,
          opacity: !active && takenBy ? 0.45 : 1,
          boxShadow: active
            ? `0 0 0 3px #fff, 0 0 0 5px var(--${color})`
            : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
        }}
      >
        {active && (
          <span className="text-white">
            <CheckIcon size={16} />
          </span>
        )}
      </span>
      <span className={`text-[10px] font-semibold max-w-full truncate ${takenBy && !active ? 'text-ink-300' : 'text-ink-500'}`}>
        {label}
      </span>
    </button>
  )
}

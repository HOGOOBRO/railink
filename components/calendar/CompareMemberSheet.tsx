'use client'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { CloseIcon } from '@/components/ui/icons'
import type { CompareEntry } from '@/lib/types/schedule'

/** Tap-an-avatar mini profile sheet. The whole point: tapping a strip pill
 *  used to immediately remove the colleague (and silently cancel the share
 *  on the last-group case). Users tap to *look* — Instagram-story style —
 *  so removal goes behind an explicit button inside the sheet. */
export function CompareMemberSheet({
  member, pending, isDemo, onRemove, onClose,
}: {
  member: CompareEntry
  pending: boolean
  isDemo: boolean
  onRemove: () => void
  onClose: () => void
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

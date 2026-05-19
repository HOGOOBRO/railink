'use client'

import { Button } from '@/components/ui/Button'
import { CloseIcon, PlusIcon, EditIcon, BrandMark } from '@/components/ui/icons'
import { Timeline, type TimelineItem } from './Timeline'
import { DOW_KR } from '@/lib/schedule-utils'

interface DetailSheetProps {
  date: Date
  items: TimelineItem[]
  onClose: () => void
  onAddCompare: () => void
}

export function DetailSheet({ date, items, onClose, onAddCompare }: DetailSheetProps) {
  const workN = items.length
  const dow = DOW_KR[date.getDay()]
  const sheetH = workN === 0 ? '42dvh' : workN > 1 ? '82dvh' : '60dvh'

  return (
    <div className="flex flex-col pb-7" style={{ height: sheetH }}>
      <div className="flex items-start justify-between px-5 pt-2 pb-3">
        <div>
          <h3 className="text-title font-bold tracking-tighter text-ink-900">
            {date.getMonth() + 1}월 {date.getDate()}일{' '}
            <span className="text-ink-500 font-medium">{dow}</span>
          </h3>
          <p className="text-caption text-ink-500 mt-0.5">근무 {workN}명</p>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="px-4 pb-4 flex-1 overflow-y-auto">
        {workN === 0 ? (
          <div className="py-10 px-6 text-center text-callout text-ink-500">
            <div className="w-12 h-12 rounded-lg bg-bg mx-auto mb-2.5 grid place-items-center text-ink-500">
              <BrandMark size={20} />
            </div>
            이날 등록된 비교 동료의 일정이 없어요.
            <div className="h-3" />
            <Button variant="soft" size="sm" onClick={onAddCompare}>
              <PlusIcon size={14} /> 동료 비교 추가
            </Button>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-bold text-ink-500 tracking-wider uppercase my-2 px-1">
              {workN === 1 ? '내 일정' : `비교 중 (${workN})`}
            </p>
            <Timeline items={items} />
            <div className="h-2.5" />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <EditIcon size={14} /> 일정 수정
              </Button>
              <div className="flex-1" />
              <Button variant="soft" size="sm" onClick={onAddCompare}>
                <PlusIcon size={14} /> 동료 비교 추가
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

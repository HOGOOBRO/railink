'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CloseIcon, PlusIcon, EditIcon, BrandMark, ChevronLeftIcon, ChevronRightIcon,
} from '@/components/ui/icons'
import { Timeline, type TimelineItem } from './Timeline'
import { DOW_KR } from '@/lib/schedule-utils'

interface DetailSheetProps {
  date: Date
  items: TimelineItem[]
  onClose: () => void
  onAddCompare: () => void
  onEdit: () => void
  onPrevDay?: () => void
  onNextDay?: () => void
  canPrevDay?: boolean
  canNextDay?: boolean
}

export function DetailSheet({
  date, items, onClose, onAddCompare, onEdit,
  onPrevDay, onNextDay, canPrevDay, canNextDay,
}: DetailSheetProps) {
  const workN = items.length
  const dow = DOW_KR[date.getDay()]
  const sheetH = workN === 0 ? '42dvh' : workN > 1 ? '82dvh' : '60dvh'

  const now = new Date()
  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()

  // Horizontal swipe → previous/next day. Decide on release: only act when the
  // gesture is horizontal-dominant and past a threshold, so vertical scrolling
  // through a long timeline isn't hijacked.
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { swipeStart.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return
    if (dx < 0) onNextDay?.()
    else onPrevDay?.()
  }

  return (
    <div className="flex flex-col" style={{ height: sheetH }} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="flex items-center justify-between px-3 pt-2 pb-3 shrink-0">
        <div className="flex items-center gap-0.5 min-w-0">
          <button
            onClick={onPrevDay}
            disabled={!canPrevDay}
            aria-label="전날"
            className="w-9 h-9 grid place-items-center rounded-full text-ink-700 disabled:opacity-25 shrink-0"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <div className="min-w-0 px-1">
            <h3 className="text-title font-bold tracking-tighter text-ink-900 whitespace-nowrap">
              {date.getMonth() + 1}월 {date.getDate()}일{' '}
              <span className="text-ink-500 font-medium">{dow}</span>
            </h3>
            <p className="text-caption text-ink-500 mt-0.5">근무 {workN}명</p>
          </div>
          <button
            onClick={onNextDay}
            disabled={!canNextDay}
            aria-label="다음날"
            className="w-9 h-9 grid place-items-center rounded-full text-ink-700 disabled:opacity-25 shrink-0"
          >
            <ChevronRightIcon size={20} />
          </button>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 shrink-0"
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
            <Timeline items={items} isToday={isToday} />
          </>
        )}
      </div>

      {/* Sticky action bar — pinned so timeline cards never overlap it */}
      {workN > 0 && (
        <div
          className="shrink-0 flex items-center gap-2 px-4 pt-3 border-t border-line bg-surface"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <Button variant="outline" size="sm" onClick={onEdit}>
            <EditIcon size={14} /> 일정 수정
          </Button>
          <div className="flex-1" />
          <Button variant="soft" size="sm" onClick={onAddCompare}>
            <PlusIcon size={14} /> 동료 비교 추가
          </Button>
        </div>
      )}
    </div>
  )
}

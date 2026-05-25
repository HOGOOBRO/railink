'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { CloseIcon, PlusIcon, EditIcon } from '@/components/ui/icons'
import { Timeline, type TimelineItem } from './Timeline'
import { DOW_KR } from '@/lib/schedule-utils'

interface DetailSheetProps {
  date: Date                                  // day to open scrolled to
  year: number
  month: number                               // 1-12
  today: Date
  itemsForDate: (d: Date) => TimelineItem[]
  onClose: () => void
  onAddCompare: () => void
  onEdit: () => void
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

// Continuous month view: every day stacks vertically and scrolls (swipe up/down
// to move through days); within a day, lanes scroll sideways (swipe right to see
// everyone). Opens scrolled to the tapped day.
export function DetailSheet({
  date, year, month, today, itemsForDate, onClose, onAddCompare, onEdit,
}: DetailSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (scrollRef.current && selectedRef.current) {
        scrollRef.current.scrollTop = selectedRef.current.offsetTop
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const dim = new Date(year, month, 0).getDate()
  const days = Array.from({ length: dim }, (_, i) => i + 1)

  return (
    <div className="flex flex-col" style={{ height: '88dvh' }}>
      <div className="flex items-center justify-between px-5 pt-2 pb-2 shrink-0 border-b border-line">
        <h3 className="text-title font-bold tracking-tighter text-ink-900">{month}월</h3>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
        {days.map(d => {
          const dDate = new Date(year, month - 1, d)
          const items = itemsForDate(dDate)
          const selected = sameDay(dDate, date)
          return (
            <div key={d} ref={selected ? selectedRef : undefined}>
              <div className="sticky top-0 z-10 flex items-baseline gap-2 px-5 py-2 border-b border-line bg-surface/95 backdrop-blur-sm">
                <h4 className="text-[17px] font-bold tracking-tight text-ink-900">
                  {month}월 {d}일{' '}
                  <span className="text-ink-500 font-medium">{DOW_KR[dDate.getDay()]}</span>
                </h4>
                <span className="text-caption text-ink-500">
                  {items.length ? `근무 ${items.length}명` : '근무 없음'}
                </span>
              </div>
              <div className="px-4 py-3">
                {items.length > 0
                  ? <Timeline items={items} isToday={sameDay(dDate, today)} />
                  : <p className="px-1 py-1.5 text-caption text-ink-300">등록된 근무가 없어요.</p>}
              </div>
            </div>
          )
        })}
        <div className="h-4" />
      </div>

      {/* Sticky action bar */}
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
    </div>
  )
}

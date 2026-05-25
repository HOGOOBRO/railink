'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CloseIcon, PlusIcon, EditIcon } from '@/components/ui/icons'
import { MonthTimeline, DAY_PX, type MonthPerson } from './MonthTimeline'
import { DOW_KR } from '@/lib/schedule-utils'

interface DetailSheetProps {
  date: Date            // day to open scrolled to
  year: number
  month: number         // 1-12
  today: Date
  people: MonthPerson[]
  onClose: () => void
  onAddCompare: () => void
  onEdit: () => void
}

export function DetailSheet({
  date, year, month, today, people, onClose, onAddCompare, onEdit,
}: DetailSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dim = new Date(year, month, 0).getDate()
  const [topDay, setTopDay] = useState(date.getDate())

  // Open scrolled to the tapped day; time runs continuously above/below it.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = (date.getDate() - 1) * DAY_PX
    })
    return () => cancelAnimationFrame(raf)
  }, [date])

  function onScroll() {
    if (!scrollRef.current) return
    const d = Math.floor(scrollRef.current.scrollTop / DAY_PX) + 1
    setTopDay(Math.min(Math.max(1, d), dim))
  }

  const headDate = new Date(year, month - 1, topDay)
  const workN = people.filter(p => p.shifts.some(s => s.day === topDay)).length

  return (
    <div className="flex flex-col" style={{ height: '88dvh' }}>
      <div className="flex items-start justify-between px-5 pt-2 pb-2 shrink-0 border-b border-line">
        <div>
          <h3 className="text-title font-bold tracking-tighter text-ink-900">
            {month}월 {topDay}일{' '}
            <span className="text-ink-500 font-medium">{DOW_KR[headDate.getDay()]}</span>
          </h3>
          <p className="text-caption text-ink-500 mt-0.5">근무 {workN}명 · 위아래로 넘겨 다른 날</p>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-y-contain">
        {people.some(p => p.shifts.length > 0)
          ? <MonthTimeline people={people} year={year} month={month} today={today} />
          : <p className="px-5 py-12 text-center text-callout text-ink-500">비교 중인 일정이 없어요.</p>}
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

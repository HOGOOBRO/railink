'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CloseIcon, PlusIcon, EditIcon, CakeIcon } from '@/components/ui/icons'
import { MonthTimeline, DAY_PX, type MonthPerson } from './MonthTimeline'
import { DOW_KR } from '@/lib/schedule-utils'
import { holidayNameFor } from '@/lib/holidays-kr'

interface DetailSheetProps {
  date: Date            // day to open scrolled to
  year: number
  month: number         // 1-12
  today: Date
  people: MonthPerson[]
  /** day-of-month → 그 날 생일인 동료들. 표시 중인 날(topDay)의 생일을 헤더에 노출. */
  birthdaysByDay?: Map<number, { name: string; color: string }[]>
  onClose: () => void
  onAddCompare: () => void
  onEdit: () => void
}

export function DetailSheet({
  date, year, month, today, people, birthdaysByDay, onClose, onAddCompare, onEdit,
}: DetailSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dim = new Date(year, month, 0).getDate()
  const [topDay, setTopDay] = useState(date.getDate())

  // Drop columns with no schedule this month at all — they'd reserve dead horizontal
  // space to the right. Anyone with a shift somewhere in the month (or a pending share,
  // which shows a "수락 대기 중" notice) keeps their column, so scrolling to other days
  // still surfaces their shifts. The remaining columns grow to fill the width.
  const shownPeople = people.filter(p => p.pending || p.shifts.length > 0)

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
  const dow = headDate.getDay()
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(topDay).padStart(2, '0')}`
  const holiday = holidayNameFor(iso)
  // Weekday hue: red for Sun/holiday, blue for Sat, muted otherwise — same rule
  // as the calendar grid so the sheet heading reads consistently.
  const dowClass = holiday || dow === 0 ? 'text-danger' : dow === 6 ? 'text-c1' : 'text-ink-500'
  const workN = shownPeople.filter(p => p.shifts.some(s => s.day === topDay)).length
  const birthdays = birthdaysByDay?.get(topDay) ?? []

  return (
    <div className="flex flex-col" style={{ height: '88dvh' }}>
      <div className="flex items-start justify-between px-5 pt-2 pb-2 shrink-0 border-b border-line">
        <div>
          <h3 className="text-title font-bold tracking-tighter text-ink-900">
            {month}월 {topDay}일{' '}
            <span className={`font-medium ${dowClass}`}>{DOW_KR[dow]}</span>
            {holiday && (
              <span className="align-middle ml-2 text-[12px] font-bold text-danger bg-danger-soft px-2 py-0.5 rounded-pill">
                {holiday}
              </span>
            )}
          </h3>
          <p className="text-caption text-ink-500 mt-0.5">근무 {workN}명 · 위아래로 넘겨 다른 날</p>
          {birthdays.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-caption font-semibold text-ink-700">
              <span style={{ color: birthdays[0].color }}><CakeIcon size={13} /></span>
              {birthdays.map(b => b.name).join(' · ')}님 생일
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto overscroll-contain">
        {shownPeople.length > 0
          ? <MonthTimeline people={shownPeople} year={year} month={month} today={today} />
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

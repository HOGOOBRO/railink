'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { CloseIcon, PlusIcon, EditIcon, CakeIcon } from '@/components/ui/icons'
import { MonthTimeline, DAY_PX, type MonthPerson } from './MonthTimeline'
import { DOW_KR } from '@/lib/schedule-utils'
import { holidayNameFor } from '@/lib/holidays-kr'
import type { CompareColor } from '@/lib/types/schedule'

interface DetailSheetProps {
  date: Date            // day to open scrolled to
  year: number
  month: number         // 1-12
  today: Date
  people: MonthPerson[]
  /** day-of-month → 그 날 생일(나 + 비교 동료). 표시 중인 날(topDay)의 생일을 배너로 노출. */
  birthdaysByDay?: Map<number, { name: string; color: CompareColor | 'brand'; photo?: string }[]>
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

  // Birthday banner (design handoff): names ` · `-joined + ` 님`; 3+ collapse to
  // "{first} 외 N명". Eyebrow is "오늘 생일" when the shown day is the real today.
  const birthdays = birthdaysByDay?.get(topDay) ?? []
  const bdayNames = birthdays.map(b => b.name)
  const bdayIsToday =
    today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === topDay
  const bdayLabel = bdayNames.length <= 2
    ? `${bdayNames.join(' · ')} 님`
    : `${bdayNames[0]} 외 ${bdayNames.length - 1}명`

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
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Birthday banner — directly under the header, above the timeline. Shows
          even on 근무 0명 days. Single pink accent (#E8669B family) ties it to the
          calendar dot so "pink = birthday" reads after one tap. */}
      {birthdays.length > 0 && (
        <div
          className="shrink-0 flex items-center gap-3 mx-4 mt-1 mb-3.5 px-3.5 py-3 rounded-[14px]"
          style={{ background: '#FBEEF4' }}
        >
          <span
            className="w-[42px] h-[42px] rounded-[13px] bg-white grid place-items-center shrink-0"
            style={{ boxShadow: '0 1px 3px rgba(184,58,110,.12)' }}
          >
            <span style={{ color: '#E8669B' }}><CakeIcon size={24} /></span>
          </span>
          <div className="min-w-0">
            <p
              className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase"
              style={{ color: '#C24B82' }}
            >
              {bdayIsToday ? '오늘 생일' : '생일'}
            </p>
            <p className="text-[15px] font-bold mt-0.5 truncate" style={{ color: '#7E2A52' }}>
              {bdayLabel}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center">
            {birthdays.slice(0, 3).map((b, i) => (
              <span
                key={i}
                className="rounded-full"
                style={{ boxShadow: '0 0 0 2px #FBEEF4', marginLeft: i > 0 ? -8 : 0 }}
              >
                <Avatar
                  name={b.name}
                  photo={b.photo}
                  color={b.color}
                  size="sm"
                  className="!w-[30px] !h-[30px] !text-[11px]"
                />
              </span>
            ))}
            {birthdays.length > 3 && (
              <span
                className="grid place-items-center w-[30px] h-[30px] rounded-full bg-white text-[11px] font-bold"
                style={{ boxShadow: '0 0 0 2px #FBEEF4', marginLeft: -8, color: '#C24B82' }}
              >
                +{birthdays.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

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

'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { CloseIcon, PlusIcon, EditIcon, CakeIcon, PlaceIcon } from '@/components/ui/icons'
import { MonthTimeline, DAY_PX, type MonthPerson, type ApptCard, type ShiftDetail } from './MonthTimeline'
import { DOW_KR, fmtClock } from '@/lib/schedule-utils'
import { routeForFlights } from '@/lib/airline-routes'
import { holidayNameFor } from '@/lib/holidays-kr'
import type { CompareColor } from '@/lib/types/schedule'

/** 소요/비행 시간(시작~끝 decimal hour 차)을 "N시간 M분"으로. 인천 기준 출·도착의
 *  차이 = 실제 비행시간이라, 이걸 명시하면 시차 혼동이 사라진다. */
function fmtDuration(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

interface DetailSheetProps {
  date: Date            // day to open scrolled to
  year: number
  month: number         // 1-12
  today: Date
  people: MonthPerson[]
  /** day-of-month → 그 날 생일(나 + 비교 동료). 표시 중인 날(topDay)의 생일을 배너로 노출. */
  birthdaysByDay?: Map<number, { name: string; color: CompareColor | 'brand'; photo?: string }[]>
  /** 이 달의 약속(나 + 비교 동료 참여분). 표시 중인 날의 건수를 헤더에 노출. */
  appointments?: ApptCard[]
  /** 약속이 아직 fetch 중 — 건수 대신 '약속 확인 중'을 보여 0건으로 오해되지 않게. */
  apptsLoading?: boolean
  selfUid: string
  /** 보는 사람의 소속 항공사. 있으면 근무 상세 라벨을 근무코드/편명으로(KTX는 다이아/열번). */
  airline?: string
  onDeleteAppt?: (id: string) => void
  onRespond?: (id: string, accept: boolean) => void
  onClose: () => void
  onAddCompare: () => void
  onEdit: () => void
}

export function DetailSheet({
  date, year, month, today, people, birthdaysByDay, appointments = [], apptsLoading = false, selfUid, airline, onDeleteAppt, onRespond, onClose, onAddCompare, onEdit,
}: DetailSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dim = new Date(year, month, 0).getDate()
  const [topDay, setTopDay] = useState(date.getDate())
  // Tapped appointment pending the detail/delete dialog (handoff §11).
  const [confirm, setConfirm] = useState<ApptCard | null>(null)
  // Tapped shift → read-only detail (surfaces full 열번/dia, incl. parts a docked
  // appointment covers and the train no. that truncates on the card).
  const [shiftDetail, setShiftDetail] = useState<ShiftDetail | null>(null)

  // Drop columns with no schedule this month at all — they'd reserve dead horizontal
  // space to the right. Anyone with a shift somewhere in the month (or a pending share,
  // which shows a "수락 대기 중" notice) keeps their column, so scrolling to other days
  // still surfaces their shifts. The remaining columns grow to fill the width.
  // 약속 참여자도 유지 — 근무가 없는 달(특히 초대 배너로 점프한 미래 달)에 내
  // 컬럼이 빠지면 약속 카드가 놓일 곳이 없어 수락/거절 경로가 통째로 막힌다.
  const apptUids = new Set(appointments.flatMap(a => a.participants))
  const shownPeople = people.filter(p => p.pending || p.shifts.length > 0 || apptUids.has(p.uid))

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
  // Distinct appointments on the shown day (a group appt counts once).
  const apptN = new Set(appointments.filter(a => a.day === topDay).map(a => a.id)).size

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
    <div className="relative flex flex-col" style={{ height: '88dvh' }}>
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
          <p className="text-caption text-ink-500 mt-0.5">근무 {workN}명{apptsLoading ? ' · 약속 확인 중' : apptN ? ` · 약속 ${apptN}` : ''} · 위아래로 넘겨 다른 날</p>
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
          ? <MonthTimeline people={shownPeople} year={year} month={month} today={today} appointments={appointments} onTapAppt={setConfirm} onTapShift={setShiftDetail} />
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

      {/* Tap-an-appointment → detail/delete dialog (handoff §11; replaces the
          per-card × and surfaces the end time hidden on short cards). */}
      {confirm && (
        <div className="absolute inset-0 z-[40]">
          <div onClick={() => setConfirm(null)} className="absolute inset-0 animate-backdrop-in" style={{ background: 'rgba(13,30,55,0.4)' }} aria-hidden="true" />
          <div className="absolute left-6 right-6 bg-surface rounded-[18px] shadow-sh4 px-5 pt-5 pb-4 animate-fade-in" style={{ top: '38%' }}>
            <div className="text-[17px] font-extrabold tracking-tight text-ink-900">{confirm.title}</div>
            <div className="text-callout text-ink-700 mt-[5px]">
              {month}월 {confirm.day}일 {DOW_KR[new Date(year, month - 1, confirm.day).getDay()]}요일
              {!confirm.untimed && (
                <span className="font-en"> · {fmtClock(confirm.start)}{confirm.hasEnd ? ` – ${fmtClock(confirm.end)}` : ''}</span>
              )}
            </div>
            {confirm.place && (
              <div className="flex items-start gap-1.5 text-callout text-ink-700 mt-2">
                <span className="text-ink-500 shrink-0 mt-0.5"><PlaceIcon size={14} /></span>
                <span className="min-w-0">{confirm.place}</span>
              </div>
            )}
            {confirm.memo && (
              <div className="text-callout text-ink-500 mt-1.5 whitespace-pre-wrap break-words">{confirm.memo}</div>
            )}
            {(() => {
              const isOwner = confirm.ownerUid === selfUid
              const isPendingInvitee = !isOwner && confirm.myStatus === 'pending'
              return (
                <>
                  {isOwner && confirm.participants.length > 1 && (
                    <div className="text-caption text-ink-500 mt-2">참여자 {confirm.participants.length}명에게도 삭제 알림이 가요.</div>
                  )}
                  {isPendingInvitee && (
                    <div className="text-caption text-ink-500 mt-2">초대받은 약속이에요. 수락하면 내 캘린더에 함께 표시돼요.</div>
                  )}
                  <div className="flex gap-2 mt-4">
                    {isPendingInvitee ? (
                      <>
                        <button onClick={() => { onRespond?.(confirm.id, false); setConfirm(null) }} className="flex-1 h-11 rounded-md border border-line-2 bg-surface text-ink-700 text-callout font-bold">거절</button>
                        <button onClick={() => { onRespond?.(confirm.id, true); setConfirm(null) }} className="flex-1 h-11 rounded-md bg-brand text-ink-on-brand text-callout font-bold">수락</button>
                      </>
                    ) : isOwner ? (
                      <>
                        <button onClick={() => setConfirm(null)} className="flex-1 h-11 rounded-md border border-line-2 bg-surface text-ink-700 text-callout font-bold">취소</button>
                        <button onClick={() => { onDeleteAppt?.(confirm.id); setConfirm(null) }} className="flex-1 h-11 rounded-md bg-danger-soft text-danger text-callout font-bold">삭제</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirm(null)} className="w-full h-11 rounded-md bg-brand-050 text-brand text-callout font-bold">확인</button>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Tap-a-shift → read-only detail. Surfaces the full 열번 (which truncates on
          the card and can be hidden behind a docked appointment). */}
      {shiftDetail && (
        <div className="absolute inset-0 z-[40]">
          <div onClick={() => setShiftDetail(null)} className="absolute inset-0 animate-backdrop-in" style={{ background: 'rgba(13,30,55,0.4)' }} aria-hidden="true" />
          <div className="absolute left-6 right-6 bg-surface rounded-[18px] shadow-sh4 px-5 pt-5 pb-4 animate-fade-in" style={{ top: '38%' }}>
            <div className="flex items-center gap-2">
              <div className="text-[17px] font-extrabold tracking-tight text-ink-900">
                {shiftDetail.name} <span className="text-ink-500 font-bold">· 근무</span>
              </div>
              {shiftDetail.dir && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-pill bg-brand-050 text-brand">{shiftDetail.dir}</span>
              )}
            </div>
            {shiftDetail.standby ? (
              /* STBY — 시각 미상, 하루 종일 대기. */
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-caption text-ink-500 w-12 shrink-0">{airline ? '근무코드' : '구분'}</span>
                <span className="font-bold text-callout text-ink-900 font-en">{shiftDetail.dia}</span>
                <span className="text-caption text-ink-500">· 하루 종일 대기</span>
              </div>
            ) : shiftDetail.noTime ? (
              shiftDetail.codeOnly ? (
                /* 대기·훈련 등 원래 시간이 없는 코드 — 코드만 깔끔히. */
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="text-caption text-ink-500 w-12 shrink-0">{airline ? '근무코드' : '구분'}</span>
                  <span className="font-bold text-callout text-ink-900">{shiftDetail.dia}</span>
                </div>
              ) : (
                <div className="text-callout text-ink-700 mt-2">출퇴근 시간이 입력되지 않은 근무예요.</div>
              )
            ) : (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {shiftDetail.dia && (
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-ink-500 w-12 shrink-0">{airline ? '근무코드' : '다이아'}</span>
                    <span className="font-en text-callout font-bold text-ink-900">{shiftDetail.dia}</span>
                  </div>
                )}
                {shiftDetail.legs && shiftDetail.legs.length ? (
                  /* 다중 레그(아시아나 등): 구간별 편명·노선·출도착(현지+한국시간). */
                  <div className="flex flex-col">
                    {shiftDetail.legs.map((lg, i) => (
                      <div key={i} className="flex items-start gap-2 py-1.5 border-t border-line first:border-t-0 first:pt-0">
                        <span className="font-en text-caption font-bold shrink-0 mt-0.5 px-1.5 py-0.5 rounded-xs bg-brand-050 text-brand whitespace-nowrap">{lg.flight || lg.route || '구간'}</span>
                        <span className="flex flex-col min-w-0 gap-0.5">
                          {lg.depLabel && <span className="font-en text-callout font-bold text-ink-900">{lg.depLabel}</span>}
                          {lg.arrLabel && <span className="font-en text-caption font-bold text-ink-700">↓ {lg.arrLabel}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : shiftDetail.depLabel && shiftDetail.arrLabel ? (
                  /* 국제선: 각 공항을 그 공항 현지시각으로(항공권식) + 비행시간 별도. */
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-ink-500 w-12 shrink-0">출발</span>
                      <span className="font-en text-callout font-bold text-ink-900">{shiftDetail.depLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-ink-500 w-12 shrink-0">도착</span>
                      <span className="font-en text-callout font-bold text-ink-900">{shiftDetail.arrLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-ink-500 w-12 shrink-0">비행</span>
                      <span className="text-callout font-bold text-ink-900">{fmtDuration(shiftDetail.end - shiftDetail.start)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="text-caption text-ink-500 w-12 shrink-0 mt-0.5">시간</span>
                    <span className="flex flex-col min-w-0">
                      <span className="font-en text-callout font-bold text-ink-900">{fmtClock(shiftDetail.start)} – {fmtClock(shiftDetail.end)}</span>
                      <span className="text-caption text-ink-500 mt-0.5">{fmtDuration(shiftDetail.end - shiftDetail.start)}</span>
                    </span>
                  </div>
                )}
                {!shiftDetail.legs?.length && shiftDetail.trainNr && (
                  <div className="flex items-start gap-2">
                    <span className="text-caption text-ink-500 w-12 shrink-0 mt-0.5">{airline ? '편명' : '열번'}</span>
                    <span className="font-en text-callout font-bold text-ink-900">{shiftDetail.trainNr.split(/\s*[·,]\s*|\s+/).filter(Boolean).join(' · ')}</span>
                  </div>
                )}
                {(shiftDetail.route ?? routeForFlights(airline, shiftDetail.trainNr)) && (
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-ink-500 w-12 shrink-0">노선</span>
                    <span className="font-en text-callout font-bold text-ink-900">{shiftDetail.route ?? routeForFlights(airline, shiftDetail.trainNr)}</span>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setShiftDetail(null)} className="w-full h-11 mt-4 rounded-md bg-brand-050 text-brand text-callout font-bold">확인</button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

/* 약속 잡기 (Appointment) creation wizard — a FULL-SCREEN modal (mirrors
 * UploadModal: fixed, app-frame width, slides up), deliberately NOT a bottom
 * sheet so it never stacks on the day-detail sheet (handoff §3 / decision #7).
 *   group: mode → who → when(다 같이 쉬는 날) → what → done
 *   solo : mode → pick(날짜) → what → done
 * Entered from a specific day → the date step is skipped (preday).
 * Brand navy only; appointments are distinguished by the pin, not a new hue.
 */

import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { CbInput } from '@/components/ui/CbInput'
import { CbTimeField } from '@/components/ui/CbSelect'
import {
  CloseIcon, ChevronLeftIcon, ChevronRightIcon, CheckIcon, PlusIcon,
  UsersIcon, PersonIcon, CalendarIcon, PinIcon, PlaceIcon,
} from '@/components/ui/icons'
import { DOW_KR, MONTHS_EN, buildMonthCells } from '@/lib/schedule-utils'
import { holidayNameFor } from '@/lib/holidays-kr'
import { findFreeDays, findOverlaps, isPersonOff, type EntryOf } from '@/lib/appointment-utils'
import type { Appointment, CompareColor, CompareEntry } from '@/lib/types/schedule'

type AvatarColor = 'brand' | CompareColor
interface YMD { y: number; m: number; d: number }
interface Person { name: string; photo?: string; color: AvatarColor }

interface WizardProps {
  selfUid: string
  selfName: string
  selfPhoto?: string
  compares: CompareEntry[]
  preday?: YMD | null
  year: number
  month: number
  today: Date
  entryOf: EntryOf
  onClose: () => void
  onComplete: (appt: Omit<Appointment, 'id'>, message: string) => void
}

const isoOf = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const dowOf = (y: number, m: number, d: number) => DOW_KR[new Date(y, m - 1, d).getDay()]

export function AppointmentWizard(props: WizardProps) {
  const { selfUid, selfName, selfPhoto, compares, preday, year, month, today, entryOf, onClose, onComplete } = props

  const personOf = (uid: string): Person =>
    uid === selfUid
      ? { name: selfName, photo: selfPhoto, color: 'brand' }
      : (() => {
          const c = compares.find(x => x.uid === uid)
          return { name: c?.name ?? '동료', photo: c?.photo, color: (c?.color ?? 'c1') as AvatarColor }
        })()

  const [mode, setMode] = useState<'group' | 'solo' | null>(null)
  const [step, setStep] = useState<'mode' | 'who' | 'when' | 'pick' | 'what' | 'done'>('mode')
  const [parts, setParts] = useState<string[]>(compares.map(c => c.uid))
  const [chosen, setChosen] = useState<YMD | null>(preday ?? null)
  const [picker, setPicker] = useState(false)
  const [form, setForm] = useState({ title: '', start: '', end: '', place: '', memo: '', visibility: 'busy' as 'busy' | 'title' })
  const [built, setBuilt] = useState<Omit<Appointment, 'id'> | null>(null)
  const setF = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  function pickMode(m: 'group' | 'solo') {
    setMode(m)
    if (preday) { setChosen(preday); setStep(m === 'group' ? 'who' : 'what') }
    else setStep(m === 'group' ? 'who' : 'pick')
  }

  function goConfirm() {
    if (!chosen || !mode) return
    const title = form.title.trim() || (mode === 'group' ? '동료 약속' : '내 일정')
    const appt: Omit<Appointment, 'id'> = {
      type: mode,
      date: isoOf(chosen.y, chosen.m, chosen.d),
      title,
      start: form.start.trim() || undefined,
      end: form.end.trim() || undefined,
      place: form.place.trim() || undefined,
      memo: form.memo.trim() || undefined,
      ownerUid: selfUid,
      participants: mode === 'group' ? [selfUid, ...parts] : [selfUid],
      visibility: mode === 'solo' ? form.visibility : undefined,
    }
    setBuilt(appt)
    setStep('done')
  }

  function finish() {
    if (!built) return
    onComplete(
      built,
      mode === 'group' ? `${built.title} · ${parts.length}명에게 초대를 보냈어요.` : '일정을 추가했어요.',
    )
  }

  return (
    // Outer = centering only (transform: translateX(-50%)); inner = the slide-up.
    // Splitting them keeps the horizontal centering off the animated `transform`,
    // which would otherwise be overwritten by translateY mid-animation (the modal
    // would rise shifted right, then snap to center).
    <div className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-app-frame z-modal">
      <div className="absolute inset-0 bg-surface flex flex-col animate-slide-up">
      {/* safe-area top spacer with a desktop-review floor (env() is 0 in a
          browser, which would otherwise glue the header to the very top). */}
      <div style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }} className="shrink-0" />

      {step === 'mode' && (
        <>
          <WizHead title="어떤 일정을 추가할까요?" sub="동료와 약속을 잡거나 내 일정을 추가해요" onClose={onClose} />
          <WizBody>
            <div className="flex flex-col gap-3">
              <ModeCard icon={<UsersIcon size={24} />} title="동료와 약속" desc="다 같이 쉬는 날을 찾아 약속을 잡아요" onClick={() => pickMode('group')} accent />
              <ModeCard icon={<PersonIcon size={24} />} title="내 일정" desc="동료에게는 '일정 있음'으로 보여요" onClick={() => pickMode('solo')} />
            </div>
            {preday && (
              <div className="flex items-center gap-2 justify-center mt-[18px] text-caption text-ink-500">
                <CalendarIcon size={15} /> {preday.m}월 {preday.d}일 {dowOf(preday.y, preday.m, preday.d)}요일에 잡는 중
              </div>
            )}
          </WizBody>
        </>
      )}

      {step === 'who' && (
        <>
          <WizHead title="누구와 약속을 잡을까요?" sub="비교 중인 동료 중에서 골라요" onBack={() => setStep('mode')} onClose={onClose} />
          <WizBody className="!px-3">
            {compares.length === 0 ? (
              <p className="px-2 py-12 text-center text-callout text-ink-500 leading-relaxed">
                비교 중인 동료가 없어요.<br />먼저 캘린더에서 동료를 추가해 주세요.
              </p>
            ) : compares.map(c => {
              const on = parts.includes(c.uid)
              return (
                <button
                  key={c.uid}
                  onClick={() => setParts(p => on ? p.filter(x => x !== c.uid) : [...p, c.uid])}
                  className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-[14px] text-left"
                >
                  <Avatar name={c.name} photo={c.photo} color={c.color} size="lg" className="!w-11 !h-11" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-ink-900">{c.name}</div>
                    {c.office && <div className="text-caption text-ink-500">{c.office}</div>}
                  </div>
                  <span
                    className={`w-6 h-6 rounded-[7px] grid place-items-center shrink-0 border-[1.5px] ${
                      on ? 'bg-brand border-brand text-white' : 'bg-surface border-line-2'
                    }`}
                  >
                    {on && <CheckIcon size={14} />}
                  </span>
                </button>
              )
            })}
          </WizBody>
          <WizFoot>
            <button
              onClick={() => setStep(preday ? 'what' : 'when')}
              disabled={parts.length === 0}
              className="w-full h-btn rounded-md bg-brand text-ink-on-brand font-semibold text-body disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {parts.length}명과 약속 잡기
            </button>
          </WizFoot>
        </>
      )}

      {step === 'when' && !picker && (
        <WhenFinder
          selfUid={selfUid} parts={parts} year={year} month={month} today={today}
          entryOf={entryOf} personOf={personOf}
          onBack={() => setStep('who')} onClose={onClose}
          onDirect={() => setPicker(true)}
          onPick={(d) => { setChosen(d); setStep('what') }}
        />
      )}

      {step === 'when' && picker && (
        <>
          <WizHead title="날짜 직접 고르기" onBack={() => setPicker(false)} onClose={onClose} />
          <MiniCal
            participantIds={[selfUid, ...parts]} year={year} month={month} today={today}
            entryOf={entryOf} onPick={(d) => { setChosen(d); setStep('what') }}
          />
        </>
      )}

      {step === 'pick' && (
        <>
          <WizHead title="언제로 잡을까요?" sub="일정을 넣을 날을 골라요" onBack={() => setStep('mode')} onClose={onClose} />
          <MiniCal
            participantIds={[selfUid]} solo year={year} month={month} today={today}
            entryOf={entryOf} onPick={(d) => { setChosen(d); setStep('what') }}
          />
        </>
      )}

      {step === 'what' && chosen && mode && (
        <WhatStep
          mode={mode} chosen={chosen} parts={parts} selfUid={selfUid}
          form={form} setF={setF} entryOf={entryOf} personOf={personOf}
          onBack={() => setStep(preday ? 'mode' : (mode === 'group' ? 'when' : 'pick'))}
          onChangeDate={() => { if (mode === 'group') { setPicker(true); setStep('when') } else setStep('pick') }}
          onClose={onClose} onConfirm={goConfirm}
        />
      )}

      {step === 'done' && built && mode && (
        <DoneStep mode={mode} appt={built} parts={parts} personOf={personOf} onFinish={finish} />
      )}
      </div>
    </div>
  )
}

/* ── frame chrome ── */
function WizHead({ title, sub, onBack, onClose }: { title: string; sub?: string; onBack?: () => void; onClose: () => void }) {
  return (
    <div className="px-3 pt-1 pb-3 flex items-center gap-1.5 border-b border-line shrink-0">
      {onBack
        ? <button onClick={onBack} aria-label="뒤로" className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"><ChevronLeftIcon size={20} /></button>
        : <div className="w-2" />}
      <div className="flex-1 min-w-0">
        <div className="text-[18px] font-extrabold tracking-tight text-ink-900">{title}</div>
        {sub && <div className="text-[12.5px] text-ink-500 mt-px">{sub}</div>}
      </div>
      <button onClick={onClose} aria-label="닫기" className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"><CloseIcon size={18} /></button>
    </div>
  )
}
function WizBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex-1 overflow-y-auto px-4 pt-3.5 pb-2 ${className ?? ''}`}>{children}</div>
}
function WizFoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 border-t border-line bg-surface shrink-0" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
      {children}
    </div>
  )
}

function ModeCard({ icon, title, desc, onClick, accent }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3.5 p-4 rounded-[18px] text-left border-[1.5px] ${accent ? 'bg-brand-050 border-brand-100' : 'bg-surface border-line'}`}
    >
      <div className={`w-[52px] h-[52px] rounded-lg grid place-items-center shrink-0 ${accent ? 'bg-brand text-white' : 'bg-brand-050 text-brand'}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-bold text-ink-900">{title}</div>
        <div className="text-callout text-ink-700 mt-0.5 leading-snug">{desc}</div>
      </div>
      <span className={accent ? 'text-brand' : 'text-ink-300'}><ChevronRightIcon size={18} /></span>
    </button>
  )
}

/* ── "다 같이 쉬는 날" finder ── */
function WhenFinder({
  selfUid, parts, year, month, today, entryOf, personOf, onBack, onClose, onDirect, onPick,
}: {
  selfUid: string; parts: string[]; year: number; month: number; today: Date
  entryOf: EntryOf; personOf: (uid: string) => Person
  onBack: () => void; onClose: () => void; onDirect: () => void; onPick: (d: YMD) => void
}) {
  const ids = [selfUid, ...parts]
  const [ym, setYm] = useState({ y: year, m: month })
  const isCur = ym.y === today.getFullYear() && ym.m === today.getMonth() + 1
  const fromDay = isCur ? today.getDate() : 1
  const days = findFreeDays(ids, ym.y, ym.m, fromDay, entryOf)
  const allFree = days.filter(d => d.busyIds.length === 0)
  const almost = days.filter(d => d.busyIds.length === 1)

  function shift(delta: number) {
    setYm(p => {
      const m = p.m + delta
      if (m < 1) return { y: p.y - 1, m: 12 }
      if (m > 12) return { y: p.y + 1, m: 1 }
      return { y: p.y, m }
    })
  }

  const Row = ({ day }: { day: typeof days[number] }) => {
    const all = day.busyIds.length === 0
    const busyNames = day.busyIds.map(id => (id === selfUid ? '나' : personOf(id).name))
    return (
      <button
        onClick={() => onPick({ y: ym.y, m: ym.m, d: day.d })}
        className="w-full flex items-center gap-3 p-3 rounded-[16px] bg-surface border border-line text-left mb-2"
      >
        <div className="w-[46px] shrink-0 text-center">
          <div className="font-en text-[22px] font-bold leading-none text-ink-900">{day.d}</div>
          <div className="text-[11px] text-ink-500 mt-0.5">{ym.m}월 {DOW_KR[day.dow]}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[14.5px] font-bold text-ink-900">{all ? `${day.freeIds.length}명 모두 휴무` : `${busyNames.join('·')} 님만 근무`}</span>
            {day.holiday && <span className="text-[10px] font-bold text-ink-700 bg-bg px-1.5 py-0.5 rounded-pill">{day.holiday}</span>}
          </div>
          <div className="flex items-center gap-[5px] mt-[7px]">
            {ids.map(id => {
              const p = personOf(id)
              const busy = day.busyIds.includes(id)
              return (
                <span key={id} className="inline-flex" style={{ opacity: busy ? 0.3 : 1, filter: busy ? 'grayscale(1)' : 'none' }}>
                  <Avatar name={p.name} photo={p.photo} color={p.color} size="sm" className="!w-6 !h-6 !text-[9px]" />
                </span>
              )
            })}
          </div>
        </div>
        <span className="text-ink-300 shrink-0"><ChevronRightIcon size={18} /></span>
      </button>
    )
  }

  return (
    <>
      <WizHead title="다 같이 쉬는 날" sub={`나 + ${parts.length}명 모두 비는 날을 찾았어요`} onBack={onBack} onClose={onClose} />
      <div className="px-4 pt-3 pb-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} aria-label="이전 달" className="w-8 h-8 grid place-items-center rounded-full text-ink-700"><ChevronLeftIcon size={18} /></button>
          <span className="font-en text-callout font-semibold text-ink-900 w-[88px] text-center">{MONTHS_EN[ym.m - 1]} {ym.y}</span>
          <button onClick={() => shift(1)} aria-label="다음 달" className="w-8 h-8 grid place-items-center rounded-full text-ink-700"><ChevronRightIcon size={18} /></button>
        </div>
        <button onClick={onDirect} className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-brand bg-brand-050 rounded-pill px-3 py-1.5">
          <CalendarIcon size={14} /> 직접 고르기
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1">
        {days.length === 0 && (
          <div className="py-10 px-5 text-center text-callout text-ink-500 leading-relaxed">
            이 달엔 다 같이 비는 날이 없어요.<br />다른 달을 보거나 직접 날짜를 골라보세요.
          </div>
        )}
        {allFree.length > 0 && (
          <>
            <div className="mt-1 mb-2.5 mx-0.5 text-caption font-extrabold text-ink-500 tracking-wide">모두 쉬는 날 · {allFree.length}일</div>
            {allFree.map(d => <Row key={d.iso} day={d} />)}
          </>
        )}
        {almost.length > 0 && (
          <>
            <div className="mt-3.5 mb-2.5 mx-0.5 text-caption font-extrabold text-ink-500 tracking-wide">거의 다 모여요 · 한 명만 근무</div>
            {almost.map(d => <Row key={d.iso} day={d} />)}
          </>
        )}
      </div>
    </>
  )
}

/* ── manual month picker ── */
function MiniCal({
  participantIds, solo, year, month, today, entryOf, onPick,
}: {
  participantIds: string[]; solo?: boolean; year: number; month: number; today: Date
  entryOf: EntryOf; onPick: (d: YMD) => void
}) {
  const [ym, setYm] = useState({ y: year, m: month })
  const weeks = buildMonthCells(ym.y, ym.m)
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  function shift(delta: number) {
    setYm(p => {
      const m = p.m + delta
      if (m < 1) return { y: p.y - 1, m: 12 }
      if (m > 12) return { y: p.y + 1, m: 1 }
      return { y: p.y, m }
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
      <div className="flex items-center justify-between py-1 pb-2.5">
        <button onClick={() => shift(-1)} aria-label="이전 달" className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"><ChevronLeftIcon size={20} /></button>
        <div className="font-en text-subtitle font-semibold text-ink-900">{MONTHS_EN[ym.m - 1]} {ym.y}</div>
        <button onClick={() => shift(1)} aria-label="다음 달" className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"><ChevronRightIcon size={20} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DOW_KR.map((n, i) => (
          <div key={n} className={`text-center text-[11px] font-bold ${i === 0 ? 'text-danger' : i === 6 ? 'text-c1' : 'text-ink-500'}`}>{n}</div>
        ))}
      </div>
      {weeks.map((wk, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {wk.map((c, ci) => {
            if (c.isOther || !c.iso) return <div key={ci} className="h-[46px]" />
            const iso = c.iso
            const dt = new Date(ym.y, ym.m - 1, c.d)
            const past = dt < todayMid
            const dow = dt.getDay()
            const holiday = holidayNameFor(iso)
            const myEntry = entryOf(participantIds[0], iso)
            const iWork = !!myEntry && !isPersonOff(myEntry, iso)
            const freeN = participantIds.filter(id => isPersonOff(entryOf(id, iso), iso)).length
            const someData = participantIds.some(id => entryOf(id, iso) !== undefined) || !!holiday
            const allFree = !solo && someData && freeN === participantIds.length
            const tone = holiday || dow === 0 ? 'text-danger' : dow === 6 ? 'text-c1' : 'text-ink-900'
            return (
              <button
                key={ci}
                disabled={past}
                onClick={() => onPick({ y: ym.y, m: ym.m, d: c.d })}
                className={`h-[46px] grid place-items-center relative ${past ? 'opacity-[.32] cursor-default' : 'cursor-pointer'}`}
              >
                <div className={`w-9 h-9 rounded-[11px] grid place-items-center relative ${allFree ? 'bg-brand-050' : ''}`}>
                  <span className={`font-en text-[14.5px] ${allFree ? 'font-bold text-brand-700' : `font-medium ${tone}`}`}>{c.d}</span>
                  {solo && iWork && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand" />}
                </div>
              </button>
            )
          })}
        </div>
      ))}
      <div className="flex gap-3.5 justify-center pt-3 text-[11.5px] text-ink-500">
        {solo
          ? <span className="inline-flex items-center gap-1.5"><span className="w-[5px] h-[5px] rounded-full bg-brand" /> 내 근무일</span>
          : <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-[5px] bg-brand-050 border border-brand-100" /> 다 같이 쉬는 날</span>}
      </div>
    </div>
  )
}

/* ── details form ── */
function WhatStep({
  mode, chosen, parts, selfUid, form, setF, entryOf, personOf, onBack, onChangeDate, onClose, onConfirm,
}: {
  mode: 'group' | 'solo'; chosen: YMD; parts: string[]; selfUid: string
  form: { title: string; start: string; end: string; place: string; memo: string; visibility: 'busy' | 'title' }
  setF: (k: 'title' | 'start' | 'end' | 'place' | 'memo' | 'visibility', v: string) => void
  entryOf: EntryOf; personOf: (uid: string) => Person
  onBack: () => void; onChangeDate: () => void; onClose: () => void; onConfirm: () => void
}) {
  const [showEnd, setShowEnd] = useState(!!form.end)
  const iso = isoOf(chosen.y, chosen.m, chosen.d)
  const dow = dowOf(chosen.y, chosen.m, chosen.d)
  const myEntry = entryOf(selfUid, iso)
  const iWork = !!myEntry && !isPersonOff(myEntry, iso)
  const partIds = mode === 'group' ? [selfUid, ...parts] : [selfUid]
  const overlaps = findOverlaps(partIds, iso, form.start || undefined, form.end || undefined, entryOf)

  return (
    <>
      <WizHead title="약속 내용" sub="제목과 시간을 정해요" onBack={onBack} onClose={onClose} />
      <WizBody>
        <button onClick={onChangeDate} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-[14px] bg-brand-050 border border-brand-100 text-left mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-body font-bold text-brand-700">{chosen.m}월 {chosen.d}일 {dow}요일</div>
            <div className="text-caption text-ink-700 mt-0.5">{mode === 'group' ? `나 + ${parts.length}명 함께` : (iWork ? '이 날은 내 근무가 있어요' : '내 휴무일')}</div>
          </div>
          <span className="text-caption font-bold text-brand shrink-0">날짜 변경</span>
        </button>

        <FieldLbl>제목</FieldLbl>
        <CbInput value={form.title} onChange={v => setF('title', v)} placeholder={mode === 'group' ? '예) 동기 모임' : '예) 치과 예약'} />

        <div className="h-[18px]" />
        <FieldLbl>시간 <span className="text-ink-300 font-medium">(선택)</span></FieldLbl>
        <CbTimeField value={form.start} onChange={v => setF('start', v)} />
        <div className="mt-2.5">
          {showEnd ? (
            <div className="flex items-start gap-2.5">
              <span className="text-caption font-bold text-ink-700 shrink-0 w-9 leading-[48px]">종료</span>
              <div className="flex-1 min-w-0"><CbTimeField value={form.end} onChange={v => setF('end', v)} /></div>
              <button onClick={() => { setF('end', ''); setShowEnd(false) }} aria-label="종료 시간 제거" className="w-[34px] h-[34px] grid place-items-center rounded-full text-ink-300 shrink-0 mt-1.5"><CloseIcon size={16} /></button>
            </div>
          ) : (
            <button onClick={() => setShowEnd(true)} className="inline-flex items-center gap-1.5 text-brand text-callout font-bold px-0.5">
              <PlusIcon size={14} /> 종료 시간 추가
            </button>
          )}
        </div>

        {overlaps.length > 0 && (
          <div className="mt-2.5 rounded-[14px] px-3.5 pt-3 pb-[13px]" style={{ background: 'color-mix(in oklab, #D97706 15%, white)' }}>
            <div className="text-[10.5px] font-extrabold tracking-[0.06em]" style={{ color: '#B45309' }}>근무 겹침</div>
            <div className="flex flex-col gap-1 mt-[7px]">
              {overlaps.map(o => (
                <div key={o.uid} className="flex items-baseline gap-2">
                  <span className="text-callout font-bold" style={{ color: '#713F12' }}>{o.uid === selfUid ? '나' : personOf(o.uid).name}</span>
                  <span className="flex-1" />
                  <span className="font-en text-caption font-medium" style={{ color: '#A16207' }}>{o.entry.startTime} – {o.entry.endTime} 근무</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="h-[18px]" />
        <FieldLbl>장소 <span className="text-ink-300 font-medium">(선택)</span></FieldLbl>
        <CbInput value={form.place} onChange={v => setF('place', v)} placeholder="예) 서울역 2번 출구" />

        <div className="h-4" />
        <FieldLbl>메모 <span className="text-ink-300 font-medium">(선택)</span></FieldLbl>
        <CbInput value={form.memo} onChange={v => setF('memo', v)} placeholder="간단한 메모" />

        {mode === 'solo' && (
          <>
            <div className="h-[18px]" />
            <FieldLbl>동료에게 어떻게 보일까요?</FieldLbl>
            <div className="flex flex-col gap-2">
              {([
                { v: 'busy', t: "'일정 있음'으로만 표시", s: '내용은 보이지 않아요' },
                { v: 'title', t: '제목까지 공개', s: '비교 중인 동료가 제목을 볼 수 있어요' },
              ] as const).map(o => {
                const on = form.visibility === o.v
                return (
                  <button
                    key={o.v}
                    onClick={() => setF('visibility', o.v)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-[13px] text-left bg-surface border-[1.5px] ${on ? 'border-brand' : 'border-line-2'}`}
                  >
                    <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 border-[1.5px] ${on ? 'border-brand' : 'border-line-2'}`}>
                      {on && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] font-bold text-ink-900">{o.t}</span>
                      <span className="block text-caption text-ink-500 mt-px">{o.s}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </WizBody>

      <WizFoot>
        <button onClick={onConfirm} className="w-full h-btn rounded-md bg-brand text-ink-on-brand font-semibold text-body">
          {mode === 'group' ? '약속 잡고 초대 보내기' : '일정 추가하기'}
        </button>
      </WizFoot>
    </>
  )
}

function FieldLbl({ children }: { children: React.ReactNode }) {
  return <div className="text-caption font-bold text-ink-900 mb-2 tracking-wide">{children}</div>
}

/* ── success ── */
function DoneStep({
  mode, appt, parts, personOf, onFinish,
}: {
  mode: 'group' | 'solo'; appt: Omit<Appointment, 'id'>; parts: string[]
  personOf: (uid: string) => Person; onFinish: () => void
}) {
  const y = Number(appt.date.slice(0, 4)), m = Number(appt.date.slice(5, 7)), d = Number(appt.date.slice(8, 10))
  return (
    <>
      <div className="flex-1 overflow-y-auto flex flex-col items-center text-center px-6 pt-6 pb-2">
        <div className="flex-1" />
        <div className="relative w-[92px] h-[92px] mb-1">
          <div className="absolute inset-0 rounded-full bg-brand-050" />
          <div className="absolute inset-0 grid place-items-center text-brand"><PinIcon size={48} /></div>
        </div>
        <h3 className="mt-3.5 mb-1 text-[23px] font-extrabold tracking-tighter text-ink-900">{mode === 'group' ? '약속을 잡았어요' : '일정을 추가했어요'}</h3>
        <div className="text-[13.5px] text-ink-700 leading-relaxed mb-5">
          {mode === 'group'
            ? <>참여자 <b className="text-ink-900">{parts.length}명</b>에게 초대를 보냈어요.<br />수락하면 서로 캘린더에 함께 표시돼요.</>
            : <>비교 중인 동료에게는 {appt.visibility === 'title' ? '제목이 그대로 보여요.' : "'일정 있음'으로만 보여요."}</>}
        </div>

        <div className="w-full text-left rounded-[16px] border border-brand-100 overflow-hidden flex">
          <div className="w-[5px] bg-brand shrink-0" />
          <div className="flex-1 px-4 py-3.5">
            <div className="text-[11px] font-extrabold text-brand-700 tracking-wide">
              {m}월 {d}일 {dowOf(y, m, d)}요일{appt.start ? ` · ${appt.start}${appt.end ? `–${appt.end}` : ''}` : ''}
            </div>
            <div className="text-subtitle font-bold text-ink-900 mt-1">{appt.title}</div>
            {appt.place && <div className="inline-flex items-center gap-1.5 text-callout text-ink-700 mt-1.5"><span className="text-ink-500"><PlaceIcon size={14} /></span>{appt.place}</div>}
            {mode === 'group' && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex">
                  {appt.participants.slice(0, 4).map((id, i) => {
                    const p = personOf(id)
                    return (
                      <span key={id} style={{ marginLeft: i > 0 ? -8 : 0 }} className="rounded-full ring-2 ring-surface">
                        <Avatar name={p.name} photo={p.photo} color={p.color} size="sm" />
                      </span>
                    )
                  })}
                </div>
                <span className="text-caption text-ink-500">{appt.participants.length}명 함께</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1" />
      </div>
      <WizFoot>
        <button onClick={onFinish} className="w-full h-btn rounded-md bg-brand text-ink-on-brand font-semibold text-body">
          {mode === 'group' ? '초대 보내기' : '확인'}
        </button>
      </WizFoot>
    </>
  )
}

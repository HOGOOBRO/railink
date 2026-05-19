'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useToast } from '@/components/ui/Toast'
import {
  BrandMark, SearchIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, UploadIcon,
} from '@/components/ui/icons'
import { CalCell, type CellBar } from '@/components/calendar/CalCell'
import { DetailSheet } from '@/components/calendar/DetailSheet'
import { MenuSheet } from '@/components/calendar/MenuSheet'
import { SearchOverlay } from '@/components/calendar/SearchOverlay'
import { UploadModal, type UploadMethod } from '@/components/calendar/UploadModal'
import type { TimelineItem } from '@/components/calendar/Timeline'
import { getCurrentSession, logout, type Session } from '@/lib/auth'
import { seedDemo } from '@/lib/demo-seed'
import { getMonthSchedules, replaceUserSchedule } from '@/lib/store/schedules'
import {
  getCompareList, addCompare, removeCompare, MAX_COMPARE,
} from '@/lib/store/compare'
import { DEMO_COLLEAGUES, findColleague, buildMyScheduleFor } from '@/lib/demo-data'
import {
  MONTHS_EN, DOW_EN, buildMonthCells, hmToDecimal,
} from '@/lib/schedule-utils'
import type { CompareEntry, CompareColor, ScheduleEntry } from '@/lib/types/schedule'

const BRAND = 'var(--brand)'
const cssColor = (c: CompareColor) => `var(--${c})`

export default function CalendarPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const today = useMemo(() => new Date(), [])
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [session, setSession] = useState<Session | null>(null)
  const [compares, setCompares] = useState<CompareEntry[]>([])
  const [mySched, setMySched] = useState<ScheduleEntry[]>([])
  const [colSched, setColSched] = useState<Record<string, ScheduleEntry[]>>({})
  const [reload, setReload] = useState(0)

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadStep, setUploadStep] = useState<'pick' | 'preview'>('pick')

  // Loader: resolve the session (demo localStorage OR Supabase), then read
  // the localStorage schedule/compare stores. setState runs after the await,
  // so it is not a synchronous effect-body update.
  useEffect(() => {
    let alive = true
    seedDemo()
    ;(async () => {
      const s = await getCurrentSession()
      if (!alive) return
      if (!s) { router.replace('/login'); return }
      const list = getCompareList()
      const cols: Record<string, ScheduleEntry[]> = {}
      for (const c of list) cols[c.uid] = getMonthSchedules(c.uid, year, month)
      setSession(s)
      setCompares(list)
      setMySched(getMonthSchedules(s.uid, year, month))
      setColSched(cols)
    })()
    return () => { alive = false }
  }, [router, year, month, reload])

  // My schedule for the visible month, by ISO date.
  const myByDate = useMemo(() => {
    const m = new Map<string, ScheduleEntry>()
    for (const e of mySched) m.set(e.date, e)
    return m
  }, [mySched])

  // Each compared colleague's schedule for the visible month, by ISO date.
  const compareByDate = useMemo(() => {
    const map = new Map<string, Map<string, ScheduleEntry>>()
    for (const c of compares) {
      const inner = new Map<string, ScheduleEntry>()
      for (const e of colSched[c.uid] ?? []) inner.set(e.date, e)
      map.set(c.uid, inner)
    }
    return map
  }, [compares, colSched])

  const hasMySchedule = myByDate.size > 0
  const weeks = buildMonthCells(year, month)
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const todayD = isCurrentMonth ? today.getDate() : null

  const workDays = useMemo(
    () => [...myByDate.values()].filter(e => !e.isOff).length,
    [myByDate],
  )
  const offDays = myByDate.size - workDays

  // Bars per in-month day, ordered [me, ...compares].
  const barsByIso = useMemo(() => {
    const map = new Map<string, CellBar[]>()
    weeks.flat().forEach(c => {
      if (c.isOther || !c.iso) return
      const bars: CellBar[] = []
      const mine = myByDate.get(c.iso)
      if (mine) bars.push({ color: BRAND, isOff: mine.isOff })
      for (const cmp of compares) {
        const e = compareByDate.get(cmp.uid)?.get(c.iso)
        if (e) bars.push({ color: cssColor(cmp.color), isOff: e.isOff })
      }
      if (bars.length) map.set(c.iso, bars)
    })
    return map
  }, [weeks, myByDate, compares, compareByDate])

  // Timeline items for the selected date.
  const detailItems = useMemo<TimelineItem[]>(() => {
    if (!selectedDate || !session) return []
    const iso = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    const out: TimelineItem[] = []
    const mine = myByDate.get(iso)
    if (mine && !mine.isOff) {
      out.push({
        color: BRAND, name: session.name, tag: '나', photo: session.photo,
        dia: mine.diaNr, trainNr: mine.trainNr,
        start: hmToDecimal(mine.startTime), end: hmToDecimal(mine.endTime),
      })
    }
    for (const c of compares) {
      const e = compareByDate.get(c.uid)?.get(iso)
      if (e && !e.isOff) {
        out.push({
          color: cssColor(c.color), name: c.name, photo: c.photo,
          dia: e.diaNr, trainNr: e.trainNr,
          start: hmToDecimal(e.startTime), end: hmToDecimal(e.endTime),
        })
      }
    }
    return out
  }, [selectedDate, session, compares, myByDate, compareByDate])

  const closeOverlays = useCallback(() => {
    setDetailOpen(false); setSearchOpen(false); setUploadOpen(false); setMenuOpen(false)
  }, [])

  const openSearch = () => { closeOverlays(); setSearchQuery(''); setSearchOpen(true) }
  const openUpload = () => { closeOverlays(); setUploadStep('pick'); setUploadOpen(true) }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth() + 1) }

  function toggleCompare(uid: string) {
    const existing = compares.find(c => c.uid === uid)
    const meta = findColleague(uid)
    if (existing) {
      removeCompare(uid)
      showToast(`${existing.name} 님을 비교에서 제거했어요.`)
    } else {
      if (compares.length >= MAX_COMPARE) {
        showToast('비교 인원은 최대 10명까지 추가할 수 있어요.', 'danger')
        return
      }
      if (!meta) return
      addCompare(uid, meta.name, meta.employeeId, { photo: meta.photo, office: meta.office })
      showToast(`${meta.name} 님을 비교에 추가했어요.`, 'success')
    }
    setReload(n => n + 1)
  }

  function handleUploadPick(m: UploadMethod) {
    if (m === 'file') { setUploadStep('preview'); return }
    if (m === 'image') showToast('이미지 인식은 곧 추가될 예정이에요.')
    else showToast('직접 입력은 곧 추가될 예정이에요.')
  }

  function handleUploadSave() {
    if (!session) return
    replaceUserSchedule(session.uid, buildMyScheduleFor(session.uid))
    setUploadOpen(false); setUploadStep('pick')
    setReload(n => n + 1)
    showToast('8건 등록 완료', 'success')
  }

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  if (!session) return <div className="min-h-[100dvh] bg-surface" />

  const overlayOpen = detailOpen || searchOpen || uploadOpen || menuOpen
  const compareColorOf = (c: CompareEntry) => cssColor(c.color)

  return (
    <div className="relative flex flex-col min-h-[100dvh] bg-bg">
      {/* ── Top bar ── */}
      <header
        className="border-b border-line sticky top-0 z-topbar"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'saturate(180%) blur(14px)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="h-topbar flex items-center gap-2 px-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-7 h-7 grid place-items-center text-brand shrink-0">
              <BrandMark size={22} />
            </span>
            <span className="font-en text-subtitle font-[400] tracking-tight text-ink-900">RaiLink</span>
          </div>
          <button
            onClick={openSearch}
            aria-label="동료 검색"
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 hover:bg-bg transition-colors"
          >
            <SearchIcon size={20} />
          </button>
          <button
            onClick={() => { closeOverlays(); setMenuOpen(true) }}
            aria-label="내 메뉴"
            className="w-10 grid place-items-center"
          >
            <Avatar name={session.name} photo={session.photo} size="default" color="brand" />
          </button>
        </div>
      </header>

      {/* ── Compare strip ── */}
      <section className="bg-surface border-b border-line pt-3 pb-3.5">
        <div className="flex items-center justify-between px-4 mb-2">
          <span className="text-[11px] font-bold text-ink-500 tracking-wider uppercase">
            비교 중인 동료
          </span>
          <span className="font-en text-[11px] font-semibold text-ink-500">{compares.length}명</span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-4 pt-0.5 pb-1" style={{ scrollbarWidth: 'none' }}>
          <PersonPill name={session.name} photo={session.photo} ringColor={BRAND} avatarColor="brand" self />
          {compares.map(c => (
            <button key={c.uid} onClick={() => toggleCompare(c.uid)} aria-label={`${c.name} 비교 제거`}>
              <PersonPill name={c.name} photo={c.photo} ringColor={compareColorOf(c)} avatarColor={c.color} />
            </button>
          ))}
          <button
            onClick={openSearch}
            className="shrink-0 flex flex-col items-center gap-1.5 w-14"
            aria-label="비교 동료 추가"
          >
            <span className="w-12 h-12 rounded-full bg-brand-050 text-brand grid place-items-center shadow-[inset_0_0_0_1.5px_var(--brand-100)]">
              <PlusIcon size={20} />
            </span>
            <span className="text-[11px] font-semibold text-brand">추가</span>
          </button>
        </div>
      </section>

      {/* ── Month bar ── */}
      <div className="bg-surface flex flex-col">
        <div className="flex items-center justify-between h-topbar px-4">
          <button
            onClick={prevMonth}
            aria-label="이전 달"
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 hover:bg-bg transition-colors"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <div className="flex flex-col items-center gap-1">
            <span className="font-en text-title font-[400] tracking-tighter text-ink-900">
              {MONTHS_EN[month - 1]} {year}
            </span>
            {!isCurrentMonth && (
              <button
                onClick={goToday}
                className="font-kr text-[10px] font-semibold tracking-wide text-brand bg-brand-050 px-2 py-0.5 rounded-pill leading-none"
              >
                오늘로
              </button>
            )}
          </div>
          <button
            onClick={nextMonth}
            aria-label="다음 달"
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 hover:bg-bg transition-colors"
          >
            <ChevronRightIcon size={20} />
          </button>
        </div>

        {/* DOW row */}
        <div className="grid grid-cols-7 border-b-2 border-divider">
          {DOW_EN.map(d => (
            <div key={d} className="text-center font-en text-[13px] font-bold text-ink-700 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex flex-col gap-px bg-bg">
          {weeks.map((wk, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-px">
              {wk.map((c, ci) => (
                <button
                  key={ci}
                  disabled={c.isOther}
                  onClick={() => {
                    if (c.isOther || !c.iso) return
                    setSelectedDate(new Date(year, month - 1, c.d))
                    closeOverlays()
                    setDetailOpen(true)
                  }}
                  className={c.isOther ? 'cursor-default' : 'cursor-pointer'}
                >
                  <CalCell
                    d={c.d}
                    isOther={c.isOther}
                    today={!c.isOther && c.d === todayD}
                    selected={
                      !c.isOther && !!selectedDate &&
                      selectedDate.getMonth() === month - 1 && selectedDate.getDate() === c.d
                    }
                    bars={c.iso ? barsByIso.get(c.iso) ?? [] : []}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      {hasMySchedule && (
        <div className="px-4 pt-3 pb-6 text-caption text-ink-500">
          <div className="flex items-center gap-2 bg-bg px-3.5 py-2.5 rounded-md">
            <span className="text-brand shrink-0"><UploadIcon size={14} /></span>
            <span>
              이번 달{' '}
              <strong className="font-en text-ink-700">내 근무 {workDays}일</strong>
              {' · '}휴무 {offDays}일 · 비교 동료 {compares.length}명
            </span>
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* ── Empty-state card ── */}
      {!hasMySchedule && (
        <div
          className="absolute left-4 right-4 bg-surface rounded-lg border border-line px-4 py-5 text-center shadow-sh3"
          style={{ bottom: 'calc(100px + env(safe-area-inset-bottom))' }}
        >
          <div className="w-12 h-12 rounded-lg bg-brand-050 text-brand grid place-items-center mx-auto mb-2.5">
            <UploadIcon size={22} />
          </div>
          <p className="font-bold text-[15px] text-ink-900 mb-1">이번 달 근무표가 아직 없어요</p>
          <p className="text-caption text-ink-500 mb-3">아래 버튼을 눌러 시작해 주세요.</p>
          <Button block size="sm" onClick={openUpload}>근무표 등록하기</Button>
        </div>
      )}

      {/* ── FAB ── */}
      {!overlayOpen && (
        <button
          onClick={openUpload}
          aria-label="근무표 등록"
          className="absolute right-[18px] w-fab h-fab rounded-full bg-brand text-ink-on-brand grid place-items-center shadow-sh-brand z-fab active:scale-95 transition-transform"
          style={{ bottom: 'calc(36px + env(safe-area-inset-bottom))' }}
        >
          <PlusIcon size={22} />
        </button>
      )}

      {/* ── Date detail ── */}
      <BottomSheet open={detailOpen} onClose={() => setDetailOpen(false)}>
        {selectedDate && (
          <DetailSheet
            date={selectedDate}
            items={detailItems}
            onClose={() => setDetailOpen(false)}
            onAddCompare={openSearch}
          />
        )}
      </BottomSheet>

      {/* ── Menu ── */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <MenuSheet
          session={session}
          compareCount={compares.length}
          onManageSchedule={openUpload}
          onLogout={handleLogout}
        />
      </BottomSheet>

      {/* ── Search overlay ── */}
      {searchOpen && (
        <SearchOverlay
          query={searchQuery}
          setQuery={setSearchQuery}
          colleagues={DEMO_COLLEAGUES}
          comparedUids={new Set(compares.map(c => c.uid))}
          onClose={() => setSearchOpen(false)}
          onToggle={toggleCompare}
        />
      )}

      {/* ── Upload modal ── */}
      {uploadOpen && (
        <UploadModal
          step={uploadStep}
          onPick={handleUploadPick}
          onBack={() => setUploadStep('pick')}
          onClose={() => { setUploadOpen(false); setUploadStep('pick') }}
          onSave={handleUploadSave}
        />
      )}
    </div>
  )
}

function PersonPill({ name, photo, ringColor, avatarColor, self }: {
  name: string
  photo?: string
  ringColor: string
  avatarColor: 'brand' | CompareColor
  self?: boolean
}) {
  return (
    <div className="shrink-0 flex flex-col items-center gap-1.5 w-14">
      <div
        className="relative w-12 h-12 rounded-full bg-white grid place-items-center"
        style={{ boxShadow: `inset 0 0 0 2px ${ringColor}` }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="w-[42px] h-[42px] rounded-full object-cover" />
        ) : (
          <Avatar name={name} size="lg" className="!w-[42px] !h-[42px]" color={avatarColor} />
        )}
        {self && (
          <span className="absolute -right-1 -bottom-0.5 bg-brand text-ink-on-brand text-[9px] font-bold px-1.5 rounded-pill shadow-[0_0_0_2px_#fff]">
            나
          </span>
        )}
      </div>
      <span className="text-[11px] font-semibold text-ink-900 max-w-[56px] truncate text-center">
        {name}
      </span>
    </div>
  )
}

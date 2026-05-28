'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useToast } from '@/components/ui/Toast'
import {
  BrandMark, SearchIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, UploadIcon, ArrowRightIcon,
} from '@/components/ui/icons'
import { CalCell, type CellBar } from '@/components/calendar/CalCell'
import { DetailSheet } from '@/components/calendar/DetailSheet'
import { MenuSheet } from '@/components/calendar/MenuSheet'
import { SearchOverlay } from '@/components/calendar/SearchOverlay'
import { UploadModal } from '@/components/calendar/UploadModal'
import { GroupTabs } from '@/components/calendar/GroupTabs'
import { ManageGroupsSheet } from '@/components/calendar/ManageGroupsSheet'
import type { MonthPerson, MonthShift } from '@/components/calendar/MonthTimeline'
import { getCurrentSession, logout, type Session } from '@/lib/auth'
import {
  getMonthSchedules,
  getRemoteMonthSchedules,
  getRemoteMonthSchedulesForUsers,
  replaceRemoteUserScheduleMonths,
  replaceUserScheduleMonths,
} from '@/lib/store/schedules'
import {
  getGroupsState, saveGroupsState, activeGroupOf, allMemberUids,
  addToActiveGroup, removeFromActiveGroup, setActiveGroup,
  createGroup, renameGroup, deleteGroup, MAX_PER_GROUP,
} from '@/lib/store/groups'
import {
  findColleagueInDirectory,
  getColleagueDirectory,
  findProfileByEmployeeId,
  isDemoColleagueUid,
} from '@/lib/store/colleagues'
import { myViewerShareStatuses, requestShare, cancelShare, listShares } from '@/lib/store/shares'
import type { Colleague } from '@/lib/demo-data'
import {
  DOW_KR, buildMonthCells, hmToDecimal,
} from '@/lib/schedule-utils'
import type { ParsedScheduleRow } from '@/lib/parse/schedule-file'
import type { CompareEntry, CompareColor, GroupsState, ScheduleEntry, ShareStatus } from '@/lib/types/schedule'

const BRAND = 'var(--brand)'
const cssColor = (c: CompareColor) => `var(--${c})`

// One-time migration notice (§6). Value 'skipped-new-user' permanently blocks it
// for accounts that never had compares, so they never see the notice at all.
const MIGRATION_KEY = 'rl.migrationNotice.dismissed'

// One person's working shifts across the month, for the continuous timeline.
// Overnight (박차) is normalized to a 24+ end (end clock earlier than start),
// and continuation rows ("~(H1048)") are dropped — the start-day card spans the
// midnight divider instead of being duplicated on the next day.
function monthShifts(entryOf: (iso: string) => ScheduleEntry | undefined, year: number, month: number): MonthShift[] {
  const dim = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  const out: MonthShift[] = []
  for (let d = 1; d <= dim; d++) {
    const e = entryOf(`${year}-${mm}-${String(d).padStart(2, '0')}`)
    if (!e || e.isOff || !e.diaNr || e.diaNr.startsWith('~(')) continue
    if (!e.startTime || !e.endTime) {
      // A working day whose times weren't read (OCR miss / blank) — surface it
      // as "시간 미입력" rather than dropping it silently.
      out.push({ day: d, dia: e.diaNr, trainNr: e.trainNr, start: 0, end: 0, noTime: true })
      continue
    }
    const start = hmToDecimal(e.startTime)
    let end = hmToDecimal(e.endTime)
    if (end < start) end += 24
    out.push({ day: d, dia: e.diaNr, trainNr: e.trainNr, start, end })
  }
  return out
}

export default function CalendarPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const today = useMemo(() => new Date(), [])
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [session, setSession] = useState<Session | null>(null)
  const [groupsState, setGroupsState] = useState<GroupsState>({ groups: [], activeGroupId: null })
  const [mySched, setMySched] = useState<ScheduleEntry[]>([])
  const [colSched, setColSched] = useState<Record<string, ScheduleEntry[]>>({})
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [colleagueLoading, setColleagueLoading] = useState(false)
  const [shareStatus, setShareStatus] = useState<Record<string, ShareStatus>>({})
  const [pendingCount, setPendingCount] = useState(0)
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [reload, setReload] = useState(0)

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadStep, setUploadStep] = useState<'pick' | 'preview' | 'manual'>('pick')
  const [manageOpen, setManageOpen] = useState(false)
  const [manageStartCreate, setManageStartCreate] = useState(false)

  // Loader: resolve the session (demo localStorage OR Supabase), then read
  // the localStorage schedule/compare stores. setState runs after the await,
  // so it is not a synchronous effect-body update.
  useEffect(() => {
    let alive = true
    ;(async () => {
      let s: Session | null = null
      try {
        s = await getCurrentSession()
      } catch {
        if (alive) router.replace('/login')
        return
      }
      if (!alive) return
      if (!s) { router.replace('/login'); return }
      // Groups + members. Demo colleagues are hidden from real accounts — filter
      // each group's members (same isolation rule the compare store had).
      const st = getGroupsState(s.uid)
      let groups = st.groups
      if (!s.isDemo) {
        let changed = false
        groups = groups.map(g => {
          const members = g.members.filter(m => !isDemoColleagueUid(m.uid))
          if (members.length !== g.members.length) changed = true
          return members.length === g.members.length ? g : { ...g, members }
        })
        if (changed) saveGroupsState(s.uid, { groups, activeGroupId: st.activeGroupId })
      }
      const activeGroupId = groups.some(g => g.id === st.activeGroupId)
        ? st.activeGroupId : (groups[0]?.id ?? null)
      const nextGroups: GroupsState = { groups, activeGroupId }
      const memberUids = allMemberUids(nextGroups)

      let mine = getMonthSchedules(s.uid, year, month)
      let cols: Record<string, ScheduleEntry[]> = {}

      setSession(s)
      setGroupsState(nextGroups)
      setMySched(mine)
      setColSched(cols)

      if (s.isDemo) {
        for (const uid of memberUids) cols[uid] = getMonthSchedules(uid, year, month)
        if (!alive) return
        setColSched(cols)
      } else {
        try {
          const [remoteMine, remoteCols] = await Promise.all([
            getRemoteMonthSchedules(s.uid, year, month),
            getRemoteMonthSchedulesForUsers(memberUids, year, month),
          ])
          if (!alive) return
          if (!remoteMine.length && mine.length) {
            await replaceRemoteUserScheduleMonths(s.uid, mine)
          } else {
            mine = remoteMine
          }
          cols = remoteCols
        } catch {
          cols = {}
        }
        if (!alive) return
        setMySched(mine)
        setColSched(cols)
      }

      setColleagueLoading(true)
      try {
        const directory = await getColleagueDirectory(s)
        if (!alive) return
        setColleagues(directory)
      } catch {
        if (alive) setColleagues([])
      } finally {
        if (alive) setColleagueLoading(false)
      }

      // §4 — my viewer-side share status drives the search overlay's actions.
      // §5 — pending requests where I'm the owner feed the inbox banner + badge.
      if (!s.isDemo) {
        try {
          const [statuses, shares] = await Promise.all([myViewerShareStatuses(), listShares()])
          if (!alive) return
          setShareStatus(statuses)
          setPendingCount(shares.incoming.length)

          // Reconciler: groups ≡ share intent. Any pending outgoing whose owner
          // isn't in any of my groups (legacy / failed-cancel / cross-device drift)
          // gets silently cleaned up. Fire-and-forget; next-mount catches retries.
          const inGroup = new Set(allMemberUids(nextGroups))
          const orphans = shares.outgoing.filter(o => !inGroup.has(o.ownerId)).map(o => o.ownerId)
          if (orphans.length) {
            setShareStatus(s2 => {
              const out = { ...s2 }
              for (const uid of orphans) delete out[uid]
              return out
            })
            for (const uid of orphans) cancelShare(uid).catch(() => { /* retried next mount */ })
          }
        } catch { /* search falls back to "요청"; banner stays hidden */ }

        // §6 — one-time migration notice. Shown only to accounts that already had
        // compares (local groups/compare data); brand-new accounts are marked
        // 'skipped-new-user' so they never see it.
        if (alive && typeof window !== 'undefined' && !localStorage.getItem(MIGRATION_KEY)) {
          let hadCompares = false
          try {
            const g = JSON.parse(localStorage.getItem('railink_groups_v1') ?? '{}')
            const c = JSON.parse(localStorage.getItem('railink_compare_v4') ?? '{}')
            hadCompares = (g[s.uid]?.groups?.length ?? 0) > 0 || (c[s.uid]?.length ?? 0) > 0
          } catch { /* treat as new user */ }
          if (hadCompares) setMigrationOpen(true)
          else localStorage.setItem(MIGRATION_KEY, 'skipped-new-user')
        }
      }
    })()
    return () => { alive = false }
  }, [router, year, month, reload])

  function dismissMigration() {
    if (typeof window !== 'undefined') localStorage.setItem(MIGRATION_KEY, 'dismissed')
    setMigrationOpen(false)
  }

  // The calendar reads from the active group only; switching tabs is a pure
  // read-side swap (colSched already holds every group's members).
  const activeGroup = useMemo(() => activeGroupOf(groupsState), [groupsState])
  const compares = useMemo<CompareEntry[]>(() => activeGroup?.members ?? [], [activeGroup])

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
  // People (columns) with their month-long shifts — fed to the continuous
  // timeline so overnight shifts span the midnight divider as one card.
  // Pending colleagues (share not yet accepted) get an empty-shifts column
  // with a "수락 대기 중" notice rather than disappearing.
  const monthPeople = useMemo<MonthPerson[]>(() => {
    if (!session) return []
    const ppl: MonthPerson[] = [{
      color: BRAND, name: session.name, tag: '나', photo: session.photo,
      shifts: monthShifts(iso => myByDate.get(iso), year, month),
    }]
    for (const c of compares) {
      const pending = !session.isDemo && shareStatus[c.uid] === 'pending'
      ppl.push({
        color: cssColor(c.color), name: c.name, photo: c.photo,
        shifts: pending ? [] : monthShifts(iso => compareByDate.get(c.uid)?.get(iso), year, month),
        pending,
      })
    }
    return ppl
  }, [session, compares, myByDate, compareByDate, year, month, shareStatus])

  const closeOverlays = useCallback(() => {
    setDetailOpen(false); setSearchOpen(false); setUploadOpen(false)
    setMenuOpen(false); setManageOpen(false)
  }, [])

  const openSearch = () => { closeOverlays(); setSearchQuery(''); setSearchOpen(true); refreshShareStatus() }

  function refreshShareStatus() {
    if (session && !session.isDemo) myViewerShareStatuses().then(setShareStatus).catch(() => {})
  }

  const lookupSabun = useCallback((employeeId: string) => findProfileByEmployeeId(employeeId), [])
  const openUpload = () => { closeOverlays(); setUploadStep('pick'); setUploadOpen(true) }
  const openManualEdit = () => { closeOverlays(); setUploadStep('manual'); setUploadOpen(true) }
  const openManage = (startCreate = false) => {
    closeOverlays(); setManageStartCreate(startCreate); setManageOpen(true)
  }

  // Active-group switch — read-side only; close the detail sheet so it can't show
  // a stale group's timeline.
  function switchGroup(id: string) {
    if (!session || id === groupsState.activeGroupId) return
    setGroupsState(setActiveGroup(session.uid, id))
    setDetailOpen(false)
  }

  function handleCreateGroup(): string | null {
    if (!session) return null
    const res = createGroup(session.uid)
    if (!res) return null
    setGroupsState({ ...res.state })
    return res.id
  }

  function handleRenameGroup(id: string, name: string): 'duplicate' | null {
    if (!session) return null
    const res = renameGroup(session.uid, id, name)
    setGroupsState({ ...res.state })
    return res.error === 'duplicate' ? 'duplicate' : null
  }

  function handleDeleteGroup(id: string) {
    if (!session) return
    const next = deleteGroup(session.uid, id)
    setGroupsState({ ...next })
    setDetailOpen(false)
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth() + 1) }

  // Add/remove a colleague from the active compare group.
  // For real accounts the group IS the share-intent surface: adding fires a
  // share request when needed, removing from the last group cancels it.
  async function toggleCompare(uid: string) {
    if (!session) return
    const existing = compares.find(c => c.uid === uid)

    if (existing) {
      const next = removeFromActiveGroup(session.uid, uid)
      setReload(n => n + 1)
      showToast(`${existing.name} 님을 비교에서 제거했어요.`)

      if (session.isDemo) return
      // Only cancel if the colleague is gone from EVERY group — multi-group
      // membership shouldn't silently nuke the share for the other tab.
      const stillInAnyGroup = allMemberUids(next).includes(uid)
      const status = shareStatus[uid]
      if (!stillInAnyGroup && (status === 'pending' || status === 'accepted')) {
        setShareStatus(s => { const n = { ...s }; delete n[uid]; return n })
        cancelShare(uid).catch(() => { /* fail-quiet; reconciler picks it up next mount */ })
      }
      return
    }

    const meta = findColleagueInDirectory(uid, colleagues)
    if (!meta) return
    const res = addToActiveGroup(session.uid, {
      uid, name: meta.name, employeeId: meta.employeeId, photo: meta.photo, office: meta.office,
    })
    if (!res.entry && !res.alreadyIn) {
      showToast('비교 인원은 최대 10명까지 추가할 수 있어요.', 'danger')
      return
    }
    setReload(n => n + 1)
    if (res.alreadyIn) return

    if (session.isDemo) {
      showToast(`${meta.name} 님을 ${res.group.name} 그룹에 추가했어요.`, 'success')
      return
    }

    const status = shareStatus[uid]
    if (status === 'accepted') {
      showToast(`${meta.name} 님을 ${res.group.name} 그룹에 추가했어요.`, 'success')
      return
    }
    if (status === 'pending') {
      showToast(`${meta.name} 님을 추가했어요 · 수락을 기다리고 있어요`, 'success')
      return
    }

    // none / revoked → send a share request in the background.
    // On failure roll the group membership back so groups ≡ share intent stays true.
    setShareStatus(s => ({ ...s, [uid]: 'pending' }))
    const r = await requestShare(uid)
    if (!r.ok) {
      removeFromActiveGroup(session.uid, uid)
      setShareStatus(s => { const n = { ...s }; delete n[uid]; return n })
      setReload(n => n + 1)
      showToast(r.message, 'danger')
      return
    }
    // Re-assert: the setReload above re-fires the mount effect which fetches
    // shareStatus from the server. If that fetch returned BEFORE this RPC
    // committed (likely — same-tick race), it would have nulled the optimistic
    // pending. Re-set it after the RPC actually succeeded.
    setShareStatus(s => ({ ...s, [uid]: 'pending' }))
    showToast(`${meta.name} 님께 공유 요청을 보냈어요`, 'success')
  }

  async function handleUploadSave(rows: ParsedScheduleRow[]) {
    if (!session) throw new Error('로그인 상태를 확인한 뒤 다시 저장해 주세요.')
    const entries = rows.map(row => ({ ...row, uid: session.uid }))
    if (!session.isDemo) {
      await replaceRemoteUserScheduleMonths(session.uid, entries)
    }
    replaceUserScheduleMonths(session.uid, entries)
    const first = entries[0]?.date
    const savedYear = first ? Number(first.slice(0, 4)) : year
    const savedMonth = first ? Number(first.slice(5, 7)) : month
    if (first) {
      setYear(savedYear)
      setMonth(savedMonth)
    }
    setUploadOpen(false); setUploadStep('pick')
    setMySched(getMonthSchedules(session.uid, savedYear, savedMonth))
    showToast(`${entries.length}건 등록 완료`, 'success')
  }

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  if (!session) return <div className="min-h-[100dvh] bg-surface" />

  const overlayOpen = detailOpen || searchOpen || uploadOpen || menuOpen || manageOpen
  const compareColorOf = (c: CompareEntry) => cssColor(c.color)
  const hasGroups = groupsState.groups.length > 0
  const atCompareCap = compares.length >= MAX_PER_GROUP
  const isEmptyGroup = hasGroups && compares.length === 0

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
            aria-label={pendingCount > 0 ? `내 메뉴 · 받은 공유 요청 ${pendingCount}개` : '내 메뉴'}
            className="w-10 grid place-items-center"
          >
            <span className="relative">
              <Avatar name={session.name} photo={session.photo} size="default" color="brand" />
              {pendingCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand border-2 border-white"
                  aria-hidden="true"
                />
              )}
            </span>
          </button>
        </div>
      </header>

      {/* ── Compare-group tab zone + strip ── */}
      <section className="bg-surface border-b border-line pb-3.5">
        {hasGroups ? (
          <GroupTabs
            groups={groupsState.groups}
            activeGroupId={groupsState.activeGroupId}
            activeGroupName={activeGroup?.name ?? ''}
            onSelect={switchGroup}
            onAddGroup={() => openManage(true)}
            onManage={() => openManage(false)}
            showToast={showToast}
          />
        ) : (
          <div className="flex items-center justify-between px-4 pt-3 mb-2">
            <span className="text-[11px] font-bold text-ink-500 tracking-wider uppercase">
              비교 중인 동료
            </span>
            <span className="font-en text-[11px] font-semibold text-ink-500">{compares.length}명</span>
          </div>
        )}

        <div className="flex gap-2.5 overflow-x-auto px-4 pt-1 pb-1 items-start" style={{ scrollbarWidth: 'none' }}>
          <PersonPill name={session.name} photo={session.photo} ringColor={BRAND} avatarColor="brand" self />

          {isEmptyGroup ? (
            <div className="flex-1 self-stretch min-h-[60px] flex flex-col items-center justify-center gap-0.5 px-2">
              <span className="text-[13px] text-ink-500">이 그룹에 동료를 추가해 보세요</span>
              <button onClick={openSearch} className="text-[13px] font-semibold text-brand">
                + 동료 찾기
              </button>
            </div>
          ) : (
            compares.map(c => {
              const pending = !session.isDemo && shareStatus[c.uid] === 'pending'
              return (
                <button key={c.uid} onClick={() => toggleCompare(c.uid)} aria-label={`${c.name} 비교 제거`}>
                  <PersonPill
                    name={c.name}
                    photo={c.photo}
                    ringColor={compareColorOf(c)}
                    avatarColor={c.color}
                    pending={pending}
                  />
                </button>
              )
            })
          )}

          <button
            onClick={() => atCompareCap
              ? showToast('비교 인원은 최대 10명까지 추가할 수 있어요.', 'danger')
              : openSearch()}
            className={`shrink-0 flex flex-col items-center gap-1.5 w-14 ${atCompareCap ? 'opacity-40' : ''}`}
            aria-label="비교 동료 추가"
          >
            <span className="w-12 h-12 rounded-full bg-brand-050 text-brand grid place-items-center shadow-[inset_0_0_0_1.5px_var(--brand-100)]">
              <PlusIcon size={20} />
            </span>
            <span className="text-[11px] font-semibold text-brand">추가</span>
          </button>
        </div>
      </section>

      {/* ── Inbox banner (§5): pending requests where I'm the owner ── */}
      {pendingCount > 0 && (
        <button
          onClick={() => router.push('/settings/info?focus=shares')}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-brand-050 border-b border-line text-left"
        >
          <span className="flex-1 text-caption font-semibold text-ink-700">
            받은 공유 요청 <span className="font-en">{pendingCount}</span>개
          </span>
          <span className="text-brand shrink-0"><ArrowRightIcon size={16} /></span>
        </button>
      )}

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
            <span className="font-kr text-title font-bold tracking-tight text-ink-900">
              {year}년 {month}월
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
          {DOW_KR.map((d, i) => (
            <div
              key={d}
              className={`text-center font-kr text-[13px] font-bold py-1 ${
                i === 0 ? 'text-danger' : i === 6 ? 'text-brand' : 'text-ink-700'
              }`}
            >
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

      {/* ── Footer ── 근무표 유무 양쪽 모두 한 줄 인라인. 없을 땐 등록 진입점, 있을 땐 카운터. */}
      <div className="px-4 pt-3 pb-6 text-caption text-ink-500">
        {hasMySchedule ? (
          <div className="flex items-center gap-2 bg-bg px-3.5 py-2.5 rounded-md">
            <span className="text-brand shrink-0"><UploadIcon size={14} /></span>
            <span>
              이번 달{' '}
              <strong className="font-en text-ink-700">내 근무 {workDays}일</strong>
              {' · '}휴무 {offDays}일 · 비교 동료 {compares.length}명
            </span>
          </div>
        ) : (
          <button
            onClick={openUpload}
            className="w-full flex items-center gap-2 bg-bg px-3.5 py-2.5 rounded-md text-left"
          >
            <span className="text-brand shrink-0"><UploadIcon size={14} /></span>
            <span className="flex-1">이번 달 내 근무표가 없어요</span>
            <span className="text-brand font-semibold shrink-0">등록하기 →</span>
          </button>
        )}
      </div>

      <div className="flex-1" />

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
            year={year}
            month={month}
            today={today}
            people={monthPeople}
            onClose={() => setDetailOpen(false)}
            onAddCompare={openSearch}
            onEdit={openManualEdit}
          />
        )}
      </BottomSheet>

      {/* ── Menu ── */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <MenuSheet
          session={session}
          compareCount={compares.length}
          hasPending={pendingCount > 0}
          onManageSchedule={openUpload}
          onLogout={handleLogout}
        />
      </BottomSheet>

      {/* ── Search overlay ── */}
      {searchOpen && (
        <SearchOverlay
          query={searchQuery}
          setQuery={setSearchQuery}
          colleagues={colleagues}
          loading={colleagueLoading}
          comparedUids={new Set(compares.map(c => c.uid))}
          activeGroupName={hasGroups ? activeGroup?.name ?? null : null}
          onOpenManage={() => openManage(false)}
          onClose={() => setSearchOpen(false)}
          onToggle={toggleCompare}
          shareGated={!session.isDemo}
          shareStatus={shareStatus}
          lookupSabun={lookupSabun}
        />
      )}

      {/* ── Manage groups ── */}
      <BottomSheet open={manageOpen} onClose={() => setManageOpen(false)}>
        <ManageGroupsSheet
          groups={groupsState.groups}
          startCreate={manageStartCreate}
          onClose={() => setManageOpen(false)}
          onRename={handleRenameGroup}
          onDelete={handleDeleteGroup}
          onCreate={handleCreateGroup}
          showToast={showToast}
        />
      </BottomSheet>

      {/* ── Upload modal ── */}
      {uploadOpen && (
        <UploadModal
          step={uploadStep}
          defaultYear={year}
          defaultMonth={month}
          initialRows={mySched.map(e => ({
            date: e.date, isOff: e.isOff,
            diaNr: e.diaNr, trainNr: e.trainNr,
            startTime: e.startTime, endTime: e.endTime,
          }))}
          onPreview={() => setUploadStep('preview')}
          onManual={() => setUploadStep('manual')}
          onBack={() => setUploadStep('pick')}
          onClose={() => { setUploadOpen(false); setUploadStep('pick') }}
          onSave={handleUploadSave}
        />
      )}

      {/* ── Migration notice (§6): one-time, dismissal persists ── */}
      <BottomSheet open={migrationOpen} onClose={dismissMigration}>
        <div className="px-5 pt-2 pb-8">
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">동료 공유 방식이 바뀌었어요</h3>
          <p className="mt-2 text-callout text-ink-700 leading-relaxed">
            이제 일정은 동료가 요청하고 내가 수락할 때만 공유돼요. 그동안 비교하던 동료를
            다시 추가하면 공유 요청이 시작돼요.
          </p>
          <div className="mt-4">
            <Button block onClick={() => { dismissMigration(); openSearch() }}>
              캘린더에서 다시 추가하기
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

function PersonPill({ name, photo, ringColor, avatarColor, self, pending }: {
  name: string
  photo?: string
  ringColor: string
  avatarColor: 'brand' | CompareColor
  self?: boolean
  pending?: boolean
}) {
  return (
    <div className="shrink-0 flex flex-col items-center gap-1.5 w-14">
      <div
        className={`relative w-12 h-12 rounded-full bg-white grid place-items-center ${pending ? 'opacity-50' : ''}`}
        style={{ boxShadow: `inset 0 0 0 2px ${pending ? 'var(--line-2)' : ringColor}` }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className={`w-[42px] h-[42px] rounded-full object-cover ${pending ? 'grayscale' : ''}`} />
        ) : (
          <Avatar name={name} size="lg" className="!w-[42px] !h-[42px]" color={pending ? 'brand' : avatarColor} />
        )}
        {self && (
          <span className="absolute -right-1 -bottom-0.5 bg-brand text-ink-on-brand text-[9px] font-bold px-1.5 rounded-pill shadow-[0_0_0_2px_#fff]">
            나
          </span>
        )}
      </div>
      <span className={`text-[11px] font-semibold max-w-[56px] truncate text-center ${pending ? 'text-ink-500' : 'text-ink-900'}`}>
        {name}
      </span>
      {pending && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-pill bg-bg text-ink-500 leading-none -mt-1">
          수락 대기 중
        </span>
      )}
    </div>
  )
}

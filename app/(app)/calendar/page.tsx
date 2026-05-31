'use client'

import { type ReactNode, useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useToast } from '@/components/ui/Toast'
import {
  BrandMark, SearchIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, UploadIcon, ArrowRightIcon, EditIcon,
} from '@/components/ui/icons'
import { CalCell, type CellBar } from '@/components/calendar/CalCell'
import { DetailSheet } from '@/components/calendar/DetailSheet'
import { MenuSheet } from '@/components/calendar/MenuSheet'
import { InviteCreateSheet } from '@/components/calendar/InviteCreateSheet'
import { PersonalHintCard } from '@/components/calendar/PersonalHintCard'
import { SearchOverlay } from '@/components/calendar/SearchOverlay'
import { UploadModal } from '@/components/calendar/UploadModal'
import { GroupTabs } from '@/components/calendar/GroupTabs'
import { ManageGroupsSheet } from '@/components/calendar/ManageGroupsSheet'
import { CompareMemberSheet } from '@/components/calendar/CompareMemberSheet'
import { CalendarSkeleton } from '@/components/calendar/CalendarSkeleton'
import { BootSplash } from '@/components/loading/BootSplash'
import { Spinner } from '@/components/ui/Spinner'
import { useDelayedFlag } from '@/lib/use-delayed-flag'
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
  createGroup, renameGroup, deleteGroup, reorderGroups, MAX_PER_GROUP,
} from '@/lib/store/groups'
import {
  findColleagueInDirectory,
  getColleagueDirectory,
  findProfileByEmployeeId,
  findProfileByEmail,
  isDemoColleagueUid,
} from '@/lib/store/colleagues'
import { myViewerShareStatuses, requestShare, cancelShare, listShares } from '@/lib/store/shares'
import { consumePendingInvite } from '@/lib/store/invites'
import { getMemberColors, setMemberColor } from '@/lib/store/member-colors'
import type { Colleague } from '@/lib/demo-data'
import {
  DOW_KR, buildMonthCells, hmToDecimal,
} from '@/lib/schedule-utils'
import { holidayNameFor } from '@/lib/holidays-kr'
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
    // dia가 없는 row(일반 근무 직접입력)도 시간만 있으면 타임라인에 카드 표시.
    // ~(H1048) 같은 연속 표기는 시작 행에서 카드를 그리니까 여기선 스킵.
    if (!e || e.isOff || (e.diaNr && e.diaNr.startsWith('~('))) continue
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
  const [colorOverrides, setColorOverrides] = useState<Record<string, CompareColor>>({})
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
  const [inviteOpen, setInviteOpen] = useState(false)
  // Default true = hidden, so the personal first-entry card never flashes for
  // KTX users or before the session resolves. Set from localStorage in the loader.
  const [hintDismissed, setHintDismissed] = useState(true)
  const [memberSheet, setMemberSheet] = useState<CompareEntry | null>(null)
  // First-load gate for the calendar skeleton (⑤). True until the initial
  // month data resolves; stays false afterwards so month/reload navigation
  // keeps the previous content visible instead of re-flashing a skeleton.
  const [booting, setBooting] = useState(true)
  // Name of the colleague whose schedule is being fetched right now (④) — drives
  // the inline "불러오는 중" chip + bar. null when nothing is mid-fetch.
  const [loadingColleague, setLoadingColleague] = useState<string | null>(null)

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
      setColorOverrides(getMemberColors(s.uid))
      // Have a locally-cached month already? Show it immediately and let the
      // remote sync update in place — never make a returning user stare at a
      // skeleton for data we already hold. The skeleton (⑤) is reserved for a
      // genuine empty first load, where booting stays true until remote lands.
      if (mine.length > 0) setBooting(false)
      // Personal first-entry hint: shown until dismissed (persisted per uid).
      setHintDismissed(
        s.profileType !== 'personal' ||
        (typeof window !== 'undefined' && localStorage.getItem(`railink_hint_dismissed_${s.uid}`) === '1'),
      )

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

      // Primary month data is on screen now — drop the first-load skeleton (⑤)
      // and clear any inline colleague-fetch indicator (④). Subsequent
      // month/reload runs leave booting false, so navigation keeps the prior
      // content rather than re-flashing a skeleton.
      if (alive) { setBooting(false); setLoadingColleague(null) }

      // Invite connect — runs before the directory fetch so a freshly-created
      // accepted share's counterpart is included in the directory below (used to
      // resolve their name for auto-grouping). No-op (no network) when there's
      // no stashed token, so non-invited mounts pay nothing.
      if (!s.isDemo) {
        const invitedOwner = await consumePendingInvite()
        if (!alive) return
        if (invitedOwner) showToast(`${invitedOwner.name} 님과 연결됐어요!`, 'success')
      }

      setColleagueLoading(true)
      let directoryList: Colleague[] = []
      try {
        directoryList = await getColleagueDirectory(s)
        if (!alive) return
        setColleagues(directoryList)
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

          // Invite auto-grouping: an accepted share I can view whose counterpart
          // isn't in any of my groups only arises from consume_invite (normal
          // adds put the person in a group first, then request). Add them to the
          // active/기본 group so inviter↔invitee both surface in compare. Reload
          // to pull the new member's schedule.
          const inGroupUids = new Set(allMemberUids(nextGroups))
          const ungrouped = shares.viewing.filter(v => !inGroupUids.has(v.ownerId))
          if (ungrouped.length) {
            let addedAny = false
            for (const v of ungrouped) {
              const prof = directoryList.find(d => d.uid === v.ownerId)
              const res = addToActiveGroup(s.uid, {
                uid: v.ownerId,
                name: prof?.name ?? '동료',
                employeeId: prof?.employeeId ?? '',
                photo: prof?.photo,
                office: prof?.office,
              })
              // entry set OR alreadyIn → it's grouped; null+!alreadyIn means the
              // active group is at the 10-person cap. Guard the reload on a real
              // change so a capped group can't loop the mount effect forever.
              if (res.entry || res.alreadyIn) addedAny = true
            }
            if (addedAny) { if (alive) setReload(n => n + 1); return }
          }

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
  }, [router, year, month, reload, showToast])

  function dismissMigration() {
    if (typeof window !== 'undefined') localStorage.setItem(MIGRATION_KEY, 'dismissed')
    setMigrationOpen(false)
  }

  // The calendar reads from the active group only; switching tabs is a pure
  // read-side swap (colSched already holds every group's members).
  const activeGroup = useMemo(() => activeGroupOf(groupsState), [groupsState])
  // Apply per-owner color overrides (stored locally only) before downstream
  // consumers (bars, timeline, pills) read cmp.color.
  const compares = useMemo<CompareEntry[]>(() => {
    const base = activeGroup?.members ?? []
    return base.map(m => {
      const o = colorOverrides[m.uid]
      return o ? { ...m, color: o } : m
    })
  }, [activeGroup, colorOverrides])

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
    setMenuOpen(false); setManageOpen(false); setMemberSheet(null); setInviteOpen(false)
  }, [])

  const openInvite = () => { closeOverlays(); setInviteOpen(true) }

  function dismissHint() {
    if (session && typeof window !== 'undefined') {
      localStorage.setItem(`railink_hint_dismissed_${session.uid}`, '1')
    }
    setHintDismissed(true)
  }

  const openSearch = () => { closeOverlays(); setSearchQuery(''); setSearchOpen(true); refreshShareStatus() }

  function refreshShareStatus() {
    if (session && !session.isDemo) myViewerShareStatuses().then(setShareStatus).catch(() => {})
  }

  const lookupSabun = useCallback((employeeId: string) => findProfileByEmployeeId(employeeId), [])
  const lookupEmail = useCallback((email: string) => findProfileByEmail(email), [])
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

  function handleReorderGroups(orderedIds: string[]) {
    if (!session) return
    setGroupsState({ ...reorderGroups(session.uid, orderedIds) })
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
  async function toggleCompare(uid: string, fallbackMeta?: Colleague) {
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

    // Private (사번-only) accounts aren't in the directory list, so fall back to
    // the profile the search row passed in.
    const meta = findColleagueInDirectory(uid, colleagues) ?? fallbackMeta
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
    // Newly added → the reload effect is now fetching their month schedule.
    // Show the inline "불러오는 중" bar (④) without covering my calendar; it
    // clears when the loader finishes (setLoadingColleague(null) in the effect).
    setLoadingColleague(meta.name)

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
    setMenuOpen(false)
    try {
      await logout()
    } catch {
      // signOut already best-effort-cleared storage; navigate anyway.
    }
    // Hard navigation rather than router.replace — defeats any in-memory
    // session state the supabase client (or the prefetched /login bundle)
    // might still be holding, which was causing the "/login → /calendar
    // 튕겨나옴" bounce-back even after signOut cleared localStorage.
    if (typeof window !== 'undefined') {
      window.location.replace('/login')
    }
  }

  // Cold-boot loading visuals are delay-gated: a fast resolve (session/data
  // already warm) shows a neutral surface for a beat, never flashing a loader.
  // Only a genuinely slow resolve reveals the splash (①) / skeleton (⑤).
  const showBoot = useDelayedFlag(!session, 200)
  const showSkeleton = useDelayedFlag(!!session && booting, 150)
  if (!session) {
    return showBoot ? <BootSplash /> : <div className="min-h-[100dvh] bg-surface" />
  }
  if (booting) {
    return showSkeleton
      ? <CalendarSkeleton name={session.name} photo={session.photo} year={year} month={month} />
      : <div className="min-h-[100dvh] bg-surface" />
  }

  const overlayOpen = detailOpen || searchOpen || uploadOpen || menuOpen || manageOpen || inviteOpen || !!memberSheet
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
            onReorder={handleReorderGroups}
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
                <button
                  key={c.uid}
                  onClick={() => { closeOverlays(); setMemberSheet(c) }}
                  aria-label={`${c.name} 프로필`}
                >
                  <PersonPill
                    name={c.name}
                    photo={c.photo}
                    ringColor={compareColorOf(c)}
                    avatarColor={c.color}
                    pending={pending}
                    editable={!pending}
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
                i === 0 ? 'text-danger' : i === 6 ? 'text-c1' : 'text-ink-700'
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
                    dow={ci}
                    holiday={holidayNameFor(c.iso)}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── 근무표 유무 양쪽 모두 한 줄 인라인. 없을 땐 등록 진입점, 있을 땐 카운터. */}
      {/* FAB(56px, bottom 36px)가 이 영역 위에 떠 있어 범례를 가렸음 — FAB가 뜨는
          경우(hasMySchedule)에만 하단 여백을 확보해 범례가 FAB 위로 올라오게 한다. */}
      <div
        className="px-4 pt-3 text-caption text-ink-500"
        style={{ paddingBottom: hasMySchedule ? 'calc(108px + env(safe-area-inset-bottom))' : '24px' }}
      >
        {hasMySchedule ? (
          <div className="bg-bg px-3.5 py-2.5 rounded-md">
            <div className="flex items-center gap-2">
              <span className="text-brand shrink-0"><UploadIcon size={14} /></span>
              <span>
                이번 달{' '}
                <strong className="font-en text-ink-700">내 근무 {workDays}일</strong>
                {' · '}휴무 {offDays}일 · 비교 동료 {compares.length}명
              </span>
            </div>
            <div className="border-t border-line my-2.5" />
            <CalendarLegend />
          </div>
        ) : (
          <button
            onClick={openUpload}
            className="w-full flex items-center gap-2 bg-brand-050 px-3.5 py-2.5 rounded-md text-left"
          >
            <span className="text-brand shrink-0"><UploadIcon size={14} /></span>
            <span className="flex-1 text-ink-700 font-semibold">이번 달 내 근무표가 없어요</span>
            <span className="text-brand font-semibold shrink-0">등록하기 →</span>
          </button>
        )}
      </div>

      <div className="flex-1" />

      {/* ── ④ 동료 불러오기 인라인 바 ── 추가한 동료 일정을 페치하는 동안만.
          전체화면 가림 없이 내 캘린더 유지. FAB와 겹치지 않게 FAB는 잠시 숨김. */}
      {loadingColleague && !overlayOpen && (
        <div
          className="absolute left-4 right-4 z-fab flex items-center gap-2.5 bg-surface border border-line rounded-md px-3.5 py-3 shadow-[0_8px_24px_rgba(13,30,55,0.12)]"
          style={{ bottom: 'calc(30px + env(safe-area-inset-bottom))' }}
        >
          <Spinner size={20} color="var(--c1)" />
          <div className="text-[13px] font-medium text-ink-700">
            <strong className="text-ink-900">{loadingColleague}</strong>님 근무표를 불러오는 중…
          </div>
        </div>
      )}

      {/* ── FAB ── 빈 상태에선 footer 인라인 링크가 단일 진입점이라 숨김.
          동료 로딩 바가 뜬 동안엔 겹침 방지로 숨김. */}
      {!overlayOpen && hasMySchedule && !loadingColleague && (
        <button
          onClick={openUpload}
          aria-label="근무표 등록"
          className="absolute right-[18px] w-fab h-fab rounded-full bg-brand text-ink-on-brand grid place-items-center shadow-sh-brand z-fab active:scale-95 transition-transform"
          style={{ bottom: 'calc(36px + env(safe-area-inset-bottom))' }}
        >
          <PlusIcon size={22} />
        </button>
      )}

      {/* ── Personal first-entry hint (non-blocking, dismissible) ── */}
      {!overlayOpen && session.profileType === 'personal' && !hasMySchedule && !hintDismissed && (
        <PersonalHintCard
          ownerName={compares[0]?.name}
          onRegister={() => { dismissHint(); openUpload() }}
          onDismiss={dismissHint}
        />
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
          onInvite={openInvite}
          onLogout={handleLogout}
        />
      </BottomSheet>

      {/* ── 친구 초대 ── */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <InviteCreateSheet
          groups={groupsState.groups}
          activeGroupId={groupsState.activeGroupId}
          onClose={() => setInviteOpen(false)}
          showToast={showToast}
        />
      </BottomSheet>

      {/* ── Compare-member mini profile ── */}
      <BottomSheet open={!!memberSheet} onClose={() => setMemberSheet(null)}>
        {memberSheet && (
          <CompareMemberSheet
            member={memberSheet}
            pending={!session.isDemo && shareStatus[memberSheet.uid] === 'pending'}
            isDemo={session.isDemo}
            usedBy={compares.reduce((acc, c) => {
              if (c.uid !== memberSheet.uid && !(c.color in acc)) acc[c.color] = c.name
              return acc
            }, {} as Partial<Record<CompareColor, string>>)}
            onClose={() => setMemberSheet(null)}
            onRemove={() => {
              const m = memberSheet
              setMemberSheet(null)
              toggleCompare(m.uid)
            }}
            onChangeColor={color => {
              const owner = setMemberColor(session.uid, memberSheet.uid, color)
              setColorOverrides(owner)
              // Reflect on the open sheet so the swatch check moves immediately.
              setMemberSheet(s => s ? { ...s, color } : s)
            }}
          />
        )}
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
          lookupEmail={lookupEmail}
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
          userName={session.isDemo ? undefined : session.name}
          userId={session.uid}
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

/* 표시 안내 — 셀의 각 표시가 무슨 뜻인지 한눈에. 비주얼은 실제 셀과 동일하게
 * 그려 매칭이 바로 되도록 한다. 핵심 혼동(연한 칩=근무 vs 취소선=휴무 vs
 * 그냥 숫자=일정 없음)을 분명히 구분. */
function CalendarLegend() {
  return (
    <div>
      <p className="text-[11px] font-bold text-ink-700 mb-2">표시 안내</p>
      <div className="flex flex-wrap gap-x-3.5 gap-y-2 text-[11px] text-ink-500 leading-none">
        {/* 오늘 */}
        <LegendItem label="오늘">
          <span className="w-[18px] h-[18px] rounded-full bg-brand inline-block" />
        </LegendItem>
        {/* 공휴일 */}
        <LegendItem label="공휴일">
          <span className="relative inline-grid place-items-center w-[18px] h-[18px]">
            <span className="absolute top-[1px] w-[9px] h-[2px] rounded-[1px] bg-danger" />
            <span className="font-en text-[12px] text-danger">1</span>
          </span>
        </LegendItem>
        {/* 근무 1명 — 그 사람 색 칩 */}
        <LegendItem label="근무 · 사람 색">
          <span
            className="font-en text-[12px] font-semibold px-[6px] py-[1px] rounded-pill leading-none"
            style={{ background: 'color-mix(in oklab, var(--brand) 16%, white)', color: 'var(--brand)' }}
          >
            1
          </span>
        </LegendItem>
        {/* 근무 2명+ — 색 점 */}
        <LegendItem label="여러 명 근무">
          <span className="inline-flex items-center w-[18px] justify-center">
            {[BRAND, 'var(--c1)', 'var(--c2)'].map((c, i) => (
              <span
                key={i}
                className="w-[6px] h-[6px] rounded-full shadow-[0_0_0_1px_#fff]"
                style={{ background: c, marginLeft: i > 0 ? -2 : 0 }}
              />
            ))}
          </span>
        </LegendItem>
        {/* 휴무 — 취소선 */}
        <LegendItem label="휴무 (쉬는 날)">
          <span className="font-en text-[12px] text-ink-500 line-through decoration-ink-300">1</span>
        </LegendItem>
        {/* 일정 없음 — 그냥 숫자 */}
        <LegendItem label="일정 없음">
          <span className="font-en text-[12px] text-ink-900">1</span>
        </LegendItem>
      </div>
    </div>
  )
}

function LegendItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-grid place-items-center w-[18px] h-[18px] shrink-0">{children}</span>
      <span>{label}</span>
    </span>
  )
}

function PersonPill({ name, photo, ringColor, avatarColor, self, pending, editable }: {
  name: string
  photo?: string
  ringColor: string
  avatarColor: 'brand' | CompareColor
  self?: boolean
  pending?: boolean
  /** Colleague pill — show a small pencil badge (in the colleague's color) to
   *  hint the pill is tappable to recolor. */
  editable?: boolean
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
        {editable && !self && (
          <span
            className="absolute -right-[3px] -bottom-[3px] w-[18px] h-[18px] rounded-full grid place-items-center text-white shadow-[0_0_0_2px_#fff]"
            style={{ background: ringColor }}
          >
            <EditIcon size={9} />
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

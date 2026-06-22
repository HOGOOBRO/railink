'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EditIcon, PlusIcon } from '@/components/ui/icons'
import { MAX_GROUPS } from '@/lib/store/groups'
import type { Group } from '@/lib/types/schedule'

const LONG_PRESS_MS = 450     // 그 시간 이상 누르면 drag 모드 진입
const MOVE_CANCEL_PX = 8      // 그 안에 손가락이 움직이면 long-press 취소(스크롤 의도)

/* §19 pill-tab zone — sits below the top bar, above the compare strip. Renders
 * the group pills + the "+ 그룹" pill + a secondary header row (active group
 * name + 그룹 관리 link). Only mounted when the user has at least one group.
 *
 * Long-press a pill → drags it left/right; release commits the new order via
 * onReorder. Implemented with PointerEvents directly (no dnd library): the row
 * is a horizontal scroller, so we differentiate scroll vs reorder by waiting
 * 450 ms before switching modes and cancelling on any meaningful motion before
 * that. Click-after-drag is suppressed for one frame so the release doesn't
 * also select the just-dragged group. */
interface Props {
  groups: Group[]
  activeGroupId: string | null
  activeGroupName: string
  onSelect: (id: string) => void
  onAddGroup: () => void
  onManage: () => void
  onReorder: (orderedIds: string[]) => void
  showToast: (msg: string, kind?: 'default' | 'success' | 'danger') => void
}

export function GroupTabs({
  groups, activeGroupId, activeGroupName,
  onSelect, onAddGroup, onManage, onReorder, showToast,
}: Props) {
  const t = useTranslations('calendarUi.groupTabs')
  const atMax = groups.length >= MAX_GROUPS
  const rowRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<number | null>(null)
  const pressOriginRef = useRef<{ x: number; y: number; id: string } | null>(null)
  const suppressClickRef = useRef(false)
  const [dragId, setDragId] = useState<string | null>(null)
  // Local optimistic order during a drag. Synced from props when idle so other
  // mutations (create/rename/delete) still flow through.
  const [order, setOrder] = useState<Group[]>(groups)
  useEffect(() => { if (!dragId) setOrder(groups) }, [groups, dragId])

  function clearPressTimer() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function onPillPointerDown(e: React.PointerEvent, g: Group) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pressOriginRef.current = { x: e.clientX, y: e.clientY, id: g.id }
    clearPressTimer()
    longPressTimer.current = window.setTimeout(() => {
      setDragId(g.id)
      // 가능한 단말이면 짧은 햅틱 — Android Chrome 한정, iOS는 무시(에러 없음).
      navigator.vibrate?.(8)
    }, LONG_PRESS_MS)
  }

  function onRowPointerMove(e: React.PointerEvent) {
    const origin = pressOriginRef.current
    if (!origin) return

    // long-press 인지 전이면 거리 임계로 long-press 취소(스크롤 의도).
    if (!dragId) {
      const dx = Math.abs(e.clientX - origin.x)
      const dy = Math.abs(e.clientY - origin.y)
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        clearPressTimer()
        pressOriginRef.current = null
      }
      return
    }

    // drag 모드 — 손가락 X에 가장 가까운 다른 칩과 위치 swap.
    if (!rowRef.current) return
    const pills = rowRef.current.querySelectorAll<HTMLElement>('[data-group-pill]')
    let nearestId: string | null = null
    let nearestDist = Infinity
    pills.forEach(el => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const d = Math.abs(e.clientX - cx)
      if (d < nearestDist) {
        nearestDist = d
        nearestId = el.dataset.groupPill ?? null
      }
    })
    if (nearestId && nearestId !== dragId) {
      setOrder(curr => {
        const fromIdx = curr.findIndex(g => g.id === dragId)
        const toIdx = curr.findIndex(g => g.id === nearestId)
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return curr
        const next = [...curr]
        const [moved] = next.splice(fromIdx, 1)
        next.splice(toIdx, 0, moved)
        return next
      })
    }
  }

  function endPress() {
    clearPressTimer()
    if (dragId) {
      // 새 순서가 기존과 다르면 commit. 짧은 시간만 click suppress.
      const orderedIds = order.map(g => g.id)
      const originalIds = groups.map(g => g.id)
      const changed = orderedIds.some((id, i) => id !== originalIds[i])
      if (changed) onReorder(orderedIds)
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 50)
    }
    setDragId(null)
    pressOriginRef.current = null
  }

  return (
    <div className="pt-2.5">
      {/* Tab row */}
      <div
        ref={rowRef}
        onPointerMove={onRowPointerMove}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onPointerLeave={() => { /* row 밖으로 나가도 commit/취소는 pointerup에서. */ }}
        className="flex items-center gap-1.5 px-3 overflow-x-auto"
        style={{
          scrollbarWidth: 'none',
          touchAction: dragId ? 'none' : 'auto',
        }}
      >
        {order.map(g => {
          const active = g.id === activeGroupId
          const dragging = g.id === dragId
          return (
            <button
              key={g.id}
              data-group-pill={g.id}
              onPointerDown={e => onPillPointerDown(e, g)}
              onClick={() => { if (!suppressClickRef.current && !dragId) onSelect(g.id) }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-pill whitespace-nowrap shrink-0 select-none transition-transform ${
                active ? 'bg-brand text-white' : 'bg-bg text-ink-700'
              } ${dragging ? 'scale-105 shadow-sh-brand relative z-10' : ''}`}
              style={{
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                touchAction: dragId ? 'none' : 'manipulation',
              }}
            >
              <span className={`text-[13px] ${active ? 'font-bold' : 'font-semibold'}`}>{g.name}</span>
              <span
                className="font-en text-[11px] font-bold"
                style={{ color: active ? 'rgba(255,255,255,0.7)' : 'var(--ink-3)' }}
              >
                {g.members.length}
              </span>
            </button>
          )
        })}
        <button
          onClick={() => (atMax ? showToast(t('toastMaxGroups', { max: MAX_GROUPS }), 'danger') : onAddGroup())}
          className={`inline-flex items-center gap-1 px-3 py-2 rounded-pill border border-dashed border-line-2 text-ink-500 text-[13px] font-semibold whitespace-nowrap shrink-0 ${
            atMax ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          <PlusIcon size={14} /> {t('groupPill')}
        </button>
      </div>

      {/* Secondary header */}
      <div className="flex items-center justify-between px-4 mt-1.5 mb-0.5">
        <span className="text-[11px] font-bold text-ink-500 uppercase" style={{ letterSpacing: '0.06em' }}>
          {t('comparing', { name: activeGroupName })}
        </span>
        <button
          onClick={onManage}
          className="inline-flex items-center gap-1 text-ink-500 text-[11px] font-semibold"
        >
          <EditIcon size={12} /> {t('manage')}
        </button>
      </div>
    </div>
  )
}

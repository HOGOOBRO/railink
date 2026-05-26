'use client'

import { EditIcon, PlusIcon } from '@/components/ui/icons'
import { MAX_GROUPS } from '@/lib/store/groups'
import type { Group } from '@/lib/types/schedule'

/* §19 pill-tab zone — sits below the top bar, above the compare strip. Renders
 * the group pills + the "+ 그룹" pill + a secondary header row (active group
 * name + 그룹 관리 link). Only mounted when the user has at least one group. */
interface Props {
  groups: Group[]
  activeGroupId: string | null
  activeGroupName: string
  onSelect: (id: string) => void
  onAddGroup: () => void
  onManage: () => void
  showToast: (msg: string, kind?: 'default' | 'success' | 'danger') => void
}

export function GroupTabs({
  groups, activeGroupId, activeGroupName, onSelect, onAddGroup, onManage, showToast,
}: Props) {
  const atMax = groups.length >= MAX_GROUPS
  return (
    <div className="pt-2.5">
      {/* Tab row */}
      <div className="flex items-center gap-1.5 px-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {groups.map(g => {
          const active = g.id === activeGroupId
          return (
            <button
              key={g.id}
              onClick={() => onSelect(g.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-pill whitespace-nowrap shrink-0 ${
                active ? 'bg-brand text-white' : 'bg-bg text-ink-700'
              }`}
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
          onClick={() => (atMax ? showToast('그룹은 최대 8개까지 만들 수 있어요.', 'danger') : onAddGroup())}
          className={`inline-flex items-center gap-1 px-3 py-2 rounded-pill border border-dashed border-line-2 text-ink-500 text-[13px] font-semibold whitespace-nowrap shrink-0 ${
            atMax ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          <PlusIcon size={14} /> 그룹
        </button>
      </div>

      {/* Secondary header */}
      <div className="flex items-center justify-between px-4 mt-1.5 mb-0.5">
        <span className="text-[11px] font-bold text-ink-500 uppercase" style={{ letterSpacing: '0.06em' }}>
          비교 중 · {activeGroupName}
        </span>
        <button
          onClick={onManage}
          className="inline-flex items-center gap-1 text-ink-500 text-[11px] font-semibold"
        >
          <EditIcon size={12} /> 그룹 관리
        </button>
      </div>
    </div>
  )
}

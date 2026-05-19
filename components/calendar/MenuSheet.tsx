'use client'

import { ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import {
  UserIcon, UploadIcon, InfoIcon, LogoutIcon, ChevronRightIcon,
} from '@/components/ui/icons'
import type { Session } from '@/lib/auth'

interface MenuSheetProps {
  session: Session
  compareCount: number
  onManageSchedule: () => void
  onLogout: () => void
}

export function MenuSheet({ session, compareCount, onManageSchedule, onLogout }: MenuSheetProps) {
  return (
    <div className="flex flex-col pb-7">
      <div className="px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-3.5 px-3.5 py-3.5 bg-brand-050 rounded-lg">
          <Avatar name={session.name} photo={session.photo} size="xl" color="brand" />
          <div className="flex-1 min-w-0">
            <p className="text-subtitle font-bold tracking-tight text-ink-900">{session.name}</p>
            <p className="font-en text-caption text-ink-700 mt-0.5">
              {session.employeeId}{session.part ? ` · ${session.part}파트` : ''}
            </p>
            <p className="font-en text-caption text-ink-500 mt-px truncate">{session.email}</p>
          </div>
        </div>
        <p className="flex gap-2.5 mt-2.5 text-caption text-ink-500">
          비교 동료 <strong className="font-en text-ink-700">{compareCount}</strong>명
        </p>
      </div>

      <div className="h-px bg-line mx-4 my-2" />

      <div className="px-2 pb-3">
        <MenuRow icon={<UserIcon size={18} />} label="내 정보" />
        <MenuRow icon={<UploadIcon size={18} />} label="내 근무표 관리" onClick={onManageSchedule} />
        <MenuRow icon={<InfoIcon size={18} />} label="도움말 · 약관" />
        <div className="h-px bg-line mx-4 my-1" />
        <MenuRow icon={<LogoutIcon size={18} />} label="로그아웃" danger onClick={onLogout} />
      </div>
    </div>
  )
}

function MenuRow({ icon, label, danger, onClick }: {
  icon: ReactNode
  label: string
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-md text-body font-medium text-left ${
        danger ? 'text-danger hover:bg-danger-soft' : 'text-ink-900 hover:bg-bg'
      } transition-colors`}
    >
      <span className={danger ? 'text-danger' : 'text-ink-700'}>{icon}</span>
      <span className="flex-1">{label}</span>
      <span className={danger ? 'text-danger' : 'text-ink-300'}>
        <ChevronRightIcon size={16} />
      </span>
    </button>
  )
}

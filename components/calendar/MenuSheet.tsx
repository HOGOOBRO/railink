'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import {
  UserIcon, UserPlusIcon, UploadIcon, InfoIcon, LogoutIcon, ChevronRightIcon, EditIcon,
} from '@/components/ui/icons'
import type { Session } from '@/lib/auth'

interface MenuSheetProps {
  session: Session
  compareCount: number
  /** Pending share requests waiting for my response → dot on the 내 정보 row. */
  hasPending?: boolean
  onManageSchedule: () => void
  onInvite: () => void
  onLogout: () => void
}

export function MenuSheet({ session, compareCount, hasPending, onManageSchedule, onInvite, onLogout }: MenuSheetProps) {
  const isPersonal = session.profileType === 'personal'
  return (
    <div className="flex flex-col pb-7">
      <div className="px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-3.5 px-3.5 py-3.5 bg-brand-050 rounded-lg">
          <Avatar name={session.name} photo={session.photo} size="xl" color="brand" />
          <div className="flex-1 min-w-0">
            <p className="text-subtitle font-bold tracking-tight text-ink-900">{session.name}</p>
            <p className={`text-caption text-ink-700 mt-0.5 ${isPersonal ? 'font-kr' : 'font-en'}`}>
              {isPersonal ? '개인 계정' : `${session.employeeId}${session.part ? ` · ${session.part}파트` : ''}`}
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
        <MenuRow icon={<UserIcon size={18} />} label="내 정보" href="/settings/info" indicator={hasPending} />
        <MenuRow icon={<UserPlusIcon size={18} />} label="친구 초대" onClick={onInvite} />
        <MenuRow icon={<UploadIcon size={18} />} label="내 근무표 관리" onClick={onManageSchedule} />
        <MenuRow icon={<EditIcon size={18} />} label="내 근무 코드" href="/settings/codebook" />
        <MenuRow icon={<InfoIcon size={18} />} label="도움말 · 약관" href="/settings/help" />
        <div className="h-px bg-line mx-4 my-1" />
        <MenuRow icon={<LogoutIcon size={18} />} label="로그아웃" danger onClick={onLogout} />
      </div>
    </div>
  )
}

function MenuRow({ icon, label, danger, onClick, href, indicator }: {
  icon: ReactNode
  label: string
  danger?: boolean
  onClick?: () => void
  href?: string
  indicator?: boolean
}) {
  const cls = `relative w-full flex items-center gap-3.5 px-4 py-3.5 rounded-md text-body font-medium text-left ${
    danger ? 'text-danger hover:bg-danger-soft' : 'text-ink-900 hover:bg-bg'
  } transition-colors`
  const content = (
    <>
      {indicator && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
      )}
      <span className={danger ? 'text-danger' : 'text-ink-700'}>{icon}</span>
      <span className="flex-1">{label}</span>
      <span className={danger ? 'text-danger' : 'text-ink-300'}>
        <ChevronRightIcon size={16} />
      </span>
    </>
  )
  if (href) return <Link href={href} className={cls}>{content}</Link>
  return <button onClick={onClick} className={cls}>{content}</button>
}

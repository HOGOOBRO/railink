'use client'

/* Single brand FAB that opens a two-action speed-dial (약속 잡기 / 근무표 등록).
 * Folds the old upload-only FAB + the new appointment entry into one control so
 * there's never two competing FABs (handoff §2 / decision #5). The + rotates 45°
 * and a single white menu card rises above it; a scrim closes on tap-outside. */

import { useState } from 'react'
import { PlusIcon, PinIcon, UploadIcon } from '@/components/ui/icons'

export function FabSpeedDial({
  onAppointment, onUpload,
}: {
  onAppointment: () => void
  onUpload: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-fab animate-backdrop-in"
          style={{ background: 'rgba(13,30,55,0.30)' }}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className="absolute z-fab flex flex-col items-end gap-3"
        style={{ right: 18, bottom: 'calc(30px + env(safe-area-inset-bottom))' }}
      >
        {open && (
          <div
            className="bg-surface rounded-lg shadow-sh3 overflow-hidden animate-fade-in"
            style={{ minWidth: 168 }}
          >
            <MenuRow icon={<PinIcon size={18} />} label="일정 추가" onClick={() => { setOpen(false); onAppointment() }} />
            <div className="h-px bg-line mx-3.5" />
            <MenuRow icon={<UploadIcon size={18} />} label="근무표 등록" onClick={() => { setOpen(false); onUpload() }} />
          </div>
        )}

        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? '메뉴 닫기' : '추가'}
          aria-expanded={open}
          className="w-[58px] h-[58px] rounded-full bg-brand text-ink-on-brand grid place-items-center shadow-sh-brand active:scale-95 transition-transform"
        >
          <span className="grid transition-transform duration-200" style={{ transform: open ? 'rotate(45deg)' : 'none' }}>
            <PlusIcon size={24} />
          </span>
        </button>
      </div>
    </>
  )
}

function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 text-left text-ink-900 font-semibold text-callout hover:bg-bg active:bg-bg"
      style={{ height: 44 }}
    >
      <span className="text-brand shrink-0">{icon}</span>
      {label}
    </button>
  )
}

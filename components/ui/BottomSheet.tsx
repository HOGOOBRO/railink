'use client'

import { ReactNode, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

export function BottomSheet({ open, onClose, children, className }: BottomSheetProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[50]"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app-frame z-[50]',
          'bg-surface rounded-t-[22px] shadow-sh4',
          'animate-[slide-up_.28s_cubic-bezier(.2,.8,.2,1)]',
          className,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-pill bg-line-2" />
        </div>
        {children}
      </div>
    </>
  )
}

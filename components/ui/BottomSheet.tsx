'use client'

import {
  CSSProperties, PointerEvent as ReactPointerEvent, ReactNode,
  useEffect, useRef, useState,
} from 'react'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

const CLOSE_THRESHOLD_PX = 96
const CLOSE_THRESHOLD_FRAC = 0.28
const CLOSE_VELOCITY = 0.6 // px/ms — flick threshold
const OUT_MS = 220

export function BottomSheet({ open, onClose, children, className }: BottomSheetProps) {
  // Render lifecycle: mounted controls DOM presence; closing drives the exit slide.
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const [opened, setOpened] = useState(false)

  // Drag state (px from rest position).
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ y: number; t: number } | null>(null)
  const lastSampleRef = useRef<{ y: number; t: number } | null>(null)

  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open && !mounted) return
    const frame = window.requestAnimationFrame(() => {
      if (open) {
        setMounted(true)
        setClosing(false)
        setOpened(false)
        setDragY(0)
      } else {
        setClosing(true)
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, mounted])

  // Body scroll lock for the lifetime of the sheet.
  useEffect(() => {
    if (mounted) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [mounted])

  // When closing, animate the sheet off-screen via inline transform, then unmount.
  useEffect(() => {
    if (!closing) return
    const h = sheetRef.current?.offsetHeight ?? 800
    setDragY(h)
    const t = window.setTimeout(() => {
      setMounted(false)
      setClosing(false)
      setOpened(false)
      setDragY(0)
    }, OUT_MS)
    return () => window.clearTimeout(t)
  }, [closing])

  function onEntryAnimEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (!closing) setOpened(true)
  }

  function startDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!opened || closing) return
    dragStartRef.current = { y: e.clientY - dragY, t: e.timeStamp }
    lastSampleRef.current = { y: e.clientY, t: e.timeStamp }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function moveDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || !dragStartRef.current) return
    const next = Math.max(0, e.clientY - dragStartRef.current.y)
    setDragY(next)
    lastSampleRef.current = { y: e.clientY, t: e.timeStamp }
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }

    const h = sheetRef.current?.offsetHeight ?? 800
    const start = dragStartRef.current
    const last = lastSampleRef.current
    dragStartRef.current = null
    lastSampleRef.current = null

    const velocity = (start && last && last.t > start.t)
      ? (last.y - (start.y + dragY)) / (last.t - start.t)
      : 0
    const shouldClose =
      dragY > Math.min(CLOSE_THRESHOLD_PX, h * CLOSE_THRESHOLD_FRAC) ||
      velocity > CLOSE_VELOCITY

    if (shouldClose) onClose()      // closing useEffect picks up and slides the rest of the way
    else setDragY(0)                // snap back via transition
  }

  if (!mounted) return null

  // Inline transform takes over once the entry animation has completed, or while closing.
  const useInline = opened || closing
  const sheetStyle: CSSProperties = {
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    ...(useInline && {
      transform: `translate(-50%, ${dragY}px)`,
      transition: dragging
        ? 'none'
        : closing
          ? 'transform .22s cubic-bezier(.3,0,.8,.15)'
          : 'transform .22s cubic-bezier(.2,.8,.2,1)',
    }),
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/30 z-[50]',
          closing ? 'animate-backdrop-out' : 'animate-backdrop-in',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        onAnimationEnd={onEntryAnimEnd}
        className={cn(
          'fixed bottom-0 left-1/2 w-full max-w-app-frame z-[50]',
          'bg-surface rounded-t-[22px] shadow-sh4',
          !opened && !closing && 'animate-sheet-up',
          className,
        )}
        style={sheetStyle}
      >
        {/* Drag handle — only this area is draggable */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="w-10 h-1 rounded-pill bg-line-2" />
        </div>
        {children}
      </div>
    </>
  )
}

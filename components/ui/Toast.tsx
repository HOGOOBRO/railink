'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CheckIcon } from '@/components/ui/icons'

type ToastType = 'default' | 'success' | 'danger'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'default') => {
    const id = crypto.randomUUID()
    // 한 번에 하나만 — 쌓여서 화면 아래로 늘어나지 않게 직전 토스트를 교체한다.
    setToasts([{ id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 2400)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[80] flex flex-col gap-2 max-w-[calc(var(--spacing-app-frame)-32px)]">
        {toasts.map(toast => {
          const isErr = toast.type === 'danger'
          return (
            <div
              key={toast.id}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-[14px] text-callout font-semibold border shadow-sh2',
                'animate-[fade-in_.22s_ease]',
              )}
              // 전 서비스 공통(테마 무관): 연한 배경 + 보더 + 진한 텍스트. 오류만 연한 빨강.
              style={{
                background: isErr ? 'var(--toast-err-bg)' : 'var(--toast-bg)',
                borderColor: isErr ? 'var(--toast-err-border)' : 'var(--toast-border)',
                color: isErr ? 'var(--toast-err-text)' : 'var(--toast-text)',
              }}
            >
              {toast.type === 'success' && (
                <span className="shrink-0" style={{ color: 'var(--brand)' }}><CheckIcon size={16} /></span>
              )}
              {isErr && (
                <span className="shrink-0 w-[17px] h-[17px] grid place-items-center rounded-full text-[11px] font-bold leading-none text-white" style={{ background: 'var(--toast-err-text)' }}>!</span>
              )}
              <span>{toast.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 2400)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[80] flex flex-col gap-2 max-w-[calc(var(--spacing-app-frame)-32px)]">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              'px-4 py-3 rounded-pill text-callout font-semibold shadow-sh2',
              'animate-[fade-in_.22s_ease]',
              toast.type === 'default' && 'bg-ink-900 text-ink-on-brand',
              toast.type === 'success' && 'bg-success text-ink-on-brand',
              toast.type === 'danger'  && 'bg-danger text-ink-on-brand',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

'use client'

import { UploadIcon, CloseIcon } from '@/components/ui/icons'

interface PersonalHintCardProps {
  /** Inviter (or any already-visible compare member) name → "이미 보여요" copy.
   *  Undefined → direct sign-up copy. */
  ownerName?: string
  onRegister: () => void
  onDismiss: () => void
}

/* Personal first-entry helper — small, dismissible, NON-blocking (no modal, no
 * full-screen onboarding). An empty own slot is a normal state; this just nudges
 * toward registering or inviting. Sits above the FAB. */
export function PersonalHintCard({ ownerName, onRegister, onDismiss }: PersonalHintCardProps) {
  return (
    <div
      className="absolute left-4 right-4 z-fab bg-surface rounded-lg shadow-sh3 border border-line flex items-center gap-3 pl-4 pr-3 py-3.5"
      style={{ bottom: 'calc(104px + env(safe-area-inset-bottom))' }}
    >
      <span className="w-9 h-9 rounded-md bg-brand-050 text-brand grid place-items-center shrink-0">
        <UploadIcon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-callout font-bold text-ink-900 leading-snug">내 일정도 같이 비교해 볼까요?</p>
        <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
          {ownerName
            ? `${ownerName} 님은 이미 보이고 있어요. 내 근무도 더하면 서로 맞춰봐요.`
            : '내 근무를 등록하거나 친구를 초대해 비교를 시작해요.'}
        </p>
      </div>
      <button
        onClick={onRegister}
        className="shrink-0 h-btn-sm px-3.5 rounded-pill bg-brand text-ink-on-brand text-caption font-bold"
      >
        등록
      </button>
      <button
        onClick={onDismiss}
        aria-label="안내 닫기"
        className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-ink-300 hover:bg-bg"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  )
}

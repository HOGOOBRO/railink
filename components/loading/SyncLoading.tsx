'use client'

import { useTranslations } from 'next-intl'
import { Spinner } from '@/components/ui/Spinner'

/* ② 근무표 불러오는 중 — full-screen spinner for a fast transition/reconnect
 * where there is genuinely no content to keep on screen.
 * design_handoff_loading_states §4. Deliberately minimal — spinner + label.
 *
 * NOT wired by default: the only current entry points either resolve via a
 * server redirect (`app/page.tsx` → /login, no client render) or already have a
 * better-fitting visual — the calendar cold boot uses the splash (①) then the
 * skeleton (⑤), and month navigation deliberately keeps the previous month on
 * screen rather than blanking it. Use this for a future full-screen refetch
 * that has no prior content to preserve (e.g. an explicit "reconnecting" gate). */
export function SyncLoading() {
  const t = useTranslations('loading')
  return (
    <div
      className="flex flex-col items-center justify-center gap-[18px] min-h-[100dvh] bg-surface"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <Spinner size={44} stroke={3.5} />
      <div className="text-[15px] font-semibold text-ink-700">{t('sync')}</div>
    </div>
  )
}

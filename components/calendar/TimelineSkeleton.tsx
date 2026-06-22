'use client'

import { useTranslations, useLocale } from 'next-intl'
import { DOW_KR } from '@/lib/schedule-utils'
import { Skeleton } from '@/components/ui/Skeleton'

/* ⑥ 타임라인 스켈레톤 — design_handoff_loading_states §5.
 *
 * NOT wired by default: the date-detail sheet (DetailSheet) renders from the
 * month data that is already in memory (the `people` prop), so opening a day
 * has no fetch and therefore no loading moment — wiring this to that instant
 * interaction would *add* a flash, not remove one. This component exists so it
 * can be dropped in the day a per-date lazy fetch is introduced; render it
 * inside the detail BottomSheet while that fetch is in flight.
 *
 * Header (date) is real — we always know which day was tapped; only the
 * schedule area shimmers. */

// 표시용 영어 요일. DOW_KR(lib)는 색상 인덱스 로직에 쓰고, 화면 라벨만 로케일에 맞춰 고른다.
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function TimelineSkeleton({ date, month }: { date: Date; month: number }) {
  const t = useTranslations('calendarUi.timelineSkeleton')
  const locale = useLocale()
  const day = date.getDate()
  const dow = date.getDay()
  const dowLabel = (locale === 'en' ? DOW_EN : DOW_KR)[dow]
  const dowClass = dow === 0 ? 'text-danger' : dow === 6 ? 'text-c1' : 'text-ink-500'

  return (
    <div className="flex flex-col" style={{ height: '88dvh' }}>
      {/* header — date real, aggregate line shimmer */}
      <div className="flex items-start justify-between px-5 pt-2 pb-2 shrink-0 border-b border-line">
        <div>
          <h3 className="text-title font-bold tracking-tighter text-ink-900">
            {t('dateHeader', { month, day })} <span className={`font-medium ${dowClass}`}>{dowLabel}</span>
          </h3>
          <div className="mt-1.5">
            <Skeleton className="w-[120px] h-3 rounded" />
          </div>
        </div>
      </div>

      {/* timeline body skeleton — hour rail + shimmer lanes */}
      <div className="flex-1 overflow-hidden px-5 py-4">
        <div className="text-[11px] font-bold text-ink-500 tracking-wider uppercase mb-3">{t('mySchedule')}</div>
        <div className="flex gap-2.5 h-full min-h-0">
          <div className="flex flex-col justify-between w-8 pt-0.5 pb-10">
            {['09', '12', '15', '18', '21'].map(h => (
              <span key={h} className="font-en text-[11px] font-semibold text-ink-300">{h}:00</span>
            ))}
          </div>
          <div className="relative flex-1 flex gap-2 pb-10">
            {[{ t: 'mt-4 h-28' }, { t: 'mt-16 h-36' }, { t: 'mt-10 h-24' }].map((ln, i) => (
              <div key={i} className="flex-1">
                <Skeleton className={`w-full ${ln.t} rounded-[10px]`} style={{ animationDelay: `${i * 0.18}s` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* action buttons skeleton */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 pt-3 border-t border-line bg-surface"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        <Skeleton className="w-[92px] h-9 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="w-[120px] h-9 rounded-lg" />
      </div>
    </div>
  )
}

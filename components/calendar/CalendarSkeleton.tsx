import { buildMonthCells, DOW_KR } from '@/lib/schedule-utils'
import { Avatar } from '@/components/ui/Avatar'
import { BrandMark, SearchIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadDots } from '@/components/ui/LoadDots'

/* ⑤ 캘린더 스켈레톤 — design_handoff_loading_states §5.
 * Mirrors the real calendar's static chrome (top bar, compare strip, month bar,
 * DOW, 6×7 grid with real date numbers) and shimmers only the data areas.
 * §5.5: never hardcode which days are work — every in-month cell gets the same
 * neutral shimmer bar, so we don't fake a roster we haven't loaded yet. */
export function CalendarSkeleton({
  name,
  photo,
  year,
  month,
}: {
  name: string
  photo?: string
  year: number
  month: number
}) {
  const weeks = buildMonthCells(year, month)

  return (
    <div className="relative flex flex-col min-h-[100dvh] bg-bg">
      {/* Top bar — real chrome; avatar is the real user */}
      <header
        className="border-b border-line"
        style={{ background: 'rgba(255,255,255,0.92)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="h-topbar flex items-center gap-2 px-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-7 h-7 grid place-items-center text-brand shrink-0">
              <BrandMark size={22} />
            </span>
            <span className="font-en text-subtitle font-[400] tracking-tight text-ink-900">RaiLink</span>
          </div>
          <span className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700">
            <SearchIcon size={20} />
          </span>
          <span className="w-10 grid place-items-center">
            <Avatar name={name} photo={photo} size="default" color="brand" />
          </span>
        </div>
      </header>

      {/* Compare strip — self pill real, colleague chips shimmer */}
      <section className="bg-surface border-b border-line pb-3.5">
        <div className="flex items-center justify-between px-4 pt-3 mb-2">
          <span className="text-[11px] font-bold text-ink-500 tracking-wider uppercase">비교 중인 동료</span>
          <Skeleton className="w-7 h-2.5 rounded" />
        </div>
        <div className="flex gap-2.5 overflow-hidden px-4 pt-1 pb-1 items-start">
          <div className="shrink-0 flex flex-col items-center gap-1.5 w-14">
            <div
              className="relative w-12 h-12 rounded-full bg-white grid place-items-center"
              style={{ boxShadow: 'inset 0 0 0 2px var(--brand)' }}
            >
              <Avatar name={name} size="lg" className="!w-[42px] !h-[42px]" color="brand" />
              <span className="absolute -right-1 -bottom-0.5 bg-brand text-ink-on-brand text-[9px] font-bold px-1.5 rounded-pill shadow-[0_0_0_2px_#fff]">
                나
              </span>
            </div>
            <span className="text-[11px] font-semibold max-w-[56px] truncate text-center text-ink-900">{name}</span>
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="shrink-0 flex flex-col items-center gap-1.5 w-14">
              <Skeleton className="w-12 h-12 rounded-full" />
              <Skeleton className="w-[30px] h-[9px] rounded" />
            </div>
          ))}
        </div>
      </section>

      {/* Month bar + DOW + grid */}
      <div className="bg-surface flex flex-col">
        <div className="flex items-center justify-between h-topbar px-4">
          <span className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700">
            <ChevronLeftIcon size={20} />
          </span>
          <span className="font-kr text-title font-bold tracking-tight text-ink-900">
            {year}년 {month}월
          </span>
          <span className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700">
            <ChevronRightIcon size={20} />
          </span>
        </div>

        <div className="grid grid-cols-7 border-b-2 border-divider">
          {DOW_KR.map((d, i) => (
            <div
              key={d}
              className={`text-center font-kr text-[13px] font-bold py-1 ${
                i === 0 ? 'text-danger' : i === 6 ? 'text-c1' : 'text-ink-700'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-px bg-bg">
          {weeks.map((wk, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-px">
              {wk.map((c, ci) => (
                <div key={ci} className="bg-surface h-14 flex flex-col items-center justify-center gap-1.5">
                  <span className={`font-en text-[15px] leading-none ${c.isOther ? 'text-ink-300' : 'text-ink-700'}`}>
                    {c.d}
                  </span>
                  {!c.isOther && <Skeleton className="w-7 h-1.5 rounded-full" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 bg-surface border border-line rounded-md px-3.5 py-2.5">
          <LoadDots />
          <span className="text-[12px] font-medium text-ink-500">이번 달 근무표 불러오는 중</span>
        </div>
      </div>
      <div className="flex-1" />
    </div>
  )
}

import { Skeleton } from '@/components/ui/Skeleton'
import { LoadDots } from '@/components/ui/LoadDots'

/* ③ AI 근무표 분석 — preview-table skeleton (design_handoff_loading_states §5).
 * Shown under the existing parse-progress indicator while the AI reads an
 * uploaded roster. Column headers are real (the shape the result will fill);
 * rows shimmer. No counts / progress numbers here — the live progress bar above
 * already owns that, and the row count is unknown until parsing finishes.
 *
 * Columns default to the KTX roster shape (사업일자 · 다이/열번 · 출근 · 퇴근).
 * Personal rosters have no 다이/열번 — pass ktx={false} to drop that column. */
export function AnalyzeTableSkeleton({ ktx = true }: { ktx?: boolean }) {
  const cols = ktx ? 'grid-cols-[90px_1fr_56px_56px]' : 'grid-cols-[1fr_56px_56px]'

  return (
    <div className="mt-3">
      <div className="border border-line rounded-xl overflow-hidden">
        <div
          className={`grid ${cols} gap-2 bg-bg px-2.5 py-2 border-b border-line text-[10px] font-bold text-ink-500 uppercase tracking-[0.04em]`}
        >
          <span>사업일자</span>
          {ktx && <span>다이/열번</span>}
          <span>출근</span>
          <span>퇴근</span>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`grid ${cols} gap-2 items-center px-2.5 py-[11px] ${i < 7 ? 'border-b border-line' : ''}`}
          >
            <Skeleton className="w-[52px] h-[11px] rounded" />
            {ktx && (
              <div className="flex items-center gap-1.5">
                <Skeleton className="w-10 h-[11px] rounded" />
                <Skeleton className="w-[34px] h-[9px] rounded" />
              </div>
            )}
            <Skeleton className="w-[38px] h-[11px] rounded" />
            <Skeleton className="w-[38px] h-[11px] rounded" />
          </div>
        ))}
      </div>
      <div className="mt-3.5 flex justify-center items-center gap-2.5">
        <LoadDots />
        <span className="text-[12px] font-medium text-ink-500">분석이 끝나면 결과를 확인할 수 있어요</span>
      </div>
    </div>
  )
}

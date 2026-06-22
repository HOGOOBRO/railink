'use client'

import { useTranslations } from 'next-intl'

/* 아시아나 등 '표(테이블) 형식' 로스터 업로드 안내용 "AI 스캔" 예시 카드.
 * ⚠️ 표시 데이터는 전부 합성(가짜) — 실제 편명/근무표가 아니라 일러스트다. 그래서 실제
 *    승무원 캡쳐를 박지 않고도 "이런 표를 올리세요"를 보여준다.
 * 실제 아시아나 로스터 컬럼(날짜·편명·구간·시각)을 흉내내, 사용자가 "내 근무표랑 같다"를
 * 한눈에 알게 한다. 색은 --brand 토큰이라 항공사 테마(아시아나=그레이)에 자동으로 맞춰진다. */

type Row =
  | { kind: 'flight'; date: string; flight: string; sector: string; time: string }
  | { kind: 'off'; date: string }
  | { kind: 'stby'; date: string }

const ROWS: Row[] = [
  { kind: 'flight', date: '04 토', flight: 'OZ132', sector: 'ICN→NRT', time: '09:10 → 11:40' },
  { kind: 'off', date: '05 일' },
  { kind: 'flight', date: '07 화', flight: 'OZ803', sector: 'GMP→CJU', time: '12:25 → 13:40' },
  { kind: 'stby', date: '08 수' },
  { kind: 'flight', date: '11 토', flight: 'OZ521', sector: 'ICN→FRA', time: '10:50 → 17:40' },
]

export function RosterExampleTable() {
  const t = useTranslations('calendarUi.rosterExampleTable')
  return (
    <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sh3 select-none">
      {/* header — 항공사 brand 색 */}
      <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: 'var(--brand)' }}>
        <span className="text-[12.5px] font-bold text-white tracking-tight font-en">
          2026 · 04 <span className="font-kr font-semibold opacity-90">{t('scheduleLabel')}</span>
        </span>
        <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }}>
          {t('example')}
        </span>
      </div>

      {/* body — 표 형식 */}
      <div className="px-2.5 pt-2 pb-2.5">
        {/* 컬럼 헤더 */}
        <div className="grid grid-cols-[2.4rem_3rem_1fr_auto] gap-1.5 px-1.5 pb-1.5 text-[9px] font-bold text-ink-300">
          <span>{t('colDate')}</span><span>{t('colFlight')}</span><span>{t('colSector')}</span><span className="text-right">{t('colTime')}</span>
        </div>

        <div className="relative overflow-hidden rounded-md">
          <div className="flex flex-col">
            {ROWS.map((r, i) => <RowView key={i} row={r} />)}
          </div>
          {/* 스캔 라인 — 표를 위→아래로 훑는다 (reduced-motion이면 숨김) */}
          <div className="rl-scan-line pointer-events-none absolute inset-x-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function RowView({ row }: { row: Row }) {
  const base = 'grid grid-cols-[2.4rem_3rem_1fr_auto] gap-1.5 items-center px-1.5 py-1.5 border-t border-line first:border-t-0'
  if (row.kind === 'off') {
    return (
      <div className={base}>
        <span className="text-[10px] font-bold text-ink-500 font-en">{row.date}</span>
        <span className="col-span-3 text-[9px] font-bold text-ink-300 font-en">DAY OFF</span>
      </div>
    )
  }
  if (row.kind === 'stby') {
    return (
      <div className={base}>
        <span className="text-[10px] font-bold text-ink-500 font-en">{row.date}</span>
        <span className="col-span-3 text-[9px] font-bold text-ink-300 font-en">STBY</span>
      </div>
    )
  }
  return (
    <div className={base}>
      <span className="text-[10px] font-bold text-ink-500 font-en">{row.date}</span>
      <span className="text-[9.5px] font-bold font-en px-1 py-0.5 rounded-xs text-center" style={{ background: 'var(--brand-050)', color: 'var(--brand)' }}>{row.flight}</span>
      <span className="text-[10px] font-bold text-ink-700 font-en truncate">{row.sector}</span>
      <span className="text-[9.5px] font-bold text-ink-900 font-en text-right">{row.time}</span>
    </div>
  )
}

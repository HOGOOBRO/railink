'use client'

import { useTranslations, useLocale } from 'next-intl'

/* 항공 승무원 업로드 안내용 "AI 스캔" 예시 카드.
 * ⚠️ 표시되는 데이터는 전부 합성(가짜)이다 — 실제 편명/이름/근무표가 아니라 순수
 *    일러스트. 그래서 실제 승무원 캡쳐를 박지 않고도 "이런 화면을 올려라"를 보여준다.
 * 색은 --brand / --accent 토큰을 쓰므로 항공사 테마(에어프레미아=네이비+코랄)에
 * 자동으로 맞춰진다. 스캔 라인이 그리드를 훑으며 "AI가 한 장을 통째로 읽는다"를 전달. */

// 'w' 근무(✈)·'o' 오프·'' 빈칸. 한 달 그리드 모양만 흉내낸 합성 배치.
const ROWS: ('w' | 'o' | '')[][] = [
  ['', 'w', 'o', 'o', 'w', 'o', 'w'],
  ['o', 'w', 'w', 'o', 'o', 'w', 'w'],
  ['w', 'o', 'w', 'w', 'w', 'w', 'o'],
  ['w', 'o', 'o', 'o', 'w', 'o', 'o'],
  ['o', 'w', 'w', '', '', '', ''],
]
// 표시용 요일 라벨. 한글/영어를 인덱스로 골라 로케일에 맞춰 보여준다(예시 카드 헤더).
const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function RosterExampleCard() {
  const t = useTranslations('calendarUi.rosterExampleCard')
  const locale = useLocale()
  const DOW = locale === 'en' ? DOW_EN : DOW_KR
  return (
    <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sh3 select-none">
      {/* header — 항공사 brand 색 */}
      <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: 'var(--brand)' }}>
        <span className="text-[12.5px] font-bold text-white tracking-tight font-en">
          2026 · 06 <span className="font-kr font-semibold opacity-90">{t('scheduleLabel')}</span>
        </span>
        <span
          className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.18)' }}
        >
          {t('example')}
        </span>
      </div>

      {/* body */}
      <div className="px-3 pt-2.5 pb-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW.map((d, i) => (
            <span
              key={d}
              className={`text-center text-[9px] font-bold ${i === 0 ? 'text-danger' : i === 6 ? 'text-c1' : 'text-ink-300'}`}
            >
              {d}
            </span>
          ))}
        </div>

        <div className="relative overflow-hidden rounded-md">
          <div className="grid grid-cols-7 gap-1">
            {ROWS.flat().map((c, i) => <Cell key={i} kind={c} />)}
          </div>
          {/* 스캔 라인 — 그리드를 위→아래로 훑는다 (reduced-motion이면 숨김) */}
          <div className="rl-scan-line pointer-events-none absolute inset-x-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function Cell({ kind }: { kind: 'w' | 'o' | '' }) {
  if (kind === '') return <div className="aspect-[5/6] rounded-md" />
  if (kind === 'o') {
    return (
      <div className="aspect-[5/6] rounded-md grid place-items-center bg-bg">
        <span className="text-[8px] font-bold text-ink-300 font-en">OFF</span>
      </div>
    )
  }
  // 근무 셀 — ✈ + 편명(코랄 바) + 시각(회색 바). 전부 추상/합성.
  return (
    <div
      className="aspect-[5/6] rounded-md flex flex-col items-center justify-center gap-[3px] px-1"
      style={{ background: 'var(--brand-050)' }}
    >
      <span style={{ color: 'var(--brand)' }} className="text-[9px] leading-none">✈</span>
      <span className="w-full h-[3px] rounded-full" style={{ background: 'var(--accent)' }} />
      <span className="w-3/4 h-[3px] rounded-full bg-line-2" />
    </div>
  )
}

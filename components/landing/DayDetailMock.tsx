'use client'

import { useEffect, useRef } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { BrandMark, SearchIcon, CloseIcon, EditIcon, PlusIcon, CakeIcon } from '@/components/ui/icons'
import { MonthTimeline, DAY_PX, type MonthPerson } from '@/components/calendar/MonthTimeline'
import { PhoneShell } from './PhoneShell'

/* 랜딩 "하루 보기" 목업 — 실제 DetailSheet의 시간대 타임라인(MonthTimeline)을
   그대로 재사용해, 그날 누가 몇 시에 일하고 언제 비는지를 보여준다. 정적이라
   탭 콜백은 넘기지 않는다. 데이터는 6월 12일(금) 3명 근무 + 세상을 생일. */

const FOCUS_DAY = 12
const TODAY = new Date(2026, 5, FOCUS_DAY) // 포커스 날을 today로 둬 거터 라벨이 brand

// 시간은 그날 기준 소수 시각(end>24 = 익일 종료/박차). 이 섹션은 카드에 풀네임이
// 노출돼 한글 별명("고양이가 세상을 구한다")이 문장처럼 읽혀 헷갈리므로, 직관적인
// 영문 이름(Theo/Daisy/Fred)으로 둔다. 포커스(12일) 외에 인접일(11일 야간/13일
// 오전)에도 실제 교대처럼 근무를 넣어 타임라인이 자연스럽게 채워지게 한다 — 사이엔
// 휴식 간격을 둔다. 헤더 "근무 3명"은 12일 기준(셋 다 12일 근무).
const PEOPLE: MonthPerson[] = [
  {
    uid: 'theo', name: 'Theo', tag: '나', color: 'var(--brand)',
    shifts: [
      { day: FOCUS_DAY, trainNr: 'H1055', dia: '1011', start: 9.97, end: 21.5 }, // 09:58 → 21:30
    ],
  },
  {
    uid: 'daisy', name: 'Daisy', color: 'var(--c1)',
    shifts: [
      { day: 11, trainNr: 'H1102', dia: '340', start: 18, end: 28 },             // 18:00 → 04:00(박차)
      { day: FOCUS_DAY, trainNr: 'H1055', dia: '287', start: 13.63, end: 25.13 }, // 13:38 → 01:08(익일)
    ],
  },
  {
    uid: 'fred', name: 'Fred', color: 'var(--c2)',
    shifts: [
      { day: FOCUS_DAY, trainNr: 'H1071', dia: '869', start: 12.2, end: 20.15 }, // 12:12 → 20:09
      { day: 13, trainNr: 'H1062', dia: '733', start: 6.83, end: 15.0 },         // 06:50 → 15:00
    ],
  },
]

export function DayDetailMock({ size, rotate }: { size?: string; rotate?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 정적 목업이라 스크롤은 막고(overflow-hidden), 포커스 날의 근무 카드(대략
  // 17:30 중심)를 고정 뷰 가운데에 둔다 — 빈 날로 넘어가지 않게. 레이아웃 확정
  // 뒤 한 번 더 맞춰 MonthTimeline의 폭 측정 리렌더 타이밍을 흡수한다.
  useEffect(() => {
    const set = () => {
      const el = scrollRef.current
      if (!el) return
      const center = (FOCUS_DAY - 1) * DAY_PX + 17.5 * 14 // 14 = px/hour
      el.scrollTop = Math.max(0, center - el.clientHeight / 2)
    }
    const r = requestAnimationFrame(set)
    const t = setTimeout(set, 200)
    return () => { cancelAnimationFrame(r); clearTimeout(t) }
  }, [])

  return (
    <PhoneShell size={size} rotate={rotate}>
      <div className="flex flex-1 flex-col min-h-0 bg-bg">
        {/* 앱 탑바(시트 위로 살짝 보이는 부분) */}
        <header className="border-b border-line bg-surface shrink-0">
          <div className="h-topbar flex items-center gap-2 px-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="w-7 h-7 grid place-items-center text-brand shrink-0"><BrandMark size={22} /></span>
              <span className="font-en text-subtitle font-[400] tracking-tight text-ink-900">RaiLink</span>
            </div>
            <span className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 shrink-0"><SearchIcon size={20} /></span>
            <span className="w-10 grid place-items-center shrink-0"><Avatar name="Theo" size="default" color="brand" /></span>
          </div>
        </header>

        {/* 하루 상세 바텀시트 */}
        <div className="flex-1 min-h-0 flex flex-col bg-surface rounded-t-[20px] shadow-[0_-10px_28px_rgba(13,30,55,0.10)] -mt-2 relative z-10">
          <div className="mx-auto w-10 h-[5px] rounded-full bg-line-2 mt-2.5 mb-1 shrink-0" />

          {/* 헤더 */}
          <div className="flex items-start justify-between px-5 pt-1 pb-2 shrink-0 border-b border-line">
            <div>
              <h3 className="text-title font-bold tracking-tighter text-ink-900">
                6월 12일 <span className="font-medium text-ink-500">금</span>
              </h3>
              <p className="text-caption text-ink-500 mt-0.5">근무 3명 · 위아래로 넘겨 다른 날</p>
            </div>
            <span className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"><CloseIcon size={18} /></span>
          </div>

          {/* 생일 배너 */}
          <div
            className="shrink-0 flex items-center gap-3 mx-4 mt-2 mb-3 px-3.5 py-3 rounded-[14px]"
            style={{ background: '#FBEEF4' }}
          >
            <span
              className="w-[42px] h-[42px] rounded-[13px] bg-white grid place-items-center shrink-0"
              style={{ boxShadow: '0 1px 3px rgba(184,58,110,.12)' }}
            >
              <span style={{ color: '#E8669B' }}><CakeIcon size={24} /></span>
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase" style={{ color: '#C24B82' }}>생일</p>
              <p className="text-[15px] font-bold mt-0.5 truncate" style={{ color: '#7E2A52' }}>Fred 님</p>
            </div>
            <span className="ml-auto rounded-full shrink-0" style={{ boxShadow: '0 0 0 2px #FBEEF4' }}>
              <Avatar name="Fred" color="c2" size="sm" className="!w-[30px] !h-[30px] !text-[11px]" />
            </span>
          </div>

          {/* 타임라인 (실제 MonthTimeline 재사용) */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-hidden">
            <MonthTimeline people={PEOPLE} year={2026} month={6} today={TODAY} appointments={[]} />
          </div>

          {/* 하단 액션 바 */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-line bg-surface">
            <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-solid border-line-2 text-[13px] font-semibold text-ink-700">
              <EditIcon size={14} /> 일정 수정
            </span>
            <div className="flex-1" />
            <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-brand-050 text-[13px] font-semibold text-brand">
              <PlusIcon size={14} /> 동료 비교 추가
            </span>
          </div>
        </div>
      </div>
    </PhoneShell>
  )
}

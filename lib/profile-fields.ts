// 가입·설정에서 공유하는 프로필 선택지. 한 곳에서만 정의해 두 화면이 어긋나지
// 않게 한다.

/** KTX 소속 지사(드롭다운). 목록에 없으면 '기타'(BRANCH_OTHER)로 직접 입력.
 *  값은 profiles.part 컬럼에 그대로 저장(파트 → 지사로 의미 교체). */
export const BRANCHES = [
  '서울지사', '용산지사', '부산지사', '익산지사', '동대구지사', '청량리지사',
] as const

export const BRANCH_OTHER = '기타'

/** personal 직군 칩(단일선택). value는 집계용 안정 코드, label만 화면 표시.
 *  앵커링을 줄이려 아는 시드 직군만 적게 두고 나머지는 'other'로 받는다.
 *  trigger(handle_new_user_profile)가 이 4개 코드만 통과시킨다. */
export const JOB_OPTIONS: { value: string; label: string }[] = [
  { value: 'nurse', label: '간호사' },
  { value: 'flight_attendant', label: '승무원' },
  { value: 'beauty', label: '뷰티' },
  { value: 'other', label: '기타' },
]

/** 가입 첫 질문(직무 카테고리, 단일 선택). KTX 중심 분기를 걷어내고 승무원-일반
 *  톤으로. value는 안정 코드, label만 화면 표시.
 *  - ktx     → profile_type 'ktx_attendant' (사번·소속지사·공개범위)
 *  - airline → profile_type 'personal' + profiles.airline 태그 (항공사 드롭다운)
 *  - other   → profile_type 'personal' + 직무 칩 */
export type SignupCategory = 'ktx' | 'airline' | 'other'

export const CATEGORY_OPTIONS: { value: SignupCategory; title: string; desc: string }[] = [
  { value: 'ktx',     title: 'KTX 승무원',  desc: '코레일 KTX 객실승무원이에요.' },
  { value: 'airline', title: '항공 승무원', desc: '항공사 객실/운항 승무원이에요.' },
  { value: 'other',   title: '기타',        desc: '승무원이 아니라도 사용할 수 있어요.' },
]

/** 항공사 목록. `code`는 data-airline 슬러그(테마 스왑 키) 겸 profiles.airline 저장값.
 *  `active`만 가입에서 선택 가능, 나머지는 '준비중'으로 보여주되 선택 차단.
 *  활성 항공사부터, 그 뒤 준비중을 노출 순서대로. */
export type Airline = { code: string; label: string; active: boolean }

export const AIRLINES: Airline[] = [
  { code: 'air-premia',  label: '에어프레미아', active: true },
  { code: 'asiana',      label: '아시아나',     active: false },
  { code: 'korean-air',  label: '대한항공',     active: false },
  { code: 'jin-air',     label: '진에어',       active: false },
  { code: 'jeju-air',    label: '제주항공',     active: false },
  { code: 'tway',        label: '티웨이항공',   active: false },
  { code: 'air-busan',   label: '에어부산',     active: false },
  { code: 'eastar',      label: '이스타항공',   active: false },
]

export function findAirline(code: string | undefined | null): Airline | undefined {
  if (!code) return undefined
  return AIRLINES.find(a => a.code === code)
}

/** 한글 주격/주제 조사(은/는)를 끝글자 받침에 따라 고른다. 받침 있으면 '은', 없으면
 *  '는'. 한글이 아닌 끝글자는 '는'으로 둔다. 예: 대한항공+은, 에어프레미아+는. */
export function koTopicParticle(word: string): '은' | '는' {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return '는'  // 한글 음절이 아니면 기본값
  return (code - 0xac00) % 28 === 0 ? '는' : '은'  // 받침(종성) 유무
}

/** 가입·온보딩 항공사 드롭다운 옵션. 활성(자동 인식 지원)과 준비중을 섹션 헤더로
 *  나눠 보여준다. 준비중도 선택 가능 — 태그만 저장해 두면 그 항공사가 활성화될 때
 *  재가입·마이그레이션 없이 전용 경험으로 자동 승격된다. CbOption과 구조가 같다. */
export type AirlineOption = { v: string; label: string; badge?: string; muted?: boolean; header?: boolean }

export function airlineSelectOptions(): AirlineOption[] {
  const active = AIRLINES.filter(a => a.active)
  const pending = AIRLINES.filter(a => !a.active)
  const opts: AirlineOption[] = []
  if (active.length) {
    opts.push({ v: '__hdr_active', label: '지금 이용 가능', header: true })
    for (const a of active) opts.push({ v: a.code, label: a.label })
  }
  if (pending.length) {
    opts.push({ v: '__hdr_pending', label: '7월 중 추가 예정', header: true })
    for (const a of pending) opts.push({ v: a.code, label: a.label, badge: '준비중', muted: true })
  }
  return opts
}

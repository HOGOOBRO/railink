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

// 편명 → 노선(출발/도착 공항) 내장 룩업. 외부 API 없이 활성 항공사의 적은 노선을
// 직접 표로 가진다(에어프레미아는 ICN발 국제선 ~11개뿐). 로스터엔 시간만 있고 노선이
// 없어서, 이 표로 편명에 노선을 붙여 "어디 가는지"를 보여준다.
//
// 출처(2026 기준, 교차확인): AeroRoutes 스케줄 기사, FlightAware, Trip.com,
// airpremia.com 공지, Wikipedia "Air Premia". 편명 규칙: 홀수=ICN 출발, 짝수=ICN 도착.
// 노선이 바뀌면 표만 갱신하면 된다(향후 항공사 확장 시 외부 API 폴백 검토).

export type Route = { from: string; to: string }

const YP_ROUTES: Record<string, Route> = {
  // LAX (로스앤젤레스) — 2개 로테이션
  YP101: { from: 'ICN', to: 'LAX' }, YP102: { from: 'LAX', to: 'ICN' },
  YP103: { from: 'ICN', to: 'LAX' }, YP104: { from: 'LAX', to: 'ICN' },
  // SFO (샌프란시스코)
  YP111: { from: 'ICN', to: 'SFO' }, YP112: { from: 'SFO', to: 'ICN' },
  // EWR (뉴욕/뉴어크)
  YP131: { from: 'ICN', to: 'EWR' }, YP132: { from: 'EWR', to: 'ICN' },
  // IAD (워싱턴 덜레스, 2026-04-24 취항)
  YP135: { from: 'ICN', to: 'IAD' }, YP136: { from: 'IAD', to: 'ICN' },
  // HNL (호놀룰루)
  YP151: { from: 'ICN', to: 'HNL' }, YP152: { from: 'HNL', to: 'ICN' },
  // BKK (방콕)
  YP601: { from: 'ICN', to: 'BKK' }, YP602: { from: 'BKK', to: 'ICN' },
  // DAD (다낭)
  YP621: { from: 'ICN', to: 'DAD' }, YP622: { from: 'DAD', to: 'ICN' },
  // SIN (싱가포르)
  YP631: { from: 'ICN', to: 'SIN' }, YP632: { from: 'SIN', to: 'ICN' },
  // SGN (호치민)
  YP651: { from: 'ICN', to: 'SGN' }, YP652: { from: 'SGN', to: 'ICN' },
  // NRT (도쿄 나리타) — 2개 로테이션(오전/오후)
  YP731: { from: 'ICN', to: 'NRT' }, YP732: { from: 'NRT', to: 'ICN' },
  YP735: { from: 'ICN', to: 'NRT' }, YP736: { from: 'NRT', to: 'ICN' },
  // HKG (홍콩)
  YP801: { from: 'ICN', to: 'HKG' }, YP802: { from: 'HKG', to: 'ICN' },
}

const ROUTES_BY_AIRLINE: Record<string, Record<string, Route>> = {
  'air-premia': YP_ROUTES,
}

/** 공항(IATA) → IANA 타임존. 로스터 시각은 각 공항 현지시각이라, 인천(KST) 기준으로
 *  환산하려면 출발/도착 공항의 시간대가 필요하다. 모르는 공항은 KST로 간주. */
const AIRPORT_TZ: Record<string, string> = {
  ICN: 'Asia/Seoul', GMP: 'Asia/Seoul', CJU: 'Asia/Seoul', RSU: 'Asia/Seoul', PUS: 'Asia/Seoul',
  NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', KIX: 'Asia/Tokyo', FUK: 'Asia/Tokyo', NGO: 'Asia/Tokyo',
  HKG: 'Asia/Hong_Kong',
  BKK: 'Asia/Bangkok',
  SIN: 'Asia/Singapore',
  DAD: 'Asia/Ho_Chi_Minh', SGN: 'Asia/Ho_Chi_Minh',
  MNL: 'Asia/Manila',
  // 중국(베이징/난징/톈진/상하이/칭다오) — 전국 단일 표준시
  PEK: 'Asia/Shanghai', PKX: 'Asia/Shanghai', NKG: 'Asia/Shanghai', TSN: 'Asia/Shanghai',
  PVG: 'Asia/Shanghai', SHA: 'Asia/Shanghai', TAO: 'Asia/Shanghai', CKG: 'Asia/Shanghai',
  TPE: 'Asia/Taipei',
  HNL: 'Pacific/Honolulu',
  LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SEA: 'America/Los_Angeles',
  EWR: 'America/New_York', IAD: 'America/New_York', JFK: 'America/New_York',
  FRA: 'Europe/Berlin', // 프랑크푸르트
  CDG: 'Europe/Paris', LHR: 'Europe/London', IST: 'Europe/Istanbul',
  SYD: 'Australia/Sydney',
}

export function airportTz(iata: string | undefined): string {
  return (iata && AIRPORT_TZ[iata.toUpperCase()]) || 'Asia/Seoul'
}

// ─── 레그(저장된 노선) 기반 헬퍼 ───────────────────────────────────────────
// 노선이 캡쳐에 명시된 항공사(아시아나 등)는 편명 룩업표 대신 저장된 flights[]에서
// 노선·출도착 공항을 직접 얻는다. 노선 수백 개라 표로 못 박기 때문(에어프레미아만 표).

/** flights[]의 첫 레그 출발공항·마지막 레그 도착공항. */
export function endpointsFromLegs(flights: { from?: string; to?: string }[] | undefined): { from?: string; to?: string } {
  if (!flights?.length) return {}
  const withFrom = flights.find(f => f.from)
  const withTo = [...flights].reverse().find(f => f.to)
  return { from: withFrom?.from, to: withTo?.to }
}

/** flights[]를 노선 경로 문자열로. 예: [ICN→NKG, NKG→ICN] → "ICN→NKG→ICN". */
export function routeFromLegs(flights: { from?: string; to?: string }[] | undefined): string | null {
  if (!flights?.length) return null
  const path: string[] = []
  for (const f of flights) {
    if (f.from && path[path.length - 1] !== f.from) path.push(f.from)
    if (f.to) path.push(f.to)
  }
  const compact = path.filter((p, i) => i === 0 || p !== path[i - 1])
  return compact.length ? compact.join('→') : null
}

/** trainNr의 첫 레그 출발공항·마지막 레그 도착공항(IATA). 출발/도착 시각을
 *  KST로 환산할 때 어느 공항 시간대인지 정하는 데 쓴다. 매칭 없으면 undefined. */
export function flightEndpoints(
  airline: string | undefined,
  trainNr: string | undefined,
): { from?: string; to?: string } {
  if (!airline || !trainNr) return {}
  const table = ROUTES_BY_AIRLINE[airline]
  if (!table) return {}
  const tokens = trainNr.split(/\s*[·,]\s*|\s+/).map(t => t.trim().toUpperCase()).filter(Boolean)
  let from: string | undefined
  let to: string | undefined
  for (const t of tokens) {
    const r = table[t]
    if (!r) continue
    if (!from) from = r.from
    to = r.to
  }
  return { from, to }
}

/** trainNr("YP801" 또는 "YP801 · YP802")을 노선 경로 문자열로 변환.
 *  예: "YP801·YP802" → "ICN→HKG→ICN", "YP735" → "ICN→NRT". 매칭 없으면 null. */
export function routeForFlights(airline: string | undefined, trainNr: string | undefined): string | null {
  if (!airline || !trainNr) return null
  const table = ROUTES_BY_AIRLINE[airline]
  if (!table) return null
  const tokens = trainNr.split(/\s*[·,]\s*|\s+/).map(t => t.trim().toUpperCase()).filter(Boolean)
  const legs: Route[] = []
  for (const t of tokens) {
    const r = table[t]
    if (r) legs.push(r)
  }
  if (!legs.length) return null
  // 레그를 이어 하나의 경로로: 끊기면 그대로 이어 붙인다.
  const path: string[] = [legs[0].from]
  for (const l of legs) {
    if (path[path.length - 1] !== l.from) path.push(l.from)
    path.push(l.to)
  }
  return path.filter((p, i) => i === 0 || p !== path[i - 1]).join('→')
}

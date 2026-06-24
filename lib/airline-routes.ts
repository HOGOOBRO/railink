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

// 제주항공(7C). 로스터는 편명을 prefix 없이 숫자로만 찍으므로 키도 bare 숫자.
// 규칙: 대체로 홀수=베이스 출발, 짝수=귀환. 출처: flightmapper/aviability/airpaz/
// flight.info/trip.com/jejuair 교차확인(2026-07 기준). 닫힌 공항(무안 MWX, 2024 폐쇄)·
// 단종(괌 GUM) 노선과 low 신뢰 항목은 제외. 새 편명이 나오면 여기 한 줄씩 추가.
const JEJU_ROUTES: Record<string, Route> = {
  // ── 국내선 — 김포·제주 ──
  '101': { from: 'GMP', to: 'CJU' }, '103': { from: 'GMP', to: 'CJU' }, '105': { from: 'GMP', to: 'CJU' },
  '107': { from: 'GMP', to: 'CJU' }, '109': { from: 'GMP', to: 'CJU' }, '111': { from: 'GMP', to: 'CJU' },
  '113': { from: 'GMP', to: 'CJU' }, '115': { from: 'GMP', to: 'CJU' }, '117': { from: 'GMP', to: 'CJU' },
  '119': { from: 'GMP', to: 'CJU' }, '121': { from: 'GMP', to: 'CJU' }, '123': { from: 'GMP', to: 'CJU' },
  '125': { from: 'GMP', to: 'CJU' }, '127': { from: 'GMP', to: 'CJU' }, '129': { from: 'GMP', to: 'CJU' },
  '131': { from: 'GMP', to: 'CJU' }, '133': { from: 'GMP', to: 'CJU' },
  '102': { from: 'CJU', to: 'GMP' }, '104': { from: 'CJU', to: 'GMP' }, '106': { from: 'CJU', to: 'GMP' },
  '108': { from: 'CJU', to: 'GMP' }, '110': { from: 'CJU', to: 'GMP' }, '112': { from: 'CJU', to: 'GMP' },
  '114': { from: 'CJU', to: 'GMP' }, '116': { from: 'CJU', to: 'GMP' }, '118': { from: 'CJU', to: 'GMP' },
  '120': { from: 'CJU', to: 'GMP' }, '122': { from: 'CJU', to: 'GMP' }, '124': { from: 'CJU', to: 'GMP' },
  '126': { from: 'CJU', to: 'GMP' }, '128': { from: 'CJU', to: 'GMP' }, '130': { from: 'CJU', to: 'GMP' },
  '132': { from: 'CJU', to: 'GMP' }, '134': { from: 'CJU', to: 'GMP' },
  // ── 국내선 — 그 외 ──
  '167': { from: 'ICN', to: 'CJU' }, '166': { from: 'CJU', to: 'ICN' },
  '501': { from: 'PUS', to: 'CJU' }, '503': { from: 'PUS', to: 'CJU' }, '505': { from: 'PUS', to: 'CJU' },
  '507': { from: 'PUS', to: 'CJU' }, '509': { from: 'PUS', to: 'CJU' }, '511': { from: 'PUS', to: 'CJU' },
  '513': { from: 'PUS', to: 'CJU' },
  '502': { from: 'CJU', to: 'PUS' }, '504': { from: 'CJU', to: 'PUS' }, '506': { from: 'CJU', to: 'PUS' },
  '508': { from: 'CJU', to: 'PUS' }, '510': { from: 'CJU', to: 'PUS' }, '512': { from: 'CJU', to: 'PUS' },
  '514': { from: 'CJU', to: 'PUS' },
  '211': { from: 'CJJ', to: 'CJU' }, '213': { from: 'CJJ', to: 'CJU' }, '225': { from: 'CJJ', to: 'CJU' }, '227': { from: 'CJJ', to: 'CJU' },
  '212': { from: 'CJU', to: 'CJJ' }, '214': { from: 'CJU', to: 'CJJ' }, '226': { from: 'CJU', to: 'CJJ' }, '228': { from: 'CJU', to: 'CJJ' },
  '301': { from: 'KWJ', to: 'CJU' }, '305': { from: 'KWJ', to: 'CJU' }, '601': { from: 'KWJ', to: 'CJU' }, '605': { from: 'KWJ', to: 'CJU' },
  '302': { from: 'CJU', to: 'KWJ' }, '306': { from: 'CJU', to: 'KWJ' }, '602': { from: 'CJU', to: 'KWJ' },
  '701': { from: 'TAE', to: 'CJU' }, '703': { from: 'TAE', to: 'CJU' }, '705': { from: 'TAE', to: 'CJU' },
  '707': { from: 'TAE', to: 'CJU' }, '711': { from: 'TAE', to: 'CJU' },
  '702': { from: 'CJU', to: 'TAE' }, '706': { from: 'CJU', to: 'TAE' }, '708': { from: 'CJU', to: 'TAE' },

  // ── 국제선: 일본 ──
  '1101': { from: 'ICN', to: 'NRT' }, '1103': { from: 'ICN', to: 'NRT' }, '1105': { from: 'ICN', to: 'NRT' },
  '1107': { from: 'ICN', to: 'NRT' }, '1121': { from: 'ICN', to: 'NRT' }, '1171': { from: 'ICN', to: 'NRT' },
  '1173': { from: 'ICN', to: 'NRT' }, '1175': { from: 'ICN', to: 'NRT' }, '1177': { from: 'ICN', to: 'NRT' },
  '1183': { from: 'ICN', to: 'NRT' },
  '1102': { from: 'NRT', to: 'ICN' }, '1104': { from: 'NRT', to: 'ICN' }, '1106': { from: 'NRT', to: 'ICN' },
  '1108': { from: 'NRT', to: 'ICN' }, '1122': { from: 'NRT', to: 'ICN' }, '1172': { from: 'NRT', to: 'ICN' },
  '1176': { from: 'NRT', to: 'ICN' }, '1178': { from: 'NRT', to: 'ICN' }, '1184': { from: 'NRT', to: 'ICN' },
  '1151': { from: 'PUS', to: 'NRT' }, '1153': { from: 'PUS', to: 'NRT' }, '1152': { from: 'NRT', to: 'PUS' }, '1154': { from: 'NRT', to: 'PUS' },
  '1201': { from: 'ICN', to: 'NGO' }, '1203': { from: 'ICN', to: 'NGO' }, '1202': { from: 'NGO', to: 'ICN' }, '1204': { from: 'NGO', to: 'ICN' },
  '1301': { from: 'ICN', to: 'KIX' }, '1303': { from: 'ICN', to: 'KIX' }, '1305': { from: 'ICN', to: 'KIX' },
  '1307': { from: 'ICN', to: 'KIX' }, '1315': { from: 'ICN', to: 'KIX' }, '1391': { from: 'ICN', to: 'KIX' },
  '1393': { from: 'ICN', to: 'KIX' }, '1395': { from: 'ICN', to: 'KIX' },
  '1302': { from: 'KIX', to: 'ICN' }, '1304': { from: 'KIX', to: 'ICN' }, '1306': { from: 'KIX', to: 'ICN' },
  '1308': { from: 'KIX', to: 'ICN' }, '1316': { from: 'KIX', to: 'ICN' }, '1392': { from: 'KIX', to: 'ICN' },
  '1394': { from: 'KIX', to: 'ICN' }, '1396': { from: 'KIX', to: 'ICN' },
  '1325': { from: 'GMP', to: 'KIX' }, '1327': { from: 'GMP', to: 'KIX' }, '1326': { from: 'KIX', to: 'GMP' }, '1328': { from: 'KIX', to: 'GMP' },
  '1351': { from: 'PUS', to: 'KIX' }, '1353': { from: 'PUS', to: 'KIX' }, '1355': { from: 'PUS', to: 'KIX' },
  '1352': { from: 'KIX', to: 'PUS' }, '1354': { from: 'KIX', to: 'PUS' }, '1356': { from: 'KIX', to: 'PUS' },
  '1401': { from: 'ICN', to: 'FUK' }, '1403': { from: 'ICN', to: 'FUK' }, '1405': { from: 'ICN', to: 'FUK' },
  '1407': { from: 'ICN', to: 'FUK' }, '1431': { from: 'ICN', to: 'FUK' },
  '1402': { from: 'FUK', to: 'ICN' }, '1404': { from: 'FUK', to: 'ICN' }, '1406': { from: 'FUK', to: 'ICN' },
  '1408': { from: 'FUK', to: 'ICN' }, '1432': { from: 'FUK', to: 'ICN' },
  '1451': { from: 'PUS', to: 'FUK' }, '1453': { from: 'PUS', to: 'FUK' }, '1452': { from: 'FUK', to: 'PUS' }, '1454': { from: 'FUK', to: 'PUS' },
  '1501': { from: 'ICN', to: 'CTS' }, '1503': { from: 'ICN', to: 'CTS' }, '1502': { from: 'CTS', to: 'ICN' }, '1504': { from: 'CTS', to: 'ICN' },
  '1551': { from: 'PUS', to: 'CTS' }, '1552': { from: 'CTS', to: 'PUS' },
  '1513': { from: 'ICN', to: 'HKD' }, '1514': { from: 'HKD', to: 'ICN' },
  '1601': { from: 'ICN', to: 'FSZ' }, '1603': { from: 'ICN', to: 'FSZ' }, '1602': { from: 'FSZ', to: 'ICN' }, '1604': { from: 'FSZ', to: 'ICN' },
  '1611': { from: 'ICN', to: 'HIJ' }, '1615': { from: 'ICN', to: 'HIJ' }, '1617': { from: 'ICN', to: 'HIJ' },
  '1612': { from: 'HIJ', to: 'ICN' }, '1616': { from: 'HIJ', to: 'ICN' }, '1618': { from: 'HIJ', to: 'ICN' },
  '1701': { from: 'ICN', to: 'MYJ' }, '1703': { from: 'ICN', to: 'MYJ' }, '1721': { from: 'ICN', to: 'MYJ' },
  '1702': { from: 'MYJ', to: 'ICN' }, '1704': { from: 'MYJ', to: 'ICN' }, '1722': { from: 'MYJ', to: 'ICN' },
  '1801': { from: 'ICN', to: 'OKA' }, '1802': { from: 'OKA', to: 'ICN' },
  '1811': { from: 'ICN', to: 'OIT' }, '1812': { from: 'OIT', to: 'ICN' },
  '1823': { from: 'ICN', to: 'KOJ' }, '1824': { from: 'KOJ', to: 'ICN' },

  // ── 국제선: 중국·대만·홍콩·마카오 ──
  '8401': { from: 'ICN', to: 'TAO' }, '8402': { from: 'TAO', to: 'ICN' },
  '8501': { from: 'ICN', to: 'WEH' }, '8503': { from: 'ICN', to: 'WEH' }, '8502': { from: 'WEH', to: 'ICN' }, '8504': { from: 'WEH', to: 'ICN' },
  '8905': { from: 'ICN', to: 'HRB' }, '8906': { from: 'HRB', to: 'ICN' },
  '8903': { from: 'ICN', to: 'YNJ' }, '8904': { from: 'YNJ', to: 'ICN' },
  '9303': { from: 'ICN', to: 'YNT' },
  '8901': { from: 'ICN', to: 'JMU' }, '8902': { from: 'JMU', to: 'ICN' },
  '8801': { from: 'ICN', to: 'SJW' }, '8802': { from: 'SJW', to: 'ICN' }, '8851': { from: 'PUS', to: 'SJW' }, '8852': { from: 'SJW', to: 'PUS' },
  '8351': { from: 'PUS', to: 'PVG' }, '8352': { from: 'PVG', to: 'PUS' },
  '8253': { from: 'PUS', to: 'DYG' }, '8254': { from: 'DYG', to: 'PUS' },
  '8133': { from: 'CJU', to: 'PEK' }, '8134': { from: 'PEK', to: 'CJU' },
  '8135': { from: 'CJU', to: 'PKX' }, '8136': { from: 'PKX', to: 'CJU' },
  '6101': { from: 'ICN', to: 'TPE' }, '6102': { from: 'TPE', to: 'ICN' }, '6153': { from: 'PUS', to: 'TPE' }, '6152': { from: 'TPE', to: 'PUS' },
  '6255': { from: 'PUS', to: 'KHH' }, '6256': { from: 'KHH', to: 'PUS' },
  '6013': { from: 'ICN', to: 'HKG' }, '6014': { from: 'HKG', to: 'ICN' },
  '6001': { from: 'ICN', to: 'MFM' }, '6002': { from: 'MFM', to: 'ICN' },

  // ── 국제선: 동남아·남아시아·오세아니아 ──
  '2201': { from: 'ICN', to: 'HAN' }, '2803': { from: 'ICN', to: 'HAN' }, '2202': { from: 'HAN', to: 'ICN' }, '2804': { from: 'HAN', to: 'ICN' },
  '2211': { from: 'ICN', to: 'DAD' }, '2217': { from: 'ICN', to: 'DAD' }, '2901': { from: 'ICN', to: 'DAD' },
  '2212': { from: 'DAD', to: 'ICN' }, '2218': { from: 'DAD', to: 'ICN' }, '2902': { from: 'DAD', to: 'ICN' },
  '2261': { from: 'PUS', to: 'DAD' }, '2955': { from: 'PUS', to: 'DAD' }, '2262': { from: 'DAD', to: 'PUS' }, '2956': { from: 'DAD', to: 'PUS' },
  '2303': { from: 'ICN', to: 'CXR' }, '2327': { from: 'ICN', to: 'CXR' }, '2304': { from: 'CXR', to: 'ICN' }, '2328': { from: 'CXR', to: 'ICN' },
  '2315': { from: 'ICN', to: 'PQC' }, '4103': { from: 'ICN', to: 'PQC' }, '4175': { from: 'ICN', to: 'PQC' },
  '2316': { from: 'PQC', to: 'ICN' }, '4104': { from: 'PQC', to: 'ICN' },
  '2503': { from: 'ICN', to: 'BKK' }, '2504': { from: 'BKK', to: 'ICN' }, '2551': { from: 'PUS', to: 'BKK' }, '2552': { from: 'BKK', to: 'PUS' },
  '2515': { from: 'ICN', to: 'CNX' }, '2516': { from: 'CNX', to: 'ICN' }, '4257': { from: 'PUS', to: 'CNX' }, '4258': { from: 'CNX', to: 'PUS' },
  '2103': { from: 'ICN', to: 'MNL' }, '2305': { from: 'ICN', to: 'MNL' }, '2104': { from: 'MNL', to: 'ICN' }, '2306': { from: 'MNL', to: 'ICN' },
  '2405': { from: 'ICN', to: 'CEB' }, '2406': { from: 'CEB', to: 'ICN' }, '2451': { from: 'PUS', to: 'CEB' }, '2161': { from: 'PUS', to: 'CEB' },
  '2452': { from: 'CEB', to: 'PUS' }, '2162': { from: 'CEB', to: 'PUS' },
  '2107': { from: 'ICN', to: 'CRK' }, '2108': { from: 'CRK', to: 'ICN' },
  '2121': { from: 'ICN', to: 'TAG' }, '2125': { from: 'ICN', to: 'TAG' }, '2122': { from: 'TAG', to: 'ICN' }, '2126': { from: 'TAG', to: 'ICN' },
  '2157': { from: 'PUS', to: 'TAG' }, '2158': { from: 'TAG', to: 'PUS' },
  '2623': { from: 'ICN', to: 'SIN' }, '2624': { from: 'SIN', to: 'ICN' },
  '2641': { from: 'PUS', to: 'SIN' }, '2661': { from: 'PUS', to: 'SIN' }, '4055': { from: 'PUS', to: 'SIN' },
  '2642': { from: 'SIN', to: 'PUS' }, '2662': { from: 'SIN', to: 'PUS' }, '4056': { from: 'SIN', to: 'PUS' },
  '2507': { from: 'ICN', to: 'BKI' }, '2603': { from: 'ICN', to: 'BKI' }, '2605': { from: 'ICN', to: 'BKI' },
  '2508': { from: 'BKI', to: 'ICN' }, '2604': { from: 'BKI', to: 'ICN' },
  '2711': { from: 'ICN', to: 'DPS' }, '5303': { from: 'ICN', to: 'DPS' }, '2712': { from: 'DPS', to: 'ICN' }, '5304': { from: 'DPS', to: 'ICN' },
  '2401': { from: 'ICN', to: 'VTE' }, '4303': { from: 'ICN', to: 'VTE' }, '2402': { from: 'VTE', to: 'ICN' }, '4304': { from: 'VTE', to: 'ICN' },
  '5203': { from: 'ICN', to: 'ULN' }, '5204': { from: 'ULN', to: 'ICN' }, '5257': { from: 'PUS', to: 'ULN' }, '5258': { from: 'ULN', to: 'PUS' },
  '3211': { from: 'ICN', to: 'SPN' }, '3212': { from: 'SPN', to: 'ICN' },
}

const ROUTES_BY_AIRLINE: Record<string, Record<string, Route>> = {
  'air-premia': YP_ROUTES,
  'jeju-air': JEJU_ROUTES,
}

/** 공항(IATA) → IANA 타임존. 로스터 시각은 각 공항 현지시각이라, 인천(KST) 기준으로
 *  환산하려면 출발/도착 공항의 시간대가 필요하다. 모르는 공항은 KST로 간주. */
const AIRPORT_TZ: Record<string, string> = {
  ICN: 'Asia/Seoul', GMP: 'Asia/Seoul', CJU: 'Asia/Seoul', RSU: 'Asia/Seoul', PUS: 'Asia/Seoul',
  CJJ: 'Asia/Seoul', KWJ: 'Asia/Seoul', TAE: 'Asia/Seoul', USN: 'Asia/Seoul', MWX: 'Asia/Seoul', HIN: 'Asia/Seoul',
  NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', KIX: 'Asia/Tokyo', FUK: 'Asia/Tokyo', NGO: 'Asia/Tokyo',
  CTS: 'Asia/Tokyo', HKD: 'Asia/Tokyo', FSZ: 'Asia/Tokyo', HIJ: 'Asia/Tokyo', MYJ: 'Asia/Tokyo',
  OKA: 'Asia/Tokyo', OIT: 'Asia/Tokyo', KOJ: 'Asia/Tokyo',
  HKG: 'Asia/Hong_Kong',
  MFM: 'Asia/Macau',
  BKK: 'Asia/Bangkok', CNX: 'Asia/Bangkok',
  SIN: 'Asia/Singapore',
  DAD: 'Asia/Ho_Chi_Minh', SGN: 'Asia/Ho_Chi_Minh', HAN: 'Asia/Ho_Chi_Minh', CXR: 'Asia/Ho_Chi_Minh', PQC: 'Asia/Ho_Chi_Minh',
  MNL: 'Asia/Manila', CEB: 'Asia/Manila', CRK: 'Asia/Manila', TAG: 'Asia/Manila',
  BKI: 'Asia/Kuala_Lumpur',     // 코타키나발루(말레이시아, UTC+8)
  DPS: 'Asia/Makassar',         // 발리(인도네시아 중부, UTC+8)
  VTE: 'Asia/Vientiane',        // 비엔티안(라오스, UTC+7)
  ULN: 'Asia/Ulaanbaatar',      // 울란바토르(몽골)
  SPN: 'Pacific/Saipan',        // 사이판(UTC+10)
  // 중국(베이징/난징/톈진/상하이/칭다오/웨이하이/하얼빈/옌지/옌타이/자무스/스자좡/장자제) — 전국 단일 표준시
  PEK: 'Asia/Shanghai', PKX: 'Asia/Shanghai', NKG: 'Asia/Shanghai', TSN: 'Asia/Shanghai',
  PVG: 'Asia/Shanghai', SHA: 'Asia/Shanghai', TAO: 'Asia/Shanghai', CKG: 'Asia/Shanghai',
  WEH: 'Asia/Shanghai', HRB: 'Asia/Shanghai', YNJ: 'Asia/Shanghai', YNT: 'Asia/Shanghai',
  JMU: 'Asia/Shanghai', SJW: 'Asia/Shanghai', DYG: 'Asia/Shanghai',
  TPE: 'Asia/Taipei', KHH: 'Asia/Taipei',
  HNL: 'Pacific/Honolulu',
  LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SEA: 'America/Los_Angeles',
  EWR: 'America/New_York', IAD: 'America/New_York', JFK: 'America/New_York',
  FRA: 'Europe/Berlin', // 프랑크푸르트
  CDG: 'Europe/Paris', LHR: 'Europe/London', IST: 'Europe/Istanbul',
  SYD: 'Australia/Sydney',
}

/** 등재된 IATA 공항코드인지(시차표 기준). 로스터에 편명 없이 공항코드만 찍힌 체류/레스트
 *  행을 '모르는 근무코드'로 오인하지 않도록 서버 후처리에서 거르는 데 쓴다. */
export function isAirportCode(code: string | undefined | null): boolean {
  return !!code && Object.prototype.hasOwnProperty.call(AIRPORT_TZ, code.trim().toUpperCase())
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

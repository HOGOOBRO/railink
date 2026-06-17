# 항공 크루 스케줄 인식 — 데이터셋 & 설계 (탐색용, 라이브 미반영)

> 목적: RaiLink가 항공 크루 로스터(캡쳐 이미지 등)를 인식해 근무/오프/위치를 추출할 수 있게
> 하기 위한 **데이터 모델 + 데이터셋 + 수집 솔루션**을 설계한다. 아직 코드/DB에 반영하지 않는다.
>
> 작성 근거: 사용자가 제공한 실제 로스터 캡쳐 10장(1차 소스) + 라이브 크루 앱/항공 데이터 표준 리서치.

---

## 0. 한 줄 결론

**캡쳐 이미지 OCR만으로는 한 달치 완전한 스케줄을 못 얻는다(사용자 지적이 맞음).**
따라서 설계 원칙은 **"캡쳐 = 뼈대(date + 편명 + 코드)만 신뢰, 나머지(섹터/시각/기재/레이오버)는 외부 항공 데이터로 살을 붙이고(enrichment), 구조는 규칙으로 유도(derivation), 마지막에 사용자가 확인(confirm)"** 이다.

---

## 1. 실제 로스터 10장에서 관찰한 사실 (1차 소스)

| 이미지 | 시스템 | 포맷 | 편명 | 섹터 | 출도착시각 | 리포트/브리핑 | 기재(항공기) | 레이오버 |
|---|---|---|---|---|---|---|---|---|
| 1 | CrewConnex | 캘린더 그리드 (객실, YP) | ✅ | ❌ **없음** | ✅ (L) | ❌ | ❌ | ❌ |
| 2 | CrewConnex | 캘린더 그리드 (4V, 색상) | ✅ | ❌ **없음** | ✅ | ❌ | ❌ | ❌ |
| 3 | (KE형) | DATE/FLIGHT/SHOWUP/SECTOR/STD/STA 표 | ✅ | ✅ | ✅ | ✅ SHOWUP | ❌ | △ (역만 표시: FRA/BKK/ICN 행) |
| 4–10 | ARMS (Jin Air, LJ) | 일별 리스트(스크롤) | ✅ | ✅ | ✅ | ✅ BRF | ❌ | △ (체류공항 추론) |

핵심 관찰:

1. **포맷마다 보이는 필드가 다르다.** 어떤 단일 스키마도 "캡쳐에 다 있다"를 전제할 수 없음.
   - CrewConnex 객실 로스터(1,2)는 **섹터가 아예 없다.** 편명 + 시각뿐. → 섹터는 enrichment 필수.
   - ARMS(4–10), 표(3)는 섹터가 있지만 **기재(항공기 타입)는 어디에도 없다.**
2. **스크롤/탭 뒤에 데이터가 숨는다.**
   - ARMS는 일별 리스트라 한 화면 = 며칠. 2개월 로스터(01-May~30-Jun) 전체를 담으려면 화면 캡쳐 **10장 이상** 필요(실제로 사용자도 겹치는 7장 제공).
   - 각 편의 `>` 화살표 = 상세 페이지(기재/게이트/크루/호텔 등). **리스트엔 안 보이지만 앱엔 있다.**
3. **레이오버는 명시 라벨이 거의 없다.** 표(3)는 비행 없는 날 역코드(FRA, BKK, ICN)만 찍어 체류를 표현. ARMS는 그것도 없고 "출발지가 base가 아닌 다음 비행"으로만 추론 가능. **호텔명(HOTAC)은 어떤 캡쳐에도 없음.**
4. **누적시간은 따로 있다.** ARMS 헤더: Roster 54:49/90:54, Cuml 1M 57:08/120:00, Cuml 1Y 287:43/1200:00 → 법정 한도 추적이 크루에게 중요(리서치와 일치: EASA 100/900/1000h).
5. **(L) = 로컬타임 표기.** 국제선은 출발/도착 타임존이 다름. 시간 계산은 반드시 UTC 기준.

---

## 2. 라이브 크루 앱들은 어떻게 하나 (리서치 요약)

- **시장 1위 방식 = 자격증명 기반 직접 연동(credentialed fetch).** 앱 안에서 항공사 크루 포털(AIMS eCrew, CrewDock, Sabre, Flica, NetLine, **ARMS** 등)에 로그인 → 구조화된 로스터를 긁어 파싱.
  - **RosterBuster(CAE)**: 500+ 항공사/포맷, ~40~50만 사용자, iOS 4.4★. **OCR 없음.** 구조화 파싱 + PDF/CSV 폴백.
  - **CrewLounge CONNECT**: ~140 시스템/600+ 항공사. 포털 캡쳐 + 이메일 + ICS + PDF/CSV + **이미지 OCR**.
- **이미지 OCR은 "최후의 수단".** 진짜 항공용 이미지 OCR을 하는 건 사실상 **CrewLounge 하나뿐**이고, 그것도 Ryanair계열이 export를 막아 워터마크까지 박은 케이스 대응용. **OCR 큐 + 3단계 자가학습 AI 보정 + 사용자가 빨강 오류를 수동 수정**해야 저장됨. 정확도 수치는 비공개(벤더가 면책).
- **사진→캘린더 AI가 매끈한 앱(Shift2Cal, ALMO AI)** 은 전부 **일반 교대근무용**이라 항공(편명/레이오버/시차/스탠바이) 모름.
- 시사점:
  1. **한국 LCC 현실(ARMS/CrewConnex)에선 export가 막혀 있어 RaiLink 사용자에겐 "캡쳐"가 가장 현실적인 입력**이다. → OCR을 피할 수 없음.
  2. 그러나 **OCR 단독을 신뢰하지 말고, 반드시 enrichment + 사용자 확인 큐를 붙여야 한다**(CrewLounge가 증명한 패턴).
  3. **빈 시장:** "캡쳐 → AI가 편명/레이오버/시차까지 항공-aware하게 파싱" 은 아직 제대로 된 게 없음.

---

## 3. 데이터 모델 (제안)

원칙: **Leg ⊂ Duty ⊂ Pairing** 3계층을 뭉개지 말 것. 시간은 **UTC instant + 공항 IANA 타임존**으로 저장, 표시만 로컬. 모든 enrichment 필드는 **nullable + source/confidence 플래그**.

### 3.1 룩업(참조) 엔티티 — 한 번 구축하면 공용

- **Airline**: iata(2), icao(3), name. 예) LJ/JNA/Jin Air, YP/(Air Premia), KE/KAL.
- **Airport**: iata(3), icao(4), name, city, **iana_tz**, lat/lon. (오픈데이터: OurAirports / OpenFlights)
- **AircraftType**: icao(B738), iata(738), name. (ICAO Doc 8643)
- **ActivityCode**: code, **airline/system**, category, label, is_off. → `activity-codes.json` 참조. **항공사별 룩업**(코드는 표준 아님).

### 3.2 스케줄 엔티티

- **Roster**: user, period_start, period_end (월이 아닐 수 있음 — ARMS는 2개월).
- **Pairing/Trip**: home_base, start_utc, end_utc, day_span. (홈베이스에서 출발→복귀하는 다일 묶음)
- **Duty**: type(FLIGHT|DEADHEAD|STANDBY|TRAINING|GROUND|OFF|LEAVE|REST), report_time, end_time, station, FK→pairing, FK→activity_code.
- **Leg(Flight)**: flight_no(airline+number), from, to, std_utc, sta_utc, std_local, sta_local, etd, off/on-block, block_min, aircraft_type?(nullable), registration?(nullable), terminal?, FK→duty.
- **Layover**: station, start_utc, end_utc, hotel?(거의 못 얻음). pairing 내 duty 사이 구간으로 모델.

### 3.3 두 개의 레이어로 나눠 생각 (중요)

| 레이어 | 목적 | 필요한 필드 | 캡쳐로 충족? |
|---|---|---|---|
| **Sharing (MVP)** | RaiLink 본질: 동료와 "언제 일/오프/어디" 비교 | date, 근무여부(off/on), 대략 시간창, (선택)도착도시 | ✅ 캡쳐 + 코드맵으로 충분 |
| **Full fidelity** | 로그북급(기재/블록/호텔/누적시간) | 위 전부 + 기재/블록/레이오버호텔 | ❌ 캡쳐 불가, enrichment·상세페이지 필요 |

→ **RaiLink는 Sharing 레이어가 핵심.** 기재/호텔은 사실 RaiLink 용도엔 거의 불필요. 이 재프레이밍이 4장 솔루션의 난이도를 크게 낮춘다.

---

## 4. "캡쳐로 다 안 보인다" 문제 — 솔루션 (사용자 지적에 대한 답)

### 파이프라인: Capture → Enrich → Derive → Confirm

**(A) Capture = 뼈대만 신뢰**
- OCR이 확실히 뽑아야 하는 것: **date + flight_no + 활동/휴가 코드** (+ 보이면 시각).
- 편명은 짧은 영숫자라 OCR 신뢰도 높음. "전부"를 OCR에 요구하지 않는 게 핵심.

**(B) Enrich = 살 붙이기 (이게 핵심 해결책)**
- **편명 + 날짜 = 전세계 항공 스케줄의 기본키.** `LJ733 @ 2026-06-25` → 섹터(ICN-TPE), STD/STA, 기재, 터미널을 외부에서 복원.
- 데이터 소스 후보: AviationStack, FlightAware AeroAPI, OAG, Cirium, Amadeus/Sabre 스케줄 API. (미래 스케줄은 유료티어/OAG·Cirium이 강함)
- 효과: **섹터가 아예 없는 CrewConnex 객실 로스터(편명+시각만)도 섹터를 채울 수 있다.**
- 한계: 해당 날짜 항공편이 DB에 있어야 함. 한국 LCC 도메스틱(LJ/YP/4V)은 IATA 코드라 대부분 커버.

**(C) Derive = 구조 유도 (규칙, API 불필요)**
- **레이오버 = 섹터 체이닝으로 추론:** 듀티 마지막 도착지 ≠ home_base 이고 다음 듀티가 같은 공항에서 출발 → 그 공항에서 레이오버. (호텔명 없이도 "어디서 잤는지"는 나옴)
  - 예) LJ733 ICN→TPE(25일 도착), LJ734 TPE→ICN(26일 출발) ⇒ **25→26 TPE 레이오버.** 호텔명은 RaiLink엔 불필요.
- **듀티 묶기:** 같은 날 연속 편 → 한 duty. **블록시간:** sum(on-off block).
- **리포트/브리핑 시각:** 캡쳐에 있으면(ARMS BRF, 표 SHOWUP) 사용, 없으면 규칙 추정(국내 STD-60m / 국제 STD-75m) + estimated 플래그.

**(D) Confirm = 사람이 마지막 확인 (CrewLounge 패턴)**
- 파싱 결과를 **출처 색으로** 보여줌: 🟢 캡쳐에서 읽음 / 🔵 enrichment로 채움 / 🟡 추정·불확실(수정 요망).
- 사용자가 탭으로 고침. 빨강(필수 누락)은 저장 전 강제 수정.

### 스크롤/다장 캡쳐 문제 (ARMS류)
- **가이드 멀티캡쳐:** 여러 장을 (date+flight_no)로 dedup 머지(이미 5장 머지 로직 있음 — 확장).
- **갭 디텍션:** 머지 후 기간 내 **빠진 날짜 감지** → "15~18일이 없어요. 추가 캡쳐해 주세요." 이게 "한 장으론 다 안 보임"의 직접 대응.
- **상세페이지 데이터(기재/호텔)는 enrichment로 대체** → 사용자가 일일이 `>` 들어가 캡쳐할 필요 없게.

### 대안 입력(가능할 때 우선)
- **PDF 로스터** > 스크린샷 (월 전체 + 필드 더 많음). CrewConnex/AIMS는 PDF 존재.
- **ICS/이메일 포워딩** (지원 시).
- 단, ARMS 한국 LCC는 사실상 in-app only → 스크린샷 + enrichment가 현실 경로.

### 솔루션 요약 표

| 못 보이는 데이터 | 해결 |
|---|---|
| 섹터(객실 로스터) | (B) 편명+날짜 → 항공 스케줄 API |
| 출도착 정확시각/터미널 | (B) API, (A) 보이면 캡쳐 우선 |
| 기재(항공기) | (B) API (RaiLink엔 거의 불필요) |
| 레이오버 장소 | (C) 섹터 체이닝 추론 (호텔명은 포기) |
| 리포트/브리핑 | (A) BRF/SHOWUP, 없으면 (C) 규칙추정 |
| 스크롤로 빠진 날 | 멀티캡쳐 머지 + **갭 디텍션** |
| 2개월 로스터 | 기간기반(월고정 폐기) |

---

## 5. 구축할 데이터셋 (이 폴더)

1. **`samples.json`** — 제공된 10장 캡쳐의 **그라운드트루스 주석**(입력 이미지 → 기대 JSON). 파서/OCR 평가 셋. `captured`/`missing` 필드로 "무엇이 안 보였는지"도 라벨.
2. **`activity-codes.json`** — 시스템(CrewConnex/ARMS/표)별 **활동·휴가 코드 레전드**. 이미지 내 "Activity Code Descriptions" + 리서치로 작성. **항공사별 룩업**이 원칙임을 명시.
3. (추후) 룩업 시드 — Airport(IATA→tz)/Airline/AircraftType: OurAirports·OpenFlights·ICAO Doc 8643에서 임포트. 본 문서 6장 참조.

### 다음 단계(제안, 미착수)
- [ ] 룩업 3종(공항/항공사/기재) 오픈데이터 임포트 스크립트
- [ ] 항공 스케줄 enrichment API 1곳 PoC (편명+날짜 → 섹터/시각)
- [ ] 샘플 10장으로 현재 `parse-schedule-image` 프롬프트에 레이아웃 (C) 추가 후 정확도 측정
- [ ] 갭 디텍션 + 출처색 확인 UX 프로토타입

---

## 6. 참조 소스 (오픈데이터 & 표준)

- 공항/타임존: OurAirports (https://ourairports.com/data/), OpenFlights (https://openflights.org/data.html)
- 기재 designator: ICAO Doc 8643, Wikipedia "List of aircraft type designators"
- 스케줄 표준: IATA SSIM (Record Type 3 = Flight Leg), IATA AIDX(XML)
- 시각/규정: SKYbrary(STD), AltexSoft(block hours), 14 CFR §117.3, EASA ORO.FTL.210 (100/900/1000h)
- 항공 스케줄 API 후보: AviationStack, FlightAware AeroAPI, OAG, Cirium, Amadeus
- 라이브 앱 레퍼런스: RosterBuster(CAE), CrewLounge CONNECT/PILOTLOG(OCR 큐 패턴), Wilco/Wingman(엣지케이스 모델 참고)

> 코드 약어는 항공사/시스템마다 다르다(RES=Reserve vs Resigned 충돌 사례 존재). **표준은 SSIM(스케줄)뿐, 듀티코드는 항공사별 레전드로 파싱**할 것.

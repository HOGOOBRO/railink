import type { Metadata } from 'next'
import {
  LegalPage,
  LegalSection,
  LegalP,
  LegalList,
  LegalOrdered,
} from '../_components/LegalPage'

export const metadata: Metadata = {
  title: '개인정보 처리방침 · RaiLink',
  description: 'RaiLink 개인정보 처리방침.',
}

const EFFECTIVE_DATE = '2026.06.01'

export default function PrivacyPage() {
  return (
    <LegalPage title="개인정보 처리방침" effectiveDate={EFFECTIVE_DATE}>
      <LegalP>
        RaiLink(이하 “서비스”) 운영자(이하 “회사”)는 「개인정보 보호법」, 「정보통신망 이용촉진 및 정보보호 등에 관한
        법률」 등 관련 법령에 따라 회원의 개인정보를 안전하게 처리하기 위하여 다음과 같이 개인정보 처리방침(이하 “본
        방침”)을 수립·공개합니다.
      </LegalP>

      <LegalSection title="1. 처리하는 개인정보의 항목 및 수집 방법">
        <LegalP>
          <strong className="text-ink-900">가. 회원가입 시 필수로 수집하는 항목</strong>
        </LegalP>
        <LegalList>
          <li>공통: 전자우편 주소, 비밀번호(단방향 암호화 저장), 이름</li>
          <li>KTX 승무원 회원: 사번(숫자 4~8자리)</li>
        </LegalList>
        <LegalP>
          <strong className="text-ink-900">나. 회원이 선택적으로 입력·등록하는 항목</strong>
        </LegalP>
        <LegalList>
          <li>소속 사업소(서울/광명/부산/대전/동대구), 파트</li>
          <li>프로필 사진</li>
          <li>업데이트·이벤트 등 마케팅 알림 수신 동의 여부</li>
        </LegalList>
        <LegalP>
          <strong className="text-ink-900">다. 서비스 이용 과정에서 생성되는 정보</strong>
        </LegalP>
        <LegalList>
          <li>본인의 근무 일정(근무일자, 다이 번호, 대표 열차 번호, 출/퇴근 시각, 휴무 여부)</li>
          <li>회원 간 일정 공유 관계(공유 요청·수락·철회 이력)</li>
          <li>비교 그룹 구성 및 색상 인덱스</li>
          <li>인증 토큰, 서비스 접속 기록, 동작 로그</li>
          <li>AI 이미지 인식 기능 사용 시: 월별 사용 건수(인식 대상 이미지는 결과 반환 직후 폐기)</li>
        </LegalList>
        <LegalP>
          <strong className="text-ink-900">라. 자동으로 생성·수집되는 정보</strong>
        </LegalP>
        <LegalList>
          <li>쿠키 및 로컬 스토리지에 저장되는 세션 정보, 환경설정 값</li>
          <li>Google Analytics를 통한 축약 IP 주소, 기기 식별값, 브라우저 정보, 페이지 이용 기록</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="2. 개인정보의 수집·이용 목적">
        <LegalOrdered>
          <li>회원 식별 및 인증, 본인 확인</li>
          <li>캘린더, 일정 공유, 동료 검색·비교 등 서비스 제공</li>
          <li>회원의 문의 및 민원 처리, 공지사항 전달</li>
          <li>부정 이용 방지, 서비스 운영 및 보안의 안정성 확보</li>
          <li>서비스 개선을 위한 통계 분석(개인을 식별할 수 없는 형태로 가공)</li>
          <li>마케팅 알림 수신에 동의한 회원에 한하여, 신규 기능·이벤트 안내</li>
        </LegalOrdered>
      </LegalSection>

      <LegalSection title="3. 개인정보의 보유·이용 기간">
        <LegalP>
          ① 회원 정보 및 콘텐츠는 회원이 이용계약을 해지할 때까지 보유합니다. 회원 탈퇴 시 회사는 지체 없이 해당 정보를
          파기하되, 다음 각 호의 정보는 관련 법령에 따라 분리하여 보관합니다.
        </LegalP>
        <LegalOrdered>
          <li>「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 표시·광고에 관한 기록: 6개월</li>
          <li>「통신비밀보호법」에 따른 통신사실확인자료: 3개월</li>
        </LegalOrdered>
        <LegalP>
          ② 회원이 1년 이상 서비스에 접속하지 아니한 경우 회사는 별도의 통지 후 해당 계정을 휴면 처리하거나 삭제할 수
          있습니다.
        </LegalP>
      </LegalSection>

      <LegalSection title="4. 개인정보의 제3자 제공">
        <LegalP>
          회사는 회원의 개인정보를 회원의 별도 동의 또는 법령에 정한 경우 외에는 외부에 제공하지 아니합니다. 회원이
          서비스 내에서 다른 회원에게 일정 공유를 수락한 경우, 정보주체가 직접 동의한 범위에 한하여 해당 열람자에게 본인의
          근무 일정이 표시됩니다. 이는 회원이 직접 통제하는 처리에 해당하며, 회사의 제3자 제공이 아닙니다.
        </LegalP>
      </LegalSection>

      <LegalSection title="5. 개인정보의 처리위탁">
        <LegalP>
          회사는 원활하고 안정적인 서비스 제공을 위하여 다음의 사업자에게 개인정보 처리 업무를 위탁하고 있습니다. 위탁
          계약 시 「개인정보 보호법」 제26조에 따라 개인정보가 안전하게 관리될 수 있도록 필요한 사항을 규정하고 있습니다.
        </LegalP>
        <div className="rounded-lg border border-line bg-surface divide-y divide-line text-[12.5px] leading-relaxed">
          <PrivacyVendor
            name="Supabase, Inc."
            scope="회원 인증, 데이터베이스 호스팅, 파일 저장"
            items="제1항 가·나·다목의 모든 회원 정보"
            term="회원 탈퇴 또는 위탁계약 종료 시까지"
          />
          <PrivacyVendor
            name="OpenAI, L.L.C."
            scope="회원이 업로드한 근무표 이미지에서 일정 추출(AI 인식)"
            items="이미지 파일, 인식 결과"
            term="결과 반환 후 즉시 폐기(OpenAI API 정책상 학습용 보관 없음)"
          />
          <PrivacyVendor
            name="Vercel Inc."
            scope="서비스 호스팅 및 콘텐츠 전송"
            items="접속 로그, IP 주소"
            term="위탁계약 종료 시까지"
          />
          <PrivacyVendor
            name="Google LLC"
            scope="서비스 이용 통계 분석(Google Analytics)"
            items="축약 IP 주소, 쿠키 식별값, 페이지 이용 기록"
            term="26개월"
          />
        </div>
      </LegalSection>

      <LegalSection title="6. 개인정보의 국외 이전">
        <LegalP>
          회사는 위 제5항의 처리위탁을 위하여 다음과 같이 개인정보를 국외로 이전합니다. 회원은 본 항의 국외 이전을 거부할
          수 있으며, 거부 의사는 본 방침 제12항의 연락처로 표시할 수 있습니다. 다만 거부 시 AI 이미지 인식, 통계 분석 등
          일부 기능의 이용이 제한될 수 있습니다.
        </LegalP>
        <div className="rounded-lg border border-line bg-surface divide-y divide-line text-[12.5px] leading-relaxed">
          <PrivacyTransfer
            name="Supabase, Inc."
            country="미국, 싱가포르 등 (회사가 선택한 리전)"
            purpose="인증·데이터베이스·스토리지"
            items="제1항 회원 정보 일체"
            when="회원의 서비스 이용 시점, HTTPS를 통한 네트워크 전송"
            term="회원 탈퇴 시까지"
          />
          <PrivacyTransfer
            name="OpenAI, L.L.C."
            country="미국"
            purpose="AI 이미지 인식"
            items="이미지 파일, 인식 결과"
            when="회원이 이미지 업로드 시점, HTTPS 전송"
            term="결과 반환 직후 폐기"
          />
          <PrivacyTransfer
            name="Vercel Inc."
            country="미국 등"
            purpose="호스팅"
            items="접속 로그, IP"
            when="서비스 접속 시점, HTTPS 전송"
            term="위탁계약 종료 시까지"
          />
          <PrivacyTransfer
            name="Google LLC"
            country="미국"
            purpose="통계 분석"
            items="축약 IP, 쿠키 식별값, 페이지 이용 기록"
            when="페이지 로드 시점, HTTPS 전송"
            term="26개월"
          />
        </div>
      </LegalSection>

      <LegalSection title="7. 정보주체의 권리·의무 및 행사 방법">
        <LegalP>
          ① 회원은 회사에 대하여 언제든지 본인의 개인정보에 관한 열람, 정정·삭제, 처리정지, 동의 철회를 요구할 수 있습니다.
        </LegalP>
        <LegalP>
          ② 권리 행사는 서비스 내 설정 메뉴를 통하거나, 회사 이메일(hello@railink.app)로 신청할 수 있으며, 회사는
          이에 대하여 지체 없이 조치합니다.
        </LegalP>
        <LegalP>
          ③ 회원은 만 14세 미만 아동의 개인정보를 등록할 수 없으며, 본인이 아닌 타인의 개인정보를 등록하여서는 아니 됩니다.
        </LegalP>
      </LegalSection>

      <LegalSection title="8. 개인정보의 파기 절차 및 방법">
        <LegalP>
          ① 회사는 보유·이용 기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 해당 개인정보를 파기합니다.
        </LegalP>
        <LegalP>
          ② 전자적 파일 형태로 저장된 정보는 복구·재생이 불가능하도록 영구 삭제하며, 종이 문서 형태의 정보는 분쇄하거나
          소각합니다.
        </LegalP>
      </LegalSection>

      <LegalSection title="9. 개인정보의 안전성 확보 조치">
        <LegalP>
          회사는 「개인정보 보호법」 제29조에 따라 다음과 같은 안전성 확보 조치를 시행하고 있습니다.
        </LegalP>
        <LegalList>
          <li>비밀번호의 단방향 암호화 저장</li>
          <li>회원 정보에 대한 접근 권한 분리 및 최소 권한 원칙 적용(데이터베이스 Row Level Security 등)</li>
          <li>외부 통신 전 구간 HTTPS 적용</li>
          <li>처리 위탁 사업자에 대한 보안 의무 부과 및 정기 점검</li>
          <li>접근 로그의 보관 및 침해 시도 모니터링</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="10. 자동수집장치(쿠키 등)의 설치·운영 및 거부에 관한 사항">
        <LegalP>
          ① 회사는 회원의 인증 상태 유지, 환경설정 저장 및 이용 통계 분석을 위하여 쿠키, 로컬 스토리지 등 자동수집장치를
          사용합니다.
        </LegalP>
        <LegalP>
          ② 회원은 사용 중인 웹 브라우저의 설정을 통하여 쿠키 저장을 거부할 수 있습니다. 다만 인증 관련 쿠키를 거부하는
          경우 서비스 이용이 제한될 수 있습니다.
        </LegalP>
        <LegalP>
          ③ Google Analytics 차단을 원하는 회원은 Google이 제공하는 차단 부가기능(
          <a className="font-en text-brand" href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">
            tools.google.com/dlpage/gaoptout
          </a>
          )을 이용할 수 있습니다.
        </LegalP>
      </LegalSection>

      <LegalSection title="11. 만 14세 미만 아동의 개인정보">
        <LegalP>
          회사는 만 14세 미만 아동의 개인정보를 수집하지 아니합니다. 회원가입 시 만 14세 미만임이 확인되는 경우 회사는
          가입을 거부합니다.
        </LegalP>
      </LegalSection>

      <LegalSection title="12. 개인정보 보호책임자">
        <LegalP>
          회사는 개인정보의 처리에 관한 업무를 총괄하고, 회원의 개인정보 처리와 관련한 회원의 권리 행사를 처리하기 위하여
          다음과 같이 개인정보 보호책임자를 지정합니다.
        </LegalP>
        <LegalList>
          <li>개인정보 보호책임자: RaiLink 운영자</li>
          <li>
            연락처:{' '}
            <a className="font-en text-brand" href="mailto:hello@railink.app">
              hello@railink.app
            </a>
          </li>
        </LegalList>
        <LegalP>
          회원은 서비스를 이용하면서 발생한 모든 개인정보 보호 관련 문의·불만 처리·피해구제 등에 관한 사항을 위 연락처로
          문의할 수 있으며, 회사는 회원의 문의에 대하여 지체 없이 답변·처리합니다.
        </LegalP>
      </LegalSection>

      <LegalSection title="13. 권익침해 구제 방법">
        <LegalP>
          회원은 개인정보 침해로 인한 구제를 받기 위하여 다음의 기관에 분쟁해결이나 상담 등을 신청할 수 있습니다.
        </LegalP>
        <LegalList>
          <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
          <li>개인정보침해신고센터: 118 (privacy.kisa.or.kr)</li>
          <li>대검찰청 사이버수사과: 1301 (www.spo.go.kr)</li>
          <li>경찰청 사이버수사국: 182 (ecrm.cyber.go.kr)</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="14. 처리방침의 변경">
        <LegalP>
          본 방침은 법령 또는 서비스의 변경에 따라 개정될 수 있으며, 개정 시 그 사유 및 시행일자를 명시하여 서비스 내에
          공지합니다. 회원에게 중대한 영향을 미치는 변경의 경우 적용일자 30일 이전에 공지하고, 회원에게 전자우편으로
          통지합니다.
        </LegalP>
        <p className="mt-4">시행일: {EFFECTIVE_DATE}</p>
      </LegalSection>
    </LegalPage>
  )
}

function PrivacyVendor({
  name,
  scope,
  items,
  term,
}: {
  name: string
  scope: string
  items: string
  term: string
}) {
  return (
    <div className="px-3.5 py-3">
      <p className="font-bold text-ink-900">{name}</p>
      <dl className="mt-1.5 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-ink-700">
        <dt className="text-ink-500">위탁 업무</dt>
        <dd>{scope}</dd>
        <dt className="text-ink-500">위탁 항목</dt>
        <dd>{items}</dd>
        <dt className="text-ink-500">보유 기간</dt>
        <dd>{term}</dd>
      </dl>
    </div>
  )
}

function PrivacyTransfer({
  name,
  country,
  purpose,
  items,
  when,
  term,
}: {
  name: string
  country: string
  purpose: string
  items: string
  when: string
  term: string
}) {
  return (
    <div className="px-3.5 py-3">
      <p className="font-bold text-ink-900">{name}</p>
      <dl className="mt-1.5 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-ink-700">
        <dt className="text-ink-500">이전 국가</dt>
        <dd>{country}</dd>
        <dt className="text-ink-500">이전 목적</dt>
        <dd>{purpose}</dd>
        <dt className="text-ink-500">이전 항목</dt>
        <dd>{items}</dd>
        <dt className="text-ink-500">이전 시점/방법</dt>
        <dd>{when}</dd>
        <dt className="text-ink-500">보유 기간</dt>
        <dd>{term}</dd>
      </dl>
    </div>
  )
}

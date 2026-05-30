import type { Metadata } from 'next'
import { LegalPage, LegalSection, LegalP } from '../_components/LegalPage'

export const metadata: Metadata = {
  title: '오픈소스 라이선스 · RaiLink',
  description: 'RaiLink에서 사용하는 오픈소스 라이선스 고지.',
}

const EFFECTIVE_DATE = '2026.06.01'

interface OssEntry {
  name: string
  version?: string
  license: string
  url: string
  notice?: string
}

// Top-level runtime/UX dependencies actually shipped to clients. node_modules
// indirect deps are not listed individually; their licenses pass through under
// the upstream package's notice (all permissive).
const RUNTIME: OssEntry[] = [
  { name: 'Next.js', version: '14.x', license: 'MIT', url: 'https://github.com/vercel/next.js/blob/canary/license.md' },
  { name: 'React', version: '18.x', license: 'MIT', url: 'https://github.com/facebook/react/blob/main/LICENSE' },
  { name: 'React DOM', version: '18.x', license: 'MIT', url: 'https://github.com/facebook/react/blob/main/LICENSE' },
  { name: 'Tailwind CSS', version: '3.x', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE' },
  { name: 'PostCSS', version: '8.x', license: 'MIT', url: 'https://github.com/postcss/postcss/blob/main/LICENSE' },
  { name: 'Autoprefixer', version: '10.x', license: 'MIT', url: 'https://github.com/postcss/autoprefixer/blob/main/LICENSE' },
  { name: 'clsx', version: '2.x', license: 'MIT', url: 'https://github.com/lukeed/clsx/blob/master/license' },
  { name: '@supabase/supabase-js', version: '2.x', license: 'MIT', url: 'https://github.com/supabase/supabase-js/blob/master/LICENSE' },
  { name: 'SheetJS Community Edition (xlsx)', version: '0.18.x', license: 'Apache License 2.0', url: 'https://github.com/SheetJS/sheetjs/blob/master/LICENSE' },
]

const FONTS: OssEntry[] = [
  {
    name: 'Pretendard',
    license: 'SIL Open Font License 1.1',
    url: 'https://github.com/orioncactus/pretendard/blob/main/LICENSE',
    notice: '한글 본문 폰트로 사용.',
  },
  {
    name: 'JetBrains Mono',
    license: 'SIL Open Font License 1.1',
    url: 'https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt',
    notice: '영문·숫자·날짜·시각 표기 폰트로 사용.',
  },
]

export default function OssPage() {
  return (
    <LegalPage title="오픈소스 라이선스" effectiveDate={EFFECTIVE_DATE}>
      <LegalP>
        RaiLink는 다음의 오픈소스 소프트웨어를 사용하여 구성됩니다. 회사는 본 페이지를 통하여 각 라이선스의 사본 또는
        원본의 위치를 안내합니다. 각 소프트웨어의 저작권은 해당 권리자에게 있으며, 본 페이지는 고지의 목적으로만
        제공됩니다. 외부 서비스에 대한 개인정보 처리위탁·국외이전 내역은 「개인정보 처리방침」에서 확인할 수 있습니다.
      </LegalP>

      <LegalSection title="1. 런타임·UI 의존성">
        <OssList entries={RUNTIME} />
      </LegalSection>

      <LegalSection title="2. 폰트">
        <OssList entries={FONTS} />
      </LegalSection>

      <LegalSection title="3. 일반 고지">
        <LegalP>
          위 라이선스 본문(MIT, Apache License 2.0, SIL OFL 1.1 등)은 각 항목에 연결된 URL에서 전문을 확인할 수 있습니다.
          누락된 라이선스 고지가 있을 경우 회사 이메일(hello@railink.app)로 알려주시면 지체 없이 반영합니다.
        </LegalP>
      </LegalSection>
    </LegalPage>
  )
}

function OssList({ entries }: { entries: OssEntry[] }) {
  return (
    <ul className="rounded-lg border border-line bg-surface divide-y divide-line text-[12.5px] leading-relaxed">
      {entries.map(entry => (
        <li key={entry.name + entry.url} className="px-3.5 py-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-ink-900">{entry.name}</span>
            {entry.version && (
              <span className="font-en text-[11px] text-ink-500">{entry.version}</span>
            )}
          </div>
          <p className="mt-0.5 text-ink-700">{entry.license}</p>
          {entry.notice && <p className="mt-0.5 text-ink-500">{entry.notice}</p>}
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-en text-[11px] text-brand break-all"
          >
            {entry.url}
          </a>
        </li>
      ))}
    </ul>
  )
}

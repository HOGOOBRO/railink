import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LegalPage, LegalSection, LegalP } from '../_components/LegalPage'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.oss')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
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

export default async function OssPage() {
  const t = await getTranslations('legal.oss')

  // notice 문구만 로케일에 따라 바뀐다 — 패키지명·버전·라이선스·URL은 고유명사라
  // 번역하지 않는다.
  const FONTS: OssEntry[] = [
    {
      name: 'Pretendard',
      license: 'SIL Open Font License 1.1',
      url: 'https://github.com/orioncactus/pretendard/blob/main/LICENSE',
      notice: t('fontPretendard'),
    },
    {
      name: 'JetBrains Mono',
      license: 'SIL Open Font License 1.1',
      url: 'https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt',
      notice: t('fontJetbrains'),
    },
  ]

  return (
    <LegalPage title={t('title')} effectiveDate={EFFECTIVE_DATE}>
      <LegalP>{t('intro')}</LegalP>

      <LegalSection title={t('s1Title')}>
        <OssList entries={RUNTIME} />
      </LegalSection>

      <LegalSection title={t('s2Title')}>
        <OssList entries={FONTS} />
      </LegalSection>

      <LegalSection title={t('s3Title')}>
        <LegalP>{t('s3Body')}</LegalP>
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

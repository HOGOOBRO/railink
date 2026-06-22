import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  LegalPage,
  LegalSection,
  LegalP,
  LegalList,
  LegalOrdered,
} from '../_components/LegalPage'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacy')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

const EFFECTIVE_DATE = '2026.06.08'

interface Vendor {
  name: string
  scope: string
  items: string
  term: string
}

interface Transfer {
  name: string
  country: string
  purpose: string
  items: string
  when: string
  term: string
}

export default async function PrivacyPage() {
  const t = await getTranslations('legal.privacy')

  const list = (key: string) => t.raw(key) as string[]
  const vendors = t.raw('s5.vendors') as Vendor[]
  const transfers = t.raw('s6.transfers') as Transfer[]

  return (
    <LegalPage title={t('title')} effectiveDate={EFFECTIVE_DATE}>
      <LegalP>{t('intro')}</LegalP>

      <LegalSection title={t('s1.title')}>
        <LegalP>
          <strong className="text-ink-900">{t('s1.g')}</strong>
        </LegalP>
        <LegalList>
          {list('s1.gItems').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalList>
        <LegalP>
          <strong className="text-ink-900">{t('s1.n')}</strong>
        </LegalP>
        <LegalList>
          {list('s1.nItems').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalList>
        <LegalP>
          <strong className="text-ink-900">{t('s1.d')}</strong>
        </LegalP>
        <LegalList>
          {list('s1.dItems').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalList>
        <LegalP>
          <strong className="text-ink-900">{t('s1.r')}</strong>
        </LegalP>
        <LegalList>
          {list('s1.rItems').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalList>
      </LegalSection>

      <LegalSection title={t('s2.title')}>
        <LegalOrdered>
          {list('s2.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalOrdered>
      </LegalSection>

      <LegalSection title={t('s3.title')}>
        <LegalP>{t('s3.p1')}</LegalP>
        <LegalOrdered>
          {list('s3.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalOrdered>
        <LegalP>{t('s3.p2')}</LegalP>
      </LegalSection>

      <LegalSection title={t('s4.title')}>
        <LegalP>{t('s4.p')}</LegalP>
      </LegalSection>

      <LegalSection title={t('s5.title')}>
        <LegalP>{t('s5.p')}</LegalP>
        <div className="rounded-lg border border-line bg-surface divide-y divide-line text-[12.5px] leading-relaxed">
          {vendors.map(v => (
            <PrivacyVendor
              key={v.name}
              vendor={v}
              scopeLabel={t('s5.scopeLabel')}
              itemsLabel={t('s5.itemsLabel')}
              termLabel={t('s5.termLabel')}
            />
          ))}
        </div>
      </LegalSection>

      <LegalSection title={t('s6.title')}>
        <LegalP>{t('s6.p')}</LegalP>
        <div className="rounded-lg border border-line bg-surface divide-y divide-line text-[12.5px] leading-relaxed">
          {transfers.map(tr => (
            <PrivacyTransfer
              key={tr.name}
              transfer={tr}
              countryLabel={t('s6.countryLabel')}
              purposeLabel={t('s6.purposeLabel')}
              itemsLabel={t('s6.itemsLabel')}
              whenLabel={t('s6.whenLabel')}
              termLabel={t('s6.termLabel')}
            />
          ))}
        </div>
      </LegalSection>

      <LegalSection title={t('s7.title')}>
        {list('s7.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalSection>

      <LegalSection title={t('s8.title')}>
        {list('s8.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalSection>

      <LegalSection title={t('s9.title')}>
        <LegalP>{t('s9.p')}</LegalP>
        <LegalList>
          {list('s9.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalList>
      </LegalSection>

      <LegalSection title={t('s10.title')}>
        {list('s10.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalSection>

      <LegalSection title={t('s11.title')}>
        <LegalP>{t('s11.p')}</LegalP>
      </LegalSection>

      <LegalSection title={t('s12.title')}>
        <LegalP>{t('s12.p1')}</LegalP>
        <LegalList>
          <li>{t('s12.officer')}</li>
          <li>
            {t('s12.contactLabel')}{' '}
            <a className="font-en text-brand" href="mailto:hello@railink.app">
              hello@railink.app
            </a>
          </li>
        </LegalList>
        <LegalP>{t('s12.p2')}</LegalP>
      </LegalSection>

      <LegalSection title={t('s13.title')}>
        <LegalP>{t('s13.p')}</LegalP>
        <LegalList>
          {list('s13.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalList>
      </LegalSection>

      <LegalSection title={t('s14.title')}>
        <LegalP>{t('s14.p')}</LegalP>
        <p className="mt-4">{t('s14.effective', { date: EFFECTIVE_DATE })}</p>
      </LegalSection>
    </LegalPage>
  )
}

function PrivacyVendor({
  vendor,
  scopeLabel,
  itemsLabel,
  termLabel,
}: {
  vendor: Vendor
  scopeLabel: string
  itemsLabel: string
  termLabel: string
}) {
  return (
    <div className="px-3.5 py-3">
      <p className="font-bold text-ink-900">{vendor.name}</p>
      <dl className="mt-1.5 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-ink-700">
        <dt className="text-ink-500">{scopeLabel}</dt>
        <dd>{vendor.scope}</dd>
        <dt className="text-ink-500">{itemsLabel}</dt>
        <dd>{vendor.items}</dd>
        <dt className="text-ink-500">{termLabel}</dt>
        <dd>{vendor.term}</dd>
      </dl>
    </div>
  )
}

function PrivacyTransfer({
  transfer,
  countryLabel,
  purposeLabel,
  itemsLabel,
  whenLabel,
  termLabel,
}: {
  transfer: Transfer
  countryLabel: string
  purposeLabel: string
  itemsLabel: string
  whenLabel: string
  termLabel: string
}) {
  return (
    <div className="px-3.5 py-3">
      <p className="font-bold text-ink-900">{transfer.name}</p>
      <dl className="mt-1.5 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-ink-700">
        <dt className="text-ink-500">{countryLabel}</dt>
        <dd>{transfer.country}</dd>
        <dt className="text-ink-500">{purposeLabel}</dt>
        <dd>{transfer.purpose}</dd>
        <dt className="text-ink-500">{itemsLabel}</dt>
        <dd>{transfer.items}</dd>
        <dt className="text-ink-500">{whenLabel}</dt>
        <dd>{transfer.when}</dd>
        <dt className="text-ink-500">{termLabel}</dt>
        <dd>{transfer.term}</dd>
      </dl>
    </div>
  )
}

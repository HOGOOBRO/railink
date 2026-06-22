import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  LegalPage,
  LegalArticle,
  LegalP,
  LegalOrdered,
} from '../_components/LegalPage'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.terms')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

const EFFECTIVE_DATE = '2026.06.01'

export default async function TermsPage() {
  const t = await getTranslations('legal.terms')

  // 각 항(article)을 사전에서 구성한다. p[] 형태는 문단 배열로 순서대로 렌더하고,
  // items[]가 있는 항은 번호 목록으로 렌더한다.
  const paras = (key: string) => t.raw(key) as string[]
  const items = (key: string) => t.raw(key) as string[]

  return (
    <LegalPage title={t('title')} effectiveDate={EFFECTIVE_DATE}>
      <LegalArticle number={t('art1.number')} title={t('art1.title')}>
        {paras('art1.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art2.number')} title={t('art2.title')}>
        <LegalP>{t('art2.intro')}</LegalP>
        <LegalOrdered>
          {items('art2.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalOrdered>
      </LegalArticle>

      <LegalArticle number={t('art3.number')} title={t('art3.title')}>
        {paras('art3.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art4.number')} title={t('art4.title')}>
        {paras('art4.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art5.number')} title={t('art5.title')}>
        <LegalP>{t('art5.p1')}</LegalP>
        <LegalP>{t('art5.p2')}</LegalP>
        <LegalOrdered>
          {items('art5.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalOrdered>
        <LegalP>{t('art5.p3')}</LegalP>
      </LegalArticle>

      <LegalArticle number={t('art6.number')} title={t('art6.title')}>
        {paras('art6.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art7.number')} title={t('art7.title')}>
        {paras('art7.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art8.number')} title={t('art8.title')}>
        {paras('art8.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art9.number')} title={t('art9.title')}>
        {paras('art9.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art10.number')} title={t('art10.title')}>
        <LegalP>{t('art10.intro')}</LegalP>
        <LegalOrdered>
          {items('art10.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalOrdered>
      </LegalArticle>

      <LegalArticle number={t('art11.number')} title={t('art11.title')}>
        <LegalP>{t('art11.intro')}</LegalP>
        <LegalOrdered>
          {items('art11.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalOrdered>
        <LegalP>{t('art11.p2')}</LegalP>
      </LegalArticle>

      <LegalArticle number={t('art12.number')} title={t('art12.title')}>
        {paras('art12.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art13.number')} title={t('art13.title')}>
        <LegalP>{t('art13.p1')}</LegalP>
        <LegalP>{t('art13.p2')}</LegalP>
        <LegalP>{t('art13.p3')}</LegalP>
        <LegalOrdered>
          {items('art13.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalOrdered>
        <LegalP>{t('art13.p4')}</LegalP>
      </LegalArticle>

      <LegalArticle number={t('art14.number')} title={t('art14.title')}>
        {paras('art14.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art15.number')} title={t('art15.title')}>
        {paras('art15.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art16.number')} title={t('art16.title')}>
        <LegalP>{t('art16.p1')}</LegalP>
        <LegalOrdered>
          {items('art16.items').map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </LegalOrdered>
        <LegalP>{t('art16.p2')}</LegalP>
      </LegalArticle>

      <LegalArticle number={t('art17.number')} title={t('art17.title')}>
        {paras('art17.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art18.number')} title={t('art18.title')}>
        {paras('art18.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art19.number')} title={t('art19.title')}>
        {paras('art19.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('art20.number')} title={t('art20.title')}>
        {paras('art20.p').map((p, i) => (
          <LegalP key={i}>{p}</LegalP>
        ))}
      </LegalArticle>

      <LegalArticle number={t('addendum.number')} title={t('addendum.title')}>
        <LegalP>{t('addendum.p', { date: EFFECTIVE_DATE })}</LegalP>
      </LegalArticle>
    </LegalPage>
  )
}

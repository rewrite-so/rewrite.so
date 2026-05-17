import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { localizedMetadata } from '../../../metadata.ts';
import styles from '../Legal.module.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.contact' });
  return localizedMetadata(locale, '/contact', {
    title: t('title'),
    description: t('description'),
  });
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('page.contact');

  const mail = (subject?: string) =>
    subject ? (
      <>
        <a href="mailto:hello@rewrite.so">hello@rewrite.so</a> {t('subjectPrefix')}{' '}
        <code>{subject}</code>
      </>
    ) : (
      <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>
    );

  return (
    <article className={styles.longDoc}>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{t('h1')}</h1>
      <p style={{ marginTop: 16, color: '#555' }}>{t('intro')}</p>

      <div style={{ marginTop: 32, display: 'grid', gap: 16 }}>
        <Card
          heading={t('card1.heading')}
          body={
            <>
              {mail()}
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>{t('card1.body')}</span>
            </>
          }
        />

        <Card
          heading={t('card2.heading')}
          body={
            <>
              {mail(t('card2.subjectValue'))}
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>
                {t.rich('card2.body', {
                  refund: (chunks) => <a href="/refund">{chunks}</a>,
                })}
              </span>
            </>
          }
        />

        <Card
          heading={t('card3.heading')}
          body={
            <>
              {mail(t('card3.subjectValue'))}
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>
                {t.rich('card3.body', {
                  privacy: (chunks) => <a href="/privacy">{chunks}</a>,
                })}
              </span>
            </>
          }
        />

        <Card
          heading={t('card4.heading')}
          body={
            <>
              {mail(t('card4.subjectValue'))}
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>{t('card4.body')}</span>
            </>
          }
        />

        <Card
          heading={t('card5.heading')}
          body={
            <>
              <a
                href="https://github.com/rewrite-so/rewrite.so"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/rewrite-so/rewrite.so
              </a>
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>{t('card5.body')}</span>
            </>
          }
        />
      </div>
    </article>
  );
}

function Card({ heading, body }: { heading: string; body: ReactNode }) {
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid #e4e4e7',
        borderRadius: 10,
        background: '#fff',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#111',
          marginBottom: 8,
        }}
      >
        {heading}
      </div>
      <div style={{ fontSize: 14, color: '#333', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

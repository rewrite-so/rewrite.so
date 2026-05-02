import de from '@rewrite/shared/messages/de.json';
import en from '@rewrite/shared/messages/en.json';
import es from '@rewrite/shared/messages/es.json';
import fr from '@rewrite/shared/messages/fr.json';
import ja from '@rewrite/shared/messages/ja.json';
import ko from '@rewrite/shared/messages/ko.json';
import zhCN from '@rewrite/shared/messages/zh-CN.json';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing.ts';

const MESSAGES = {
  en,
  'zh-CN': zhCN,
  ja,
  ko,
  es,
  fr,
  de,
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: MESSAGES[locale],
  };
});

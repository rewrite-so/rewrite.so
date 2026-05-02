import { describe, expect, it } from 'vitest';
import de from './messages/de.json';
import en from './messages/en.json';
import es from './messages/es.json';
import fr from './messages/fr.json';
import ja from './messages/ja.json';
import ko from './messages/ko.json';
import zhCN from './messages/zh-CN.json';

const CATALOGS = { en, 'zh-CN': zhCN, ja, ko, es, fr, de };

type AnyTree = Record<string, unknown>;

function flattenKeys(obj: AnyTree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as AnyTree, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('messages catalog', () => {
  const enKeys = flattenKeys(en as AnyTree);

  it('all 7 locales have identical key sets', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      const localeKeys = flattenKeys(catalog as AnyTree);
      expect(localeKeys, `${locale} keys`).toEqual(enKeys);
    }
  });

  it('no empty string values', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      walkValues(catalog as AnyTree, (path, v) => {
        expect(v, `${locale}.${path}`).not.toBe('');
        expect(typeof v, `${locale}.${path}`).toBe('string');
      });
    }
  });

  it('en is the source of truth (non-empty + every key present)', () => {
    expect(enKeys.length).toBeGreaterThan(0);
  });
});

function walkValues(obj: AnyTree, visit: (path: string, v: unknown) => void, prefix = ''): void {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      walkValues(v as AnyTree, visit, path);
    } else {
      visit(path, v);
    }
  }
}

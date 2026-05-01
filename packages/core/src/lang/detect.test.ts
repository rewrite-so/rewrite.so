/// <reference lib="dom" />
import { afterEach, describe, expect, it } from 'vitest';
import { detectTargetLang, scriptHeuristic } from './detect.ts';

afterEach(() => {
  document.documentElement.removeAttribute('lang');
  document.body.innerHTML = '';
});

describe('detectTargetLang — priority chain', () => {
  it('userPref != auto wins over everything', () => {
    document.documentElement.setAttribute('lang', 'fr');
    expect(detectTargetLang({ userPref: 'ja', sampleText: '汉字' })).toBe('ja');
  });

  it('returns auto path when userPref = auto', () => {
    document.documentElement.setAttribute('lang', 'fr');
    expect(detectTargetLang({ userPref: 'auto' })).toBe('fr');
  });

  it('ancestor lang attribute beats html lang', () => {
    document.documentElement.setAttribute('lang', 'en');
    const wrap = document.createElement('div');
    wrap.setAttribute('lang', 'ja');
    const ta = document.createElement('textarea');
    wrap.appendChild(ta);
    document.body.appendChild(wrap);

    expect(detectTargetLang({ userPref: 'auto', el: ta })).toBe('ja');
  });

  it('falls through to html lang when no ancestor lang', () => {
    document.documentElement.setAttribute('lang', 'zh-CN');
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    expect(detectTargetLang({ userPref: 'auto', el: ta })).toBe('zh-CN');
  });

  it('falls through to navigator.language when no html lang', () => {
    // 不设 html lang
    const result = detectTargetLang({ userPref: 'auto' });
    // happy-dom 的默认 navigator.language 一般是 en-US
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('underscore in tag is normalized to dash', () => {
    expect(detectTargetLang({ userPref: 'zh_CN' })).toBe('zh-CN');
  });
});

describe('scriptHeuristic', () => {
  it('Han-only → zh-CN', () => {
    expect(scriptHeuristic('今天天气真好')).toBe('zh-CN');
  });
  it('Han + kana → ja', () => {
    expect(scriptHeuristic('今日はいい天気です')).toBe('ja');
  });
  it('Hangul → ko', () => {
    expect(scriptHeuristic('안녕하세요')).toBe('ko');
  });
  it('Arabic → ar', () => {
    expect(scriptHeuristic('مرحبا بالعالم')).toBe('ar');
  });
  it('Cyrillic → ru', () => {
    expect(scriptHeuristic('Привет мир')).toBe('ru');
  });
  it('Latin → en', () => {
    expect(scriptHeuristic('Hello world')).toBe('en');
  });
  it('empty → en fallback', () => {
    expect(scriptHeuristic('')).toBe('en');
    expect(scriptHeuristic('   ')).toBe('en');
  });
});

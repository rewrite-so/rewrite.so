import { describe, expect, it } from 'vitest';
import { buildMessages, buildSystemPrompt } from './index.ts';

describe('buildSystemPrompt', () => {
  it('produces 3 distinct system prompts per language', () => {
    const en = {
      f: buildSystemPrompt('faithful', 'en'),
      c: buildSystemPrompt('casual', 'en'),
      o: buildSystemPrompt('formal', 'en'),
    };
    expect(en.f).not.toEqual(en.c);
    expect(en.c).not.toEqual(en.o);
    expect(en.f).not.toEqual(en.o);
  });

  it('includes target language directive', () => {
    expect(buildSystemPrompt('faithful', 'ja')).toContain('"ja"');
    expect(buildSystemPrompt('formal', 'fr-FR')).toContain('"fr-FR"');
  });

  it('uses Chinese style rules for zh-* targets', () => {
    const zh = buildSystemPrompt('casual', 'zh-CN');
    expect(zh).toContain('风格：口语');
    expect(zh).toContain('像跟朋友发消息');
  });

  it('uses English style rules for non-zh targets', () => {
    expect(buildSystemPrompt('formal', 'en')).toContain('Style: FORMAL');
    expect(buildSystemPrompt('formal', 'ja')).toContain('Style: FORMAL');
  });

  it('faithful demands minimal change (key phrase present)', () => {
    expect(buildSystemPrompt('faithful', 'en')).toMatch(/smallest change/i);
    expect(buildSystemPrompt('faithful', 'zh-CN')).toContain('最小改动');
  });

  it('casual mentions chat / friend (key phrase present)', () => {
    expect(buildSystemPrompt('casual', 'en')).toMatch(/chat message|friend/i);
    expect(buildSystemPrompt('casual', 'zh-CN')).toContain('朋友');
  });

  it('formal forbids exclamation marks (key phrase present)', () => {
    expect(buildSystemPrompt('formal', 'en')).toMatch(/exclamation/i);
    expect(buildSystemPrompt('formal', 'zh-CN')).toContain('感叹号');
  });
});

describe('buildMessages', () => {
  it('returns 2 messages: system + user', () => {
    const msgs = buildMessages({
      style: 'faithful',
      targetLang: 'en',
      text: 'hello',
      hasSelection: false,
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[1]?.role).toBe('user');
  });

  it('wraps user text with triple quotes', () => {
    const msgs = buildMessages({
      style: 'faithful',
      targetLang: 'en',
      text: 'hello world',
      hasSelection: false,
    });
    expect(msgs[1]?.content).toContain('"""hello world"""');
  });

  it('includes context block when context provided', () => {
    const msgs = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 'this',
      context: 'surrounding paragraph',
      hasSelection: true,
    });
    expect(msgs[1]?.content).toContain('Context');
    expect(msgs[1]?.content).toContain('"""surrounding paragraph"""');
    expect(msgs[1]?.content).toContain('do not rewrite this');
  });

  it('omits context block when context absent or whitespace', () => {
    const a = buildMessages({ style: 'casual', targetLang: 'en', text: 't', hasSelection: false });
    expect(a[1]?.content).not.toContain('Context');

    const b = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 't',
      context: '   ',
      hasSelection: false,
    });
    expect(b[1]?.content).not.toContain('Context');
  });

  it('hasSelection does NOT affect prompt body (MVP decision)', () => {
    const a = buildMessages({ style: 'casual', targetLang: 'en', text: 'x', hasSelection: false });
    const b = buildMessages({ style: 'casual', targetLang: 'en', text: 'x', hasSelection: true });
    expect(a).toEqual(b);
  });

  it('preserves verbatim items per spec (URLs, mentions, hashtags, code)', () => {
    // 这条只验证 prompt 里有"保留"这条规则，不验证实际 LLM 行为
    const sys = buildMessages({
      style: 'faithful',
      targetLang: 'en',
      text: 'x',
      hasSelection: false,
    })[0]?.content;
    expect(sys).toMatch(/URL/i);
    expect(sys).toMatch(/@mention/i);
    expect(sys).toMatch(/hashtag/i);
  });
});

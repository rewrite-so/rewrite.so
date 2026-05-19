import { describe, expect, it } from 'vitest';
import { buildMessages, buildSystemPrompt, resolveRuleset } from './index.ts';

describe('resolveRuleset', () => {
  // §3 边界判定表 — 把 plan 里的 7 行原封不动跑一遍
  it.each<[string, 'zh' | 'en' | 'neutral']>([
    ['zh-CN', 'zh'],
    ['zh', 'zh'],
    ['zh-TW', 'zh'],
    ['中文', 'zh'],
    ['Chinese', 'zh'],
    ['Mandarin', 'zh'],
    ['粤语', 'zh'],
    ['Cantonese', 'zh'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['British English', 'en'],
    ['英文', 'en'],
    ['ja', 'neutral'],
    ['日本語', 'neutral'],
    ['Japanese', 'neutral'],
    ['ko', 'neutral'],
    ['fr', 'neutral'],
    ['es', 'neutral'],
    ['de', 'neutral'],
    ['Français', 'neutral'],
    ['Shakespearean', 'neutral'],
  ])('resolveRuleset(%j) → %j', (input, expected) => {
    expect(resolveRuleset(input)).toBe(expected);
  });

  it('handles whitespace and casing', () => {
    expect(resolveRuleset('  ZH-cn  ')).toBe('zh');
    expect(resolveRuleset('CHINESE')).toBe('zh');
    expect(resolveRuleset('English')).toBe('en');
  });
});

describe('buildSystemPrompt', () => {
  it('produces 3 distinct system prompts per ruleset (zh / en / neutral × 3 styles)', () => {
    const zh = {
      f: buildSystemPrompt('faithful', 'zh-CN'),
      c: buildSystemPrompt('casual', 'zh-CN'),
      o: buildSystemPrompt('formal', 'zh-CN'),
    };
    const en = {
      f: buildSystemPrompt('faithful', 'en'),
      c: buildSystemPrompt('casual', 'en'),
      o: buildSystemPrompt('formal', 'en'),
    };
    const ja = {
      f: buildSystemPrompt('faithful', 'ja'),
      c: buildSystemPrompt('casual', 'ja'),
      o: buildSystemPrompt('formal', 'ja'),
    };
    // Each ruleset's 3 styles are distinct
    for (const r of [zh, en, ja]) {
      expect(r.f).not.toEqual(r.c);
      expect(r.c).not.toEqual(r.o);
      expect(r.f).not.toEqual(r.o);
    }
    // The three rulesets are distinct for the same style
    expect(zh.c).not.toEqual(en.c);
    expect(en.c).not.toEqual(ja.c);
    expect(zh.c).not.toEqual(ja.c);
  });

  it('includes target language directive in quotes', () => {
    expect(buildSystemPrompt('faithful', 'ja')).toContain('"ja"');
    expect(buildSystemPrompt('formal', 'fr-FR')).toContain('"fr-FR"');
  });

  it('uses Chinese style rules for zh-* and natural-language Chinese descriptors', () => {
    for (const lang of ['zh-CN', 'zh', '中文', 'Chinese', 'Mandarin', '粤语']) {
      const out = buildSystemPrompt('casual', lang);
      expect(out).toContain('风格：口语');
      expect(out).toContain('朋友');
    }
  });

  it("uses NEUTRAL ruleset for Japanese ('ja')", () => {
    const ja = buildSystemPrompt('casual', 'ja');
    // NEUTRAL prompt 是英文写的，不应含中文风格 marker
    expect(ja).not.toContain('风格：口语');
    // 应含 language-neutral marker
    expect(ja).toMatch(/register/i);
    expect(ja).toMatch(/native speaker|target language/i);
  });

  it('faithful demands tiny / smallest fix, NOT a rewrite', () => {
    expect(buildSystemPrompt('faithful', 'en')).toMatch(/smallest|tiny|NOT to rewrite/i);
    expect(buildSystemPrompt('faithful', 'zh-CN')).toMatch(/最小幅度|不重写/);
  });

  it('casual mentions chat / friend (key phrase present)', () => {
    expect(buildSystemPrompt('casual', 'en')).toMatch(/chat|friend/i);
    expect(buildSystemPrompt('casual', 'zh-CN')).toContain('朋友');
  });

  it('formal forbids exclamation marks (key phrase present)', () => {
    expect(buildSystemPrompt('formal', 'en')).toMatch(/exclamation/i);
    expect(buildSystemPrompt('formal', 'zh-CN')).toContain('感叹号');
  });

  it('casual / formal contain Step 1 (extract) + Step 2 (discard / re-express)', () => {
    for (const lang of ['en', 'ja']) {
      for (const style of ['casual', 'formal'] as const) {
        const out = buildSystemPrompt(style, lang);
        expect(out).toMatch(/extract/i);
        expect(out).toMatch(/discard/i);
        expect(out).toMatch(/re-express/i);
      }
    }
    for (const style of ['casual', 'formal'] as const) {
      const out = buildSystemPrompt(style, 'zh-CN');
      expect(out).toContain('提取');
      expect(out).toContain('丢掉');
      expect(out).toContain('重新组织');
    }
  });

  it('faithful contains PRESERVE tone + level of formality directive', () => {
    for (const lang of ['en', 'ja']) {
      const out = buildSystemPrompt('faithful', lang);
      expect(out).toMatch(/PRESERVE/);
      expect(out).toMatch(/tone/i);
      expect(out).toMatch(/level of formality|formality/i);
    }
    const zh = buildSystemPrompt('faithful', 'zh-CN');
    expect(zh).toContain('语气');
    expect(zh).toMatch(/正式度|level of formality/);
  });

  it('faithful no longer contains imperative "Expand chat-speak" / "u → you" / "展开聊天缩写"', () => {
    // 旧 prompt 的错位指令：faithful 要求 LLM "展开缩写 u→you"，违反"贴近原文表达方式"。
    // 这里断言这些旧短语已删除。注意只匹配 imperative 形式 — "do NOT expand" / "不展开"
    // 这种反向命令是合法用法（DEFAULT 段告诉 LLM 不要展开），不做断言。
    for (const lang of ['en', 'ja', 'zh-CN']) {
      const out = buildSystemPrompt('faithful', lang);
      expect(out).not.toMatch(/Expand chat-speak/i);
      expect(out).not.toContain('u → you');
      expect(out).not.toContain('展开聊天缩写');
    }
  });

  it('no length-constraint phrases anywhere (regression: rules 5/casual-shorter/faithful-not-shorter)', () => {
    for (const lang of ['en', 'zh-CN', 'ja']) {
      for (const style of ['faithful', 'casual', 'formal'] as const) {
        const out = buildSystemPrompt(style, lang);
        expect(out).not.toMatch(/±25%/);
        expect(out).not.toMatch(/within 25%/i);
        expect(out).not.toMatch(/usually shorter than the original/i);
        expect(out).not.toMatch(/shorter or punchier/i);
        expect(out).not.toContain('缩短');
        expect(out).not.toContain('通常比原文短');
      }
    }
  });

  it('no dead-code rules (regression: empty-input + never-refuse)', () => {
    const sample = buildSystemPrompt('faithful', 'en');
    expect(sample).not.toMatch(/If the input is empty/i);
    expect(sample).not.toMatch(/output an empty string/i);
    expect(sample).not.toMatch(/Never refuse/i);
    expect(sample).not.toMatch(/never lecture/i);
    expect(sample).not.toMatch(/never add disclaimers/i);
  });

  it('NEUTRAL ruleset contains no language-specific examples (reverse assertions)', () => {
    for (const style of ['faithful', 'casual', 'formal'] as const) {
      const out = buildSystemPrompt(style, 'ja');
      // 不举具体语种例子
      expect(out).not.toMatch(/u → you/);
      expect(out).not.toMatch(/Use contractions/i);
      expect(out).not.toContain('咱');
      expect(out).not.toContain('挺');
      expect(out).not.toContain('です ます');
      expect(out).not.toContain('ですます');
      expect(out).not.toMatch(/Expand chat-speak/i);
      // 但应该有 language-neutral marker
      expect(out).toMatch(/register|native speaker|target language/i);
    }
  });

  it('NEUTRAL casual prompt is genuinely different from EN casual prompt', () => {
    const en = buildSystemPrompt('casual', 'en');
    const ja = buildSystemPrompt('casual', 'ja');
    expect(ja).not.toEqual(en);
    // EN.casual 有 "Use contractions"；NEUTRAL.casual 不应该有
    expect(en).toMatch(/Use contractions/i);
    expect(ja).not.toMatch(/Use contractions/i);
  });

  it('preserves verbatim items per common rule 4 (URLs, mentions, hashtags, code, etc.)', () => {
    const sys = buildSystemPrompt('faithful', 'en');
    expect(sys).toMatch(/URL/i);
    expect(sys).toMatch(/@mention/i);
    expect(sys).toMatch(/hashtag/i);
    expect(sys).toMatch(/code span/i);
  });

  it('mentions markdown structural markers + emoji preservation (new common rule 5)', () => {
    const sys = buildSystemPrompt('faithful', 'en');
    expect(sys).toMatch(/markdown/i);
    expect(sys).toMatch(/bold|italic|quote|list|heading/i);
    expect(sys).toMatch(/emoji/i);
    // FAITHFUL 路径 markdown verbatim
    expect(sys).toMatch(/verbatim/i);
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

  it('selection mode (hasSelection=true + context) uses SELECTION/CONTEXT structure', () => {
    const msgs = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 'this',
      context: 'surrounding paragraph',
      hasSelection: true,
    });
    const content = msgs[1]?.content ?? '';
    expect(content).toContain('Surrounding context');
    expect(content).toContain('"""surrounding paragraph"""');
    expect(content).toMatch(/DO NOT rewrite/i);
    expect(content).toContain('Selection to rewrite');
    expect(content).toMatch(/output ONLY/i);
    expect(content).toContain('"""this"""');
  });

  it('full-text mode (hasSelection=false, with context) does NOT use SELECTION wording', () => {
    const msgs = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 'this',
      context: 'around',
      hasSelection: false,
    });
    const content = msgs[1]?.content ?? '';
    expect(content).toContain('Context');
    expect(content).toContain('"""around"""');
    expect(content).toContain('Text to rewrite');
    expect(content).not.toMatch(/Selection to rewrite/);
  });

  it('omits context block when context absent or whitespace', () => {
    const a = buildMessages({ style: 'casual', targetLang: 'en', text: 't', hasSelection: false });
    expect(a[1]?.content).not.toMatch(/^Context\b/m);

    const b = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 't',
      context: '   ',
      hasSelection: false,
    });
    expect(b[1]?.content).not.toMatch(/^Context\b/m);
  });

  it('hasSelection=true without context STILL emits Selection label (兜底)', () => {
    // D 兜底：hasSelection=true 但 read.ts 未采到 context 时，仍要让 LLM 知道
    // 这是一段选区，不能默默退化到 "Text to rewrite"
    const msgs = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 'x',
      hasSelection: true,
    });
    const content = msgs[1]?.content ?? '';
    expect(content).toContain('Selection to rewrite');
    expect(content).toMatch(/output ONLY/i);
    expect(content).not.toContain('Surrounding context'); // 没 context 时不发空 context 区块
    expect(content).not.toMatch(/^Text to rewrite\b/m);
  });

  it('hasSelection differentiates prompt regardless of context presence', () => {
    // 有 context：两条 prompt 不同
    const withCtxNoSel = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 'x',
      context: 'ctx',
      hasSelection: false,
    });
    const withCtxSel = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 'x',
      context: 'ctx',
      hasSelection: true,
    });
    expect(withCtxNoSel).not.toEqual(withCtxSel);

    // 无 context：两条 prompt 也应该不同（hasSelection=true 走 Selection 标签兜底）
    const noCtxNoSel = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 'x',
      hasSelection: false,
    });
    const noCtxSel = buildMessages({
      style: 'casual',
      targetLang: 'en',
      text: 'x',
      hasSelection: true,
    });
    expect(noCtxNoSel).not.toEqual(noCtxSel);
  });
});

import { describe, expect, it } from 'vitest';
import type { PlatformName } from './PlatformIcon.tsx';
// 直接 import platform-meta.ts(纯 .ts,无 JSX) —— 避免 vitest esbuild 在
// jsx:preserve 模式下解析 PlatformSkin.tsx 失败。
import { PLATFORM_META, shouldShowPlaceholder } from './platform-meta.ts';

// Smoke 测试:不依赖 React Testing Library(apps/web 未装),仅校验
// (1) PLATFORM_META 配置完整性
// (2) placeholder/text 切换的纯函数 shouldShowPlaceholder
// 渲染分支测试靠人工 sample(参考 plan 的"人工 sample 检查清单")。

const EXPECTED_PLATFORMS: ReadonlyArray<PlatformName> = [
  'X',
  'Slack',
  'Reddit',
  'GitHub',
  'Discord',
];

describe('PLATFORM_META', () => {
  it.each(EXPECTED_PLATFORMS)('%s 含全部 5 个字段且非空', (platform) => {
    const meta = PLATFORM_META[platform];
    expect(meta).toBeDefined();
    expect(meta.tabName).toMatch(/\S/);
    expect(meta.tabSuffix).toMatch(/\S/);
    expect(meta.url).toMatch(/\S/);
    expect(meta.placeholder).toMatch(/\S/);
    expect(meta.primaryLabel).toMatch(/\S/);
  });

  it('覆盖且仅覆盖 EXPECTED_PLATFORMS 列表的 key,没多余', () => {
    expect(Object.keys(PLATFORM_META).sort()).toEqual([...EXPECTED_PLATFORMS].sort());
  });

  it('url 字段不含 https:// 前缀(给地址栏看起来像真实浏览器渲染)', () => {
    for (const platform of EXPECTED_PLATFORMS) {
      expect(PLATFORM_META[platform].url).not.toMatch(/^https?:\/\//);
    }
  });

  it('tabName 不含连字符 — (避免和 tabSuffix 拼接时双重 dash)', () => {
    for (const platform of EXPECTED_PLATFORMS) {
      expect(PLATFORM_META[platform].tabName).not.toContain('—');
    }
  });
});

describe('shouldShowPlaceholder', () => {
  it('typing + 空 text → 显示 placeholder', () => {
    expect(shouldShowPlaceholder('', 'typing')).toBe(true);
  });

  it('typing + 非空 text → 不显示 placeholder', () => {
    expect(shouldShowPlaceholder('a', 'typing')).toBe(false);
  });

  it.each([
    'triggering',
    'streaming',
    'accepted',
  ] as const)('%s phase(无论 text 空否)都不显示 placeholder', (phase) => {
    expect(shouldShowPlaceholder('', phase)).toBe(false);
    expect(shouldShowPlaceholder('hello', phase)).toBe(false);
  });
});

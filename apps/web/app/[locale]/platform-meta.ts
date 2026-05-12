// 纯数据 + 纯函数,从 PlatformSkin.tsx 抽出 —— 让 vitest 不需要 transform JSX
// 就能 import(web 项目 tsconfig 是 jsx:preserve,vitest esbuild import-analysis
// 不会自动转 JSX,如果直接 import 含 JSX 的 .tsx 会 fail)。
import type { PlatformName } from './PlatformIcon.tsx';

export type DemoPhase = 'typing' | 'triggering' | 'streaming' | 'accepted';

// tabName + tabSuffix 拆开是为了移动端能用 CSS 单独隐藏 suffix(' — Post' 等),
// 保留 tab 上的平台名;桌面端再拼接显示。
export const PLATFORM_META: Record<
  PlatformName,
  {
    tabName: string;
    tabSuffix: string;
    url: string;
    placeholder: string;
    primaryLabel: string;
  }
> = {
  X: {
    tabName: 'X',
    tabSuffix: 'Post',
    url: 'x.com/compose/post',
    placeholder: "What's happening?",
    primaryLabel: 'Post',
  },
  Slack: {
    tabName: 'Slack',
    tabSuffix: 'design',
    url: 'rewrite.slack.com/messages/design',
    placeholder: 'Message #design',
    primaryLabel: 'Send',
  },
  Reddit: {
    tabName: 'Reddit',
    tabSuffix: 'r/coding',
    url: 'reddit.com/r/coding/comments',
    placeholder: 'What are your thoughts?',
    primaryLabel: 'Comment',
  },
  GitHub: {
    tabName: 'GitHub',
    tabSuffix: 'Issue #42',
    url: 'github.com/rewrite-so/rewrite.so/issues/42',
    placeholder: 'Leave a comment',
    primaryLabel: 'Comment',
  },
};

// 决定输入区是显示 placeholder 还是用户文本。
// typing 阶段 text 为空时显示 placeholder(模拟真实输入框未输入态);
// 其它阶段(triggering / streaming / accepted)永不显示 placeholder
// —— 因为这些阶段必定已经有完整 input 文本。
export function shouldShowPlaceholder(text: string, phase: DemoPhase): boolean {
  if (phase !== 'typing') return false;
  return text.length === 0;
}

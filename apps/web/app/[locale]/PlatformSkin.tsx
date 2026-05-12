// PlatformSkin: 4 个平台输入框 skin(X / Slack / Reddit / GitHub),
// 让 landing demo "一眼看懂"在演示什么平台。装饰图标用通用 outline SVG,
// 不真实复刻任何平台 logo/字体,避免侵权;保留每个平台的 voice(主色 + 占位文字
// + 按钮文案 + header 结构)即可。
//
// 整段是纯视觉外壳,不与 packages/core mount() 集成 —— landing demo 是前端 mock。
import type { PlatformName } from './PlatformIcon.tsx';
import styles from './PlatformSkin.module.css';

// DemoPhase 是 HomeRewriteDemo 的状态机,放在 PlatformSkin 让两边共享类型,
// 避免循环依赖。
export type DemoPhase = 'typing' | 'triggering' | 'streaming' | 'accepted';

export const PLATFORM_META: Record<
  PlatformName,
  {
    tabLabel: string;
    url: string;
    placeholder: string;
    primaryLabel: string;
  }
> = {
  X: {
    tabLabel: 'X — Post',
    url: 'x.com/compose/post',
    placeholder: "What's happening?",
    primaryLabel: 'Post',
  },
  Slack: {
    tabLabel: 'Slack — design',
    url: 'rewrite.slack.com/messages/design',
    placeholder: 'Message #design',
    primaryLabel: 'Send',
  },
  Reddit: {
    tabLabel: 'Reddit — r/coding',
    url: 'reddit.com/r/coding/comments',
    placeholder: 'What are your thoughts?',
    primaryLabel: 'Comment',
  },
  GitHub: {
    tabLabel: 'GitHub — Issue #42',
    url: 'github.com/rewrite-so/rewrite.so/issues/42',
    placeholder: 'Leave a comment',
    primaryLabel: 'Comment',
  },
};

// 工具栏每个平台保留 5 个图标,移动端只留 2 个最具辨识度的(hideOnMobile=false 的)。
// 名字必须存在于 TOOLBAR_ICON_PATHS。
const PLATFORM_TOOLBAR: Record<
  PlatformName,
  ReadonlyArray<{ name: ToolbarIconName; hideOnMobile: boolean }>
> = {
  X: [
    { name: 'image', hideOnMobile: false },
    { name: 'gif', hideOnMobile: false },
    { name: 'poll', hideOnMobile: true },
    { name: 'emoji', hideOnMobile: true },
    { name: 'location', hideOnMobile: true },
  ],
  Slack: [
    { name: 'bold', hideOnMobile: true },
    { name: 'italic', hideOnMobile: true },
    { name: 'at', hideOnMobile: false },
    { name: 'emoji', hideOnMobile: false },
    { name: 'image', hideOnMobile: true },
  ],
  Reddit: [
    { name: 'bold', hideOnMobile: false },
    { name: 'italic', hideOnMobile: true },
    { name: 'link', hideOnMobile: true },
    { name: 'list', hideOnMobile: true },
    { name: 'image', hideOnMobile: false },
  ],
  GitHub: [
    { name: 'bold', hideOnMobile: false },
    { name: 'italic', hideOnMobile: true },
    { name: 'quote', hideOnMobile: true },
    { name: 'code', hideOnMobile: true },
    { name: 'link', hideOnMobile: false },
  ],
};

type ToolbarIconName =
  | 'image'
  | 'gif'
  | 'poll'
  | 'emoji'
  | 'location'
  | 'bold'
  | 'italic'
  | 'link'
  | 'list'
  | 'code'
  | 'quote'
  | 'at';

// 14x14 viewBox, stroke="currentColor" stroke-width="1.5" fill="none"。
// 部分用字符在 SVG <text> 里渲染(GIF / B / I / @ / </> / "),避免 emoji 跨平台
// 字体差异;text 用 SVG 自带字体度量,跟 path 图标视觉风格一致。
function ToolbarIcon({ name }: { name: ToolbarIconName }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>{name}</title>
      {renderToolbarIconBody(name)}
    </svg>
  );
}

function renderToolbarIconBody(name: ToolbarIconName) {
  switch (name) {
    case 'image':
      return (
        <>
          <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" />
          <circle cx="4.7" cy="5.7" r="0.9" />
          <path d="M2.2 10 L5.5 7.2 L8.2 9.3 L10.5 7 L12.2 9.4" />
        </>
      );
    case 'gif':
      return (
        <>
          <rect x="1" y="3" width="12" height="8" rx="1.2" />
          <text
            x="7"
            y="9.2"
            textAnchor="middle"
            fontSize="4.2"
            fontWeight="700"
            fill="currentColor"
            stroke="none"
            fontFamily="-apple-system, system-ui, sans-serif"
          >
            GIF
          </text>
        </>
      );
    case 'poll':
      return (
        <>
          <line x1="3" y1="11" x2="3" y2="7.5" />
          <line x1="7" y1="11" x2="7" y2="4.5" />
          <line x1="11" y1="11" x2="11" y2="6" />
          <line x1="1.5" y1="11.5" x2="12.5" y2="11.5" />
        </>
      );
    case 'emoji':
      return (
        <>
          <circle cx="7" cy="7" r="5" />
          <circle cx="5" cy="6" r="0.4" fill="currentColor" />
          <circle cx="9" cy="6" r="0.4" fill="currentColor" />
          <path d="M4.5 8.4 Q7 10.5 9.5 8.4" />
        </>
      );
    case 'location':
      return (
        <>
          <path d="M7 1.5 C9.6 1.5 11.5 3.4 11.5 6 C11.5 9 7 12.5 7 12.5 C7 12.5 2.5 9 2.5 6 C2.5 3.4 4.4 1.5 7 1.5 Z" />
          <circle cx="7" cy="6" r="1.6" />
        </>
      );
    case 'bold':
      return (
        <text
          x="7"
          y="10.5"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="currentColor"
          stroke="none"
          fontFamily="-apple-system, system-ui, sans-serif"
        >
          B
        </text>
      );
    case 'italic':
      return (
        <text
          x="7"
          y="10.5"
          textAnchor="middle"
          fontSize="11"
          fontStyle="italic"
          fontWeight="500"
          fill="currentColor"
          stroke="none"
          fontFamily="Georgia, serif"
        >
          I
        </text>
      );
    case 'link':
      return (
        <>
          <path d="M6 8.5 L8 6.5" />
          <path d="M8.5 5 L9.5 4 A2 2 0 0 1 12 6.5 L11 7.5" />
          <path d="M5.5 9 L4.5 10 A2 2 0 0 1 2 7.5 L3 6.5" />
        </>
      );
    case 'list':
      return (
        <>
          <circle cx="2.5" cy="4" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="2.5" cy="7" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="2.5" cy="10" r="0.6" fill="currentColor" stroke="none" />
          <line x1="4.8" y1="4" x2="12" y2="4" />
          <line x1="4.8" y1="7" x2="12" y2="7" />
          <line x1="4.8" y1="10" x2="12" y2="10" />
        </>
      );
    case 'code':
      return (
        <>
          <path d="M4.5 4 L1.5 7 L4.5 10" />
          <path d="M9.5 4 L12.5 7 L9.5 10" />
          <path d="M8 3 L6 11" />
        </>
      );
    case 'quote':
      return (
        <>
          <path d="M3 9 V6 A2 2 0 0 1 5 4 M3 9 H5 V6.5 H3" />
          <path d="M8 9 V6 A2 2 0 0 1 10 4 M8 9 H10 V6.5 H8" />
        </>
      );
    case 'at':
      return (
        <>
          <circle cx="7" cy="7" r="2.2" />
          <path d="M9.2 7 V8 A1.5 1.5 0 0 0 12 7.5 A5 5 0 1 0 9.5 11.4" />
        </>
      );
  }
}

export interface PlatformInputSkinProps {
  platform: PlatformName;
  text: string;
  fullInput: string;
  phase: DemoPhase;
  // demoCaret class 由 caller 从 HomePage.module.css 传入,复用已有的 caret 闪烁
  // 动画(@keyframes demoCaretBlink),避免在两个 module.css 里维护同一份动画。
  caretClassName: string;
}

// 决定输入区是显示 placeholder 还是用户文本。导出供 PlatformSkin.test 校验。
// typing 阶段 text 为空时显示 placeholder(模拟真实输入框未输入态);
// 其它阶段(triggering / streaming / accepted)永不显示 placeholder
// —— 因为这些阶段必定已经有完整 input 文本。
export function shouldShowPlaceholder(text: string, phase: DemoPhase): boolean {
  if (phase !== 'typing') return false;
  return text.length === 0;
}

export function PlatformInputSkin({
  platform,
  text,
  fullInput,
  phase,
  caretClassName,
}: PlatformInputSkinProps) {
  const meta = PLATFORM_META[platform];
  const showPlaceholder = shouldShowPlaceholder(text, phase);
  const isButtonDisabled = text.length === 0;
  const toolbarIcons = PLATFORM_TOOLBAR[platform];

  const containerClass = [
    styles.skin,
    phase === 'streaming' ? styles.skinStreaming : '',
    phase === 'accepted' ? styles.skinAccepted : '',
  ]
    .filter(Boolean)
    .join(' ');

  const buttonClass = [styles.primaryButton, styles[`btn${platform}`]].filter(Boolean).join(' ');

  return (
    <div className={containerClass}>
      {/* Header(按平台分支) ────────────────────────────────────── */}
      {platform === 'Slack' && (
        <div className={styles.headerSlack}>
          <span className={styles.headerSlackHash}>#</span>
          <span>design</span>
        </div>
      )}
      {platform === 'Reddit' && <div className={styles.headerReddit}>Comment as u/rewrite_so</div>}
      {platform === 'GitHub' && (
        <div className={styles.headerGitHub} aria-hidden="true">
          <span className={`${styles.githubTab} ${styles.githubTabActive}`}>Write</span>
          <span className={styles.githubTab}>Preview</span>
        </div>
      )}

      {/* Body: 仅 X 有左侧头像,其它 fullwidth ─────────────────── */}
      <div className={styles.body}>
        {platform === 'X' && <div className={styles.avatarX} aria-hidden="true" />}
        <div className={styles.inputArea}>
          {showPlaceholder ? (
            <>
              <span className={styles.placeholder}>{meta.placeholder}</span>
              <span className={caretClassName} aria-hidden="true">
                |
              </span>
            </>
          ) : (
            <>
              {text}
              <span className={caretClassName} aria-hidden="true">
                |
              </span>
              {phase === 'typing' && text.length < fullInput.length && (
                // invisible placeholder 撑住完整 input 高度,防 typing 阶段行数跳变。
                // sliceForStream 按 code point 切,fullInput.slice(text.length) 接续合法。
                <span style={{ visibility: 'hidden' }} aria-hidden="true">
                  {fullInput.slice(text.length)}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className={styles.separator} />

      {/* Toolbar + primary button ─────────────────────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarIcons}>
          {toolbarIcons.map((icon) => (
            <span
              key={icon.name}
              className={[
                styles.toolbarIcon,
                icon.hideOnMobile ? styles.toolbarIconHideOnMobile : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              <ToolbarIcon name={icon.name} />
            </span>
          ))}
        </div>
        <button
          type="button"
          className={buttonClass}
          aria-disabled={isButtonDisabled}
          tabIndex={-1}
        >
          {meta.primaryLabel}
        </button>
      </div>
    </div>
  );
}

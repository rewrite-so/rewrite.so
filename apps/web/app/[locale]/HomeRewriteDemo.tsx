'use client';

import type { CSSProperties, KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import { sliceForStream } from '../../lib/sliceForStream.ts';
import styles from './HomePage.module.css';
import { PlatformIcon, type PlatformName } from './PlatformIcon.tsx';
import { type DemoPhase, PLATFORM_META, PlatformInputSkin } from './PlatformSkin.tsx';

type DemoCandidate = {
  style: 'faithful' | 'casual' | 'formal';
  label: string;
  text: string;
};

type DemoExample = {
  key: string;
  badge: string;
  // platform 是该 example 关联的真实平台,在 demo chrome bar 显示对应 logo + 平台名,
  // 暗示扩展在这些平台都工作。anyInput 保留作为屏读器 fallback。
  platform: PlatformName;
  input: string;
  candidates: DemoCandidate[];
};

export type HomeRewriteDemoCopy = {
  anyInput: string;
  youTyped: string;
  streams: string;
  accepted: string;
  selectHint: string;
  examples: DemoExample[];
};

const PHASE_DURATION_MS: Record<DemoPhase, number> = {
  typing: 1100,
  triggering: 720,
  // streaming = STREAM_TOTAL_MS(2200) + 400ms 完整态停顿,让用户在切下一 example 前看清成品
  streaming: 2600,
  accepted: 2600,
};

// typing 阶段的输入框打字机时间轴。TYPING_TOTAL_MS 是 rAF 推进窗口;
// PHASE_DURATION_MS.typing(1100ms) - TYPING_TOTAL_MS(1000ms) = 100ms 完整态停顿,
// 让用户看清完整输入后再 Shift Shift 触发。input 长度 20-39 字符 ⇒ 26-50ms/char。
const TYPING_TOTAL_MS = 1000;

// streaming 阶段的打字机时间轴。STREAM_TOTAL_MS 是 rAF 推进窗口;
// 单卡在 STREAM_CARD_OFFSET_BASE + i*STREAM_CARD_OFFSET_STEP 起步,流 STREAM_CARD_DURATION 占比。
// 最长候选 96 字符 / 1430ms ≈ 14.9ms/char,接近真实 SSE 体感。
const STREAM_TOTAL_MS = 2200;
const STREAM_CARD_OFFSET_BASE = 0.08;
const STREAM_CARD_OFFSET_STEP = 0.06;
const STREAM_CARD_DURATION = 0.65;

export function HomeRewriteDemo({ copy }: { copy: HomeRewriteDemoCopy }) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>('typing');
  const [acceptedVersion, setAcceptedVersion] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [inputProgress, setInputProgress] = useState(0);
  const example = copy.examples[exampleIndex] ?? copy.examples[0];
  const exampleCount = copy.examples.length;
  const fullInput = example?.input ?? '';
  // typing 阶段:按 inputProgress 一字一字流入,模拟用户键入。
  // triggering/streaming 阶段:显示完整 input。accepted 阶段:切到选中的 candidate text。
  const displayedText =
    phase === 'accepted'
      ? (example?.candidates[selectedIndex]?.text ?? fullInput)
      : phase === 'typing'
        ? sliceForStream(fullInput, inputProgress)
        : fullInput;
  const statusText =
    phase === 'streaming' ? copy.streams : phase === 'accepted' ? copy.accepted : copy.youTyped;

  useEffect(() => {
    if (isPaused || exampleCount === 0) {
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // reduced-motion 下：跳过中间动画相位，仍按更慢节奏（每 8 秒）切下一个 example，
    // 让访客看到 4 个 cross-language 演示而不是单一静止快照。
    if (reduceMotion) {
      if (phase !== 'accepted') {
        setPhase('accepted');
        return;
      }
      const timeout = window.setTimeout(() => {
        const nextExampleIndex = (exampleIndex + 1) % exampleCount;
        const nextCandidateCount = copy.examples[nextExampleIndex]?.candidates.length ?? 0;
        setExampleIndex(nextExampleIndex);
        setSelectedIndex(nextCandidateCount === 0 ? 0 : nextExampleIndex % nextCandidateCount);
      }, 8000);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      if (phase === 'typing') {
        setPhase('triggering');
        return;
      }
      if (phase === 'triggering') {
        setPhase('streaming');
        return;
      }
      if (phase === 'streaming') {
        setPhase('accepted');
        setAcceptedVersion((v) => v + 1);
        return;
      }
      // 切下一个 example：selectedIndex 取 nextExampleIndex % candidateCount，
      // 让被高亮的候选轮替（0→1→2→0），给视觉一些变化而不是永远停在同一行。
      const nextExampleIndex = (exampleIndex + 1) % exampleCount;
      const nextCandidateCount = copy.examples[nextExampleIndex]?.candidates.length ?? 0;
      setExampleIndex(nextExampleIndex);
      setSelectedIndex(nextCandidateCount === 0 ? 0 : nextExampleIndex % nextCandidateCount);
      setPhase('typing');
    }, PHASE_DURATION_MS[phase]);

    return () => window.clearTimeout(timeout);
  }, [copy.examples, exampleCount, exampleIndex, isPaused, phase]);

  // typing phase 的输入框打字机时间轴 —— 同款 rAF 续上模式(详见下方 streaming effect 注释)。
  // biome-ignore lint/correctness/useExhaustiveDependencies: inputProgress 是起始锚点的陈旧快照,故意不进 deps
  useEffect(() => {
    if (phase !== 'typing') {
      setInputProgress(0);
      return;
    }
    if (isPaused) {
      return;
    }
    let raf = 0;
    const start = performance.now() - inputProgress * TYPING_TOTAL_MS;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / TYPING_TOTAL_MS);
      setInputProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, isPaused]);

  // streaming phase 的打字机时间轴。rAF 推进,hover/focus 暂停时保留 progress、
  // 恢复时反推 start 续上,避免文字打到一半重头开始。
  // streamProgress 故意不进 deps —— 只在 mount/phase/isPaused 切换时读一次起始快照。
  // biome-ignore lint/correctness/useExhaustiveDependencies: streamProgress 是起始锚点的陈旧快照,故意不进 deps
  useEffect(() => {
    if (phase !== 'streaming') {
      setStreamProgress(0);
      return;
    }
    if (isPaused) {
      return;
    }
    let raf = 0;
    const start = performance.now() - streamProgress * STREAM_TOTAL_MS;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / STREAM_TOTAL_MS);
      setStreamProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, isPaused]);

  function accept(index: number) {
    setSelectedIndex(index);
    setPhase('accepted');
    setAcceptedVersion((v) => v + 1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === '1' || event.key === '2' || event.key === '3') {
      const index = Number(event.key) - 1;
      if (example?.candidates[index]) {
        accept(index);
        event.preventDefault();
      }
    }
  }

  return (
    // 用 <section role="region"> 作为可聚焦的语义容器，让 aria-label 合法生效。
    // 不在外层加 tabIndex —— 用户 Tab 进 demo 后会先聚焦第一个 candidate <button>，
    // 此时按 1/2/3 通过 onKeyDown 冒泡到这里命中处理；onMouseEnter / onFocus 也仍然
    // 能在 hover / 内部按钮聚焦时暂停轮播。
    <section
      className={styles.demoShell}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsPaused(false);
        }
      }}
      aria-label={`${copy.anyInput}: ${example?.badge ?? ''}`}
    >
      <div className={styles.demoChrome}>
        {/* Chrome bar 行 1: traffic lights + 单个 tab(含 favicon + 平台名 + ×)。
            tab 文案在移动端截断到平台名 —— demoTabLabelSuffix 用 CSS @media 隐藏。 */}
        <div className={styles.demoChromeTopRow}>
          <span className={styles.demoDot} />
          <span className={styles.demoDot} />
          <span className={styles.demoDot} />
          {example?.platform && (
            <div className={styles.demoTab}>
              <span className={styles.demoTabFavicon}>
                <PlatformIcon name={example.platform} size={12} />
              </span>
              <span className={styles.demoTabLabel}>
                <span className={styles.demoTabName}>
                  {PLATFORM_META[example.platform].tabName}
                </span>
                {/* suffix 在 < 880px 由 CSS 隐藏,仅留 platform 名 */}
                <span className={styles.demoTabSuffix}>
                  {' — '}
                  {PLATFORM_META[example.platform].tabSuffix}
                </span>
              </span>
              <span className={styles.demoTabClose} aria-hidden="true">
                ×
              </span>
            </div>
          )}
        </div>
        {/* Chrome bar 行 2: 导航箭头(占位,< 880px 隐藏) + 锁图标 + URL + 菜单 ⋮ */}
        <div className={styles.demoChromeAddressRow}>
          <span className={styles.demoChromeNav} aria-hidden="true">
            <span>‹</span>
            <span>›</span>
            <span>↻</span>
          </span>
          <div className={styles.demoAddressBar}>
            <svg
              className={styles.demoAddressBarLock}
              width={11}
              height={11}
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              aria-hidden="true"
            >
              <title>secure</title>
              <rect x="3" y="6.5" width="8" height="6" rx="1" />
              <path d="M5 6.5 V4.5 A2 2 0 0 1 9 4.5 V6.5" />
            </svg>
            <span className={styles.demoAddressBarUrl}>
              {example?.platform && PLATFORM_META[example.platform].url}
            </span>
            <span className={styles.demoAddressBarMenu} aria-hidden="true">
              ⋮
            </span>
          </div>
        </div>
      </div>

      <div className={styles.demoInputWrap}>
        <div className={styles.demoScenarioRow}>
          <span className={styles.demoScenarioBadge}>{example?.badge}</span>
          <span className={styles.demoScenarioCount}>
            {exampleIndex + 1}/{exampleCount}
          </span>
        </div>
        <div className={styles.demoMeta}>{statusText}</div>
        {example?.platform && (
          <PlatformInputSkin
            platform={example.platform}
            text={displayedText}
            fullInput={fullInput}
            phase={phase}
            acceptedVersion={acceptedVersion}
            caretClassName={styles.demoCaret}
          />
        )}
      </div>

      <div className={styles.demoShortcut} aria-hidden="true">
        <span
          className={[
            styles.demoKey,
            phase === 'triggering' ? styles.demoKeyTapFirst : '',
            phase === 'streaming' ? styles.demoKeyActive : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          Shift
        </span>
        <span
          className={[
            styles.demoKey,
            phase === 'triggering' ? styles.demoKeyTapSecond : '',
            phase === 'streaming' ? styles.demoKeyActive : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          Shift
        </span>
      </div>

      <div className={styles.demoCandidates}>
        {example?.candidates.map((candidate, index) => {
          const isVisible = phase === 'streaming' || phase === 'accepted';
          const isSelected = phase === 'accepted' && selectedIndex === index;

          // streaming 阶段:按 cardOffset 错峰,文字逐字流入。其它阶段渲染完整 text
          // (typing/triggering 时卡片 opacity 0 不可见但仍撑满高度;accepted 立即完整)。
          let visibleText = candidate.text;
          if (phase === 'streaming') {
            const cardOffset = STREAM_CARD_OFFSET_BASE + index * STREAM_CARD_OFFSET_STEP;
            const cardProgress = Math.max(
              0,
              Math.min(1, (streamProgress - cardOffset) / STREAM_CARD_DURATION),
            );
            visibleText = sliceForStream(candidate.text, cardProgress);
          }

          return (
            <button
              type="button"
              key={`${example.key}-${candidate.style}`}
              className={[
                styles.demoCandidate,
                isVisible ? styles.demoCandidateVisible : '',
                isSelected ? styles.demoCandidateSelected : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!isVisible}
              onClick={() => accept(index)}
              style={{ transitionDelay: isVisible ? `${index * 90}ms` : '0ms' } as CSSProperties}
            >
              <span className={styles.demoCandidateIndex}>{index + 1}</span>
              <span className={styles.demoCandidateLabel}>{candidate.label}</span>
              <span className={styles.demoCandidateText}>
                {visibleText}
                {phase === 'streaming' && visibleText.length < candidate.text.length && (
                  // invisible placeholder 撑高度,防 streaming 开头单行→多行的高度抖动。
                  // visibleText.length(UTF-16 单元)与 slice(visibleText.length)接续合法 ——
                  // sliceForStream 按 code point 切,保证不会切到 surrogate pair 中间。
                  <span style={{ visibility: 'hidden' }} aria-hidden="true">
                    {candidate.text.slice(visibleText.length)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.demoHint}>{copy.selectHint}</div>
    </section>
  );
}

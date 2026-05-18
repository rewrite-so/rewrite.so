'use client';

import { useEffect, useRef, useState } from 'react';
import { sliceForStream } from '../../lib/sliceForStream.ts';
import styles from './HomePage.module.css';
import type { PlatformName } from './PlatformIcon.tsx';
import { type DemoPhase, PlatformInputSkin } from './PlatformSkin.tsx';

// 左侧 3 条场景列表 + 右侧大演示。一个场景完整演完(typing input → streaming 3 候选 →
// showing 3 候选)后 advance 到下一个。**演示主角是 3 候选浮窗**(对应产品真实交互的
// "3 选一"),不再像之前用 accepted phase 替换 input —— 产品真实交互是用户**自己**按
// 1/2/3 决定哪个落地,我们演示停在"看到 3 候选"状态就够。hover 单条列表项 pin。
//
// PlatformInputSkin 在 streaming / showing 阶段仍传 phase='typing':此时 input 区
// 静态显示完整 input(inputProgress=1,sliceForStream(input,1)=input)。caret 还在
// 闪 OK,模拟"用户已写完,等候选"。

type ScenarioPhase = 'typing' | 'streaming' | 'showing';

const PHASE_DURATION_MS: Record<ScenarioPhase, number> = {
  typing: 1500,
  streaming: 2800,
  showing: 3000,
};
const TYPING_TOTAL_MS = 1300;
const STREAM_TOTAL_MS = 2400;
// 3 候选错位流入参数(借鉴 HomeRewriteDemo 的 STREAM_CARD_* 约定)
const STREAM_CARD_OFFSET_BASE = 0.08;
const STREAM_CARD_OFFSET_STEP = 0.06;
const STREAM_CARD_DURATION = 0.65;

type CandidateStyle = 'faithful' | 'casual' | 'formal';

interface ScenarioCandidate {
  style: CandidateStyle;
  label: string;
  text: string;
}

interface ScenarioItem {
  key: string;
  platform: PlatformName;
  title: string;
  description: string;
  input: string;
  candidates: ReadonlyArray<ScenarioCandidate>;
}

interface ScenariosShowcaseProps {
  items: ReadonlyArray<ScenarioItem>;
}

export function ScenariosShowcase({ items }: ScenariosShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [advanceIndex, setAdvanceIndex] = useState(0);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<ScenarioPhase>('typing');
  const [inputProgress, setInputProgress] = useState(0);
  const [streamProgress, setStreamProgress] = useState(0);
  const [hasEnteredView, setHasEnteredView] = useState(false);

  const shownIndex = pinnedIndex ?? advanceIndex;
  const current = items[shownIndex] ?? items[0];

  useEffect(() => {
    if (hasEnteredView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHasEnteredView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setHasEnteredView(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasEnteredView]);

  // 切场景(pin / auto advance)时重置 phase 到 typing
  // biome-ignore lint/correctness/useExhaustiveDependencies: 仅 shownIndex 变化时重置
  useEffect(() => {
    setPhase('typing');
  }, [shownIndex]);

  useEffect(() => {
    if (!hasEnteredView || !current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      if (phase !== 'showing') setPhase('showing');
      if (pinnedIndex === null) {
        const t = window.setTimeout(() => setAdvanceIndex((i) => (i + 1) % items.length), 7000);
        return () => window.clearTimeout(t);
      }
      return;
    }

    const duration = PHASE_DURATION_MS[phase];
    const t = window.setTimeout(() => {
      if (phase === 'typing') {
        setPhase('streaming');
      } else if (phase === 'streaming') {
        setPhase('showing');
      } else {
        // showing 结束:未 pin 则 advance,pinned 则循环。
        if (pinnedIndex === null) {
          setAdvanceIndex((i) => (i + 1) % items.length);
        } else {
          setPhase('typing');
        }
      }
    }, duration);
    return () => window.clearTimeout(t);
  }, [hasEnteredView, phase, pinnedIndex, items.length, current]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputProgress 是起始锚点的陈旧快照
  useEffect(() => {
    if (phase !== 'typing') {
      setInputProgress(0);
      return;
    }
    if (!hasEnteredView) return;
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
  }, [phase, hasEnteredView]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: streamProgress 是起始锚点的陈旧快照
  useEffect(() => {
    if (phase !== 'streaming') {
      setStreamProgress(0);
      return;
    }
    if (!hasEnteredView) return;
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
  }, [phase, hasEnteredView]);

  if (!current) return null;

  // PlatformInputSkin 永远传 phase='typing':typing 阶段按 inputProgress 逐字;
  // streaming/showing 阶段 inputProgress 已 reset 但我们显示完整 input。
  const skinPhase: DemoPhase = 'typing';
  const displayedInput =
    phase === 'typing' ? sliceForStream(current.input, inputProgress) : current.input;

  const candidatesVisible = phase === 'streaming' || phase === 'showing';

  return (
    <div ref={ref} className={styles.scenariosShowcase}>
      <ol className={styles.scenarioList}>
        {items.map((item, i) => {
          const isActive = shownIndex === i;
          const pin = () => setPinnedIndex(i);
          // unpin 时 advance forward。否则 shownIndex 切回原 auto 场景会触发
          // [shownIndex] effect 把 phase reset 到 typing,用户感受是"看了一半
          // 的 auto 场景又从头开始"。advance 一步后回到一个新场景从头演化反而
          // 自然(用户本来就该看新东西)。
          const unpinAndAdvance = () => {
            setPinnedIndex(null);
            setAdvanceIndex((idx) => (idx + 1) % items.length);
          };
          return (
            // biome-ignore lint/a11y/noNoninteractiveTabindex: scenario tabs act like options;
            //   focus = pin (parity with mouse hover), blur = unpin & advance.
            <li
              key={item.key}
              className={[styles.scenarioListItem, isActive ? styles.scenarioListItemActive : '']
                .filter(Boolean)
                .join(' ')}
              tabIndex={0}
              onMouseEnter={pin}
              onMouseLeave={unpinAndAdvance}
              onFocus={pin}
              onBlur={unpinAndAdvance}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className={styles.scenarioListMark}>0{i + 1}</span>
              <h3 className={styles.scenarioListTitle}>{item.title}</h3>
              <p className={styles.scenarioListDesc}>{item.description}</p>
            </li>
          );
        })}
      </ol>
      <div className={styles.scenariosStage} aria-hidden="true">
        <PlatformInputSkin
          platform={current.platform}
          text={displayedInput}
          fullInput={current.input}
          phase={skinPhase}
          // scenarios 永远不进 accepted phase(stage 主角是 3 候选浮窗,不替换 input),
          // acceptedVersion 仅为满足 PlatformInputSkin 必传字段,固定 0 不影响任何 react key。
          acceptedVersion={0}
          caretClassName={styles.demoCaret}
        />
        <div
          className={styles.scenarioCandidates}
          data-visible={candidatesVisible ? 'true' : 'false'}
        >
          {current.candidates.map((cand, i) => {
            let visibleText = cand.text;
            if (phase === 'streaming') {
              const cardOffset = STREAM_CARD_OFFSET_BASE + i * STREAM_CARD_OFFSET_STEP;
              const cardProgress = Math.max(
                0,
                Math.min(1, (streamProgress - cardOffset) / STREAM_CARD_DURATION),
              );
              visibleText = sliceForStream(cand.text, cardProgress);
            }
            return (
              <div
                key={cand.style}
                className={styles.scenarioCandidate}
                style={{ transitionDelay: candidatesVisible ? `${i * 90}ms` : '0ms' }}
              >
                <span className={styles.scenarioCandidateIndex}>{i + 1}</span>
                <span className={styles.scenarioCandidateLabel}>{cand.label}</span>
                <span className={styles.scenarioCandidateText}>
                  {visibleText}
                  {phase === 'streaming' && visibleText.length < cand.text.length && (
                    <span style={{ visibility: 'hidden' }} aria-hidden="true">
                      {cand.text.slice(visibleText.length)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

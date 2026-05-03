'use client';

import type { CSSProperties, KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import styles from './HomePage.module.css';

type DemoCandidate = {
  style: 'faithful' | 'casual' | 'formal';
  label: string;
  text: string;
};

type DemoExample = {
  key: string;
  badge: string;
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

type DemoPhase = 'typing' | 'triggering' | 'streaming' | 'accepted';

const PHASE_DURATION_MS: Record<DemoPhase, number> = {
  typing: 1100,
  triggering: 720,
  streaming: 1500,
  accepted: 2600,
};

export function HomeRewriteDemo({ copy }: { copy: HomeRewriteDemoCopy }) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>('typing');
  const [isPaused, setIsPaused] = useState(false);
  const example = copy.examples[exampleIndex] ?? copy.examples[0];
  const exampleCount = copy.examples.length;
  const displayedText =
    phase === 'accepted'
      ? (example?.candidates[selectedIndex]?.text ?? example?.input ?? '')
      : (example?.input ?? '');
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

  function accept(index: number) {
    setSelectedIndex(index);
    setPhase('accepted');
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
        <span className={styles.demoDot} />
        <span className={styles.demoDot} />
        <span className={styles.demoDot} />
        <span>{copy.anyInput}</span>
      </div>

      <div className={styles.demoInputWrap}>
        <div className={styles.demoScenarioRow}>
          <span className={styles.demoScenarioBadge}>{example?.badge}</span>
          <span className={styles.demoScenarioCount}>
            {exampleIndex + 1}/{exampleCount}
          </span>
        </div>
        <div className={styles.demoMeta}>{statusText}</div>
        <div
          className={[
            styles.demoInput,
            phase === 'streaming' ? styles.demoInputStreaming : '',
            phase === 'accepted' ? styles.demoInputAccepted : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {displayedText}
        </div>
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
              <span className={styles.demoCandidateText}>{candidate.text}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.demoHint}>{copy.selectHint}</div>
    </section>
  );
}

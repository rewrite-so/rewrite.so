'use client';

import { useState } from 'react';
import styles from './HomePage.module.css';
import type { PlatformName } from './PlatformIcon.tsx';
import { PlatformInputSkin } from './PlatformSkin.tsx';

// 左侧 3 条场景列表 + 右侧静态演示。hover / focus 某条列表项即把右侧切到对应场景。
//
// 静态化(跨语言重定位 plan):去掉打字机 / 流式 rAF 动画 —— hero 的 HomeRewriteDemo
// 已是全页唯一动态演示,scenarios 这里只做「输入 + 3 候选」的静态对比,减少动机疲劳、
// 少跑一套 rAF。PlatformInputSkin 传 phase='typing' + 完整 input:渲染完整文本 +
// caret,不触发 streaming/accepted 的 skin modifier、不渲染撑高的 invisible spacer,
// 即静态完整态。

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
  // hover / focus 切换右侧;默认 0,离开不重置(sticky,避免焦点移开时闪回)。
  const [activeIndex, setActiveIndex] = useState(0);
  const current = items[activeIndex] ?? items[0];

  if (!current) return null;

  return (
    <div className={styles.scenariosShowcase}>
      <ol className={styles.scenarioList}>
        {items.map((item, i) => {
          const isActive = activeIndex === i;
          const show = () => setActiveIndex(i);
          // <li> 仅作 list-item 容器;真实交互在内层 <button>(hover/focus = 切换)。
          // h3/p 降为 span 因 HTML 规定 button 不能含 heading;视觉靠 CSS 复原。
          return (
            <li key={item.key} className={styles.scenarioListItem}>
              <button
                type="button"
                className={[
                  styles.scenarioListItemButton,
                  isActive ? styles.scenarioListItemActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={show}
                onFocus={show}
                aria-current={isActive ? 'true' : undefined}
              >
                <span className={styles.scenarioListMark}>0{i + 1}</span>
                <span className={styles.scenarioListTitle}>{item.title}</span>
                <span className={styles.scenarioListDesc}>{item.description}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className={styles.scenariosStage} aria-hidden="true">
        <PlatformInputSkin
          platform={current.platform}
          text={current.input}
          fullInput={current.input}
          phase="typing"
          acceptedVersion={0}
          caretClassName={styles.demoCaret}
        />
        <div className={styles.scenarioCandidates}>
          {current.candidates.map((cand, i) => (
            <div key={cand.style} className={styles.scenarioCandidate}>
              <span className={styles.scenarioCandidateIndex}>{i + 1}</span>
              <span className={styles.scenarioCandidateLabel}>{cand.label}</span>
              <span className={styles.scenarioCandidateText}>{cand.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

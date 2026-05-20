/**
 * 扩展端 user-behavior events sender —— content script(isolated world)用。
 *
 * - 队列攒事件,满 BATCH_SIZE 或 FLUSH_INTERVAL_MS 触发 flush,pagehide 兜底。
 * - flush 经 chrome.runtime.sendMessage({ type:'events:send' }) 交给 background SW
 *   代理 POST /v1/events —— content script 不能跨域且拿不到 .rewrite.so cookie。
 * - 每条事件统一附 install_id + site + page='/ext'(哨兵,绝不发第三方真实 URL) + locale。
 * - eventsEnabled=false → 整体 no-op(kill switch 由 /v1/me echo;服务端 EVENTS_DISABLED 仍兜底)。
 * - 逐事件预校验:/v1/events 是「单坏事件整批 400」语义,坏事件就地丢弃不入队。
 * - 容错硬契约:任何失败静默吞,绝不影响改写主流程(同 metrics.ts fire-and-forget)。
 */
import type { EventName, EventPayload, SiteLabel } from '@rewrite/shared';

const FLUSH_INTERVAL_MS = 5000;
// 远低于 /v1/events 的 MAX_EVENTS_PER_REQUEST(20);满即立即 flush。
const BATCH_SIZE = 10;
/** page 哨兵值 —— 扩展运行在第三方站点,绝不上报真实 URL。 */
const EXT_PAGE_SENTINEL = '/ext';

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const MAX_PROP_KEYS = 8;
const MAX_PROP_STRING_LEN = 50;

interface EventsConfig {
  installId: string;
  site: SiteLabel;
  locale: string;
}

let enabled = false;
let initialized = false;
let config: EventsConfig | null = null;
let queue: EventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 轻量预校验：键名格式 + 值类型/长度。镜像服务端 validateEventProps 的核心规则,
 * 坏事件就地丢弃,避免一条越界 prop 让整批 400。扩展事件 props 都是自有受控值,
 * 实际几乎不会命中 —— 这是面向未来 track() 误用的安全网。
 */
function propsAreValid(props: Record<string, string | number> | undefined): boolean {
  if (!props) return true;
  const keys = Object.keys(props);
  if (keys.length > MAX_PROP_KEYS) return false;
  for (const k of keys) {
    if (!KEY_RE.test(k)) return false;
    const v = props[k];
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return false;
    } else if (typeof v === 'string') {
      if (v.length > MAX_PROP_STRING_LEN) return false;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * 初始化 sender。在 inject.ts bootstrap 取到 installId + eventsEnabled 后调一次。
 * eventsEnabled=false → 整体 no-op。重复调用幂等(只认首次)。
 */
export function initEvents(opts: {
  installId: string;
  site: SiteLabel;
  locale: string;
  eventsEnabled: boolean;
}): void {
  if (initialized) return;
  initialized = true;
  config = { installId: opts.installId, site: opts.site, locale: opts.locale };
  enabled = opts.eventsEnabled;
  if (!enabled) return;
  // pagehide 时 best-effort flush 最后一批。注意:经 SW 代理(非 navigator.sendBeacon),
  // 页面销毁极快时 sendMessage 可能来不及投递 → 最后一批丢失。telemetry 可接受。
  window.addEventListener('pagehide', () => flush());
}

/** 入队一条扩展事件。enabled=false / 未 init / 预校验失败 → no-op。 */
export function trackEvent(name: EventName, props?: Record<string, string | number>): void {
  if (!enabled || !config) return;
  if (!propsAreValid(props)) return;
  queue.push({
    name,
    ts: Date.now(),
    page: EXT_PAGE_SENTINEL,
    locale: config.locale,
    install_id: config.installId,
    site: config.site,
    ...(props ? { props } : {}),
  });
  if (queue.length >= BATCH_SIZE) {
    flush();
    return;
  }
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }
}

/** 把当前队列交给 background SW 代理发送。错误静默吞。 */
export function flush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  try {
    chrome.runtime.sendMessage({ type: 'events:send', events }, () => {
      // 读 lastError 抑制 "Unchecked runtime.lastError" 噪音;失败即丢弃。
      void chrome.runtime.lastError;
    });
  } catch {
    // SW 不可用 / 扩展 context 失效 —— 静默丢弃。
  }
}

/** Test-only: 重置模块状态,供单测逐用例隔离。 */
export function __resetForTests(): void {
  enabled = false;
  initialized = false;
  config = null;
  queue = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

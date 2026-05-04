import type { Style } from './styles.ts';

/**
 * 服务端 → 客户端 SSE 帧格式。
 * 每帧 `data` 必须**整行 JSON.parse**：上游 chunk 含换行须转义为 \n。
 * 一路 error 不影响另两路 done；end 帧最后发送（关闭客户端 ReadableStream）。
 */
export type SSEEvent =
  | { event: 'meta'; data: MetaData }
  | { event: 'delta'; data: DeltaData }
  | { event: 'done'; data: DoneData }
  | { event: 'error'; data: ErrorData }
  | { event: 'end'; data: EndData };

export interface MetaData {
  requestId: string;
  streams: Style[];
  langDetected: string;
  /**
   * 浮窗状态信息（用户感知层）。客户端 panel.setStatus 消费决定显示
   * BYOK badge / quota chip / signin footer / 超配额 CTA 文案。
   * 老服务端可能不发——客户端必须容忍 undefined。
   */
  status?: MetaStatus;
}

export interface MetaStatus {
  /** 是否登录用户（false = anonymous IP/install） */
  authed: boolean;
  /** anonymous_ip / anonymous_install / free / pro */
  tier: 'anonymous_ip' | 'anonymous_install' | 'free' | 'pro';
  /** 是否使用 BYOK（已登录 + byok_keys 表有行） */
  isBYOK: boolean;
  /** 已用配额（已含本次 +1）。BYOK 模式下省略。 */
  used?: number;
  /** 月配额上限。BYOK 模式下省略（无限）。 */
  limit?: number;
  /**
   * 登录用户在 user_settings 里存的 target_lang（'auto' / BCP-47 / 自定义自然语言）。
   * 扩展端 mount 收到后写回 chrome.storage 实现 web ↔ extension 实时同步——
   * 用户在 web /settings 改语言后，下一次扩展改写就立即同步过去（不必等 30s
   * visibilitychange 节流的 fetchCloudPrefs）。匿名用户省略此字段。
   */
  userTargetLang?: string;
}

export interface DeltaData {
  style: Style;
  text: string;
  seq: number;
}

export interface DoneData {
  style: Style;
  finalText: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface ErrorData {
  style: Style | null; // null 表示整路 error（如鉴权失败）
  code: ErrorCode;
  message?: string;
}

export interface EndData {
  requestId: string;
}

export type ErrorCode =
  | 'rate_limit'
  | 'quota_exceeded'
  | 'invalid_input'
  | 'input_too_long'
  | 'upstream_timeout'
  | 'upstream_error'
  | 'unauthorized'
  | 'turnstile_failed'
  | 'internal_error';

/** 把单帧编码为 SSE wire format 字节串。 */
export function encodeSSEFrame(event: SSEEvent): string {
  const json = JSON.stringify(event.data);
  // 单行 JSON：JSON.stringify 默认不会产生未转义换行。但保险：扫一遍。
  if (json.includes('\n')) {
    throw new Error('SSE data must be single-line; sanitize upstream content');
  }
  return `event: ${event.event}\ndata: ${json}\n\n`;
}

/** 解析单个 SSE 帧文本（不带 `\n\n` 终止符）。无效则抛错。 */
export function parseSSEFrame(raw: string): SSEEvent {
  const lines = raw.split('\n');
  let eventName: string | null = null;
  let dataStr = '';
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataStr += line.slice('data:'.length).trim();
    }
  }
  if (!eventName) throw new Error('SSE frame missing event:');
  if (!dataStr) throw new Error('SSE frame missing data:');
  const data = JSON.parse(dataStr);
  return { event: eventName, data } as SSEEvent;
}

/**
 * 流式解析器：把 ReadableStream<Uint8Array> 转成 AsyncIterable<SSEEvent>。
 * 帧分隔符为 "\n\n"。
 */
export async function* parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncIterable<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const raw = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        if (raw.trim()) {
          yield parseSSEFrame(raw);
        }
        sepIdx = buffer.indexOf('\n\n');
      }
    }
    // flush 残留
    buffer += decoder.decode();
    if (buffer.trim()) {
      yield parseSSEFrame(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

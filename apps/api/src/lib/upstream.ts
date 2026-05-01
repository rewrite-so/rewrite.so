import type { ChatMessage } from '@rewrite/prompts';

/**
 * 严格 OpenAI Chat Completions 客户端。
 *
 * 协议契约（CLAUDE.md 已记录）：
 * - 仅认 `choices[0].delta.content`
 * - 不为 vendor 自创字段做兼容层；BYOK 用户自担
 * - 必须支持 AbortSignal 链式：客户端断开时立即取消上游 fetch
 */

export interface UpstreamConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class UpstreamError extends Error {
  constructor(
    public code: 'timeout' | 'http' | 'protocol' | 'aborted',
    public status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

const DONE_MARKER = '[DONE]';

/**
 * 流式调用上游，逐 chunk 产出 content delta（去掉 SSE 包装）。
 * AbortSignal 取消时抛 UpstreamError('aborted')。
 */
export async function* streamCompletion(
  config: UpstreamConfig,
  messages: ChatMessage[],
  signal: AbortSignal,
): AsyncIterable<string> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new UpstreamError('aborted', null, 'request aborted');
    }
    throw new UpstreamError('http', null, (err as Error).message);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new UpstreamError('http', res.status, `upstream ${res.status}: ${detail.slice(0, 500)}`);
  }
  if (!res.body) {
    throw new UpstreamError('protocol', null, 'empty body');
  }

  const reader = res.body.getReader();
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
        const delta = parseSSEDataLine(raw);
        if (delta === DONE_MARKER) return;
        if (delta != null) yield delta;
        sepIdx = buffer.indexOf('\n\n');
      }
    }
    // flush 残留
    buffer += decoder.decode();
    if (buffer.trim()) {
      const delta = parseSSEDataLine(buffer);
      if (delta != null && delta !== DONE_MARKER) yield delta;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new UpstreamError('aborted', null, 'stream aborted');
    }
    throw err;
  } finally {
    reader.releaseLock();
  }
}

/**
 * 从一段 SSE 帧文本中提取 `data:` 行后的内容（去掉 `data: ` 前缀）。
 * 严格按 OpenAI Chat Completions 格式：
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 * 提取 choices[0].delta.content；其它字段忽略。
 *
 * 返回值：
 *   - string: content delta（可能空字符串，表示这一帧无文本）
 *   - '[DONE]': 终止标记
 *   - null: 无 data 行 / 解析失败 / content 不存在
 */
function parseSSEDataLine(raw: string): string | null {
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (payload === DONE_MARKER) return DONE_MARKER;
    try {
      const obj = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
      const content = obj.choices?.[0]?.delta?.content;
      // OpenAI 协议：第一帧通常是 role 而非 content；content 可能 undefined
      return typeof content === 'string' ? content : null;
    } catch {
      return null;
    }
  }
  return null;
}

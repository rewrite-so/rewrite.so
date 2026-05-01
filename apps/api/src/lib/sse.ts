import { type ErrorCode, encodeSSEFrame, type Style } from '@rewrite/shared';

/**
 * SSE 多路复用：
 * 把 N 个上游 content delta 流（每个标着一个 style）合并成单个 SSE 字节流。
 *
 * 协议（CLAUDE.md 已记录）：
 * - 一路 error 不影响其他路完成
 * - end 帧最后发送
 * - AbortSignal 中断时立即停止 enqueue 并 close
 */

export interface MuxInputStream {
  style: Style;
  iter: AsyncIterable<string>;
}

export interface MuxOptions {
  streams: MuxInputStream[];
  requestId: string;
  langDetected: string;
}

export function muxToSSE(opts: MuxOptions, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const styles = opts.streams.map((s) => s.style);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const enqueue = (s: string) => {
        if (closed || signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true;
        }
      };

      // meta
      enqueue(
        encodeSSEFrame({
          event: 'meta',
          data: { requestId: opts.requestId, streams: styles, langDetected: opts.langDetected },
        }),
      );

      // 一路完成时累积 final text
      const onAbort = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });

      const workers = opts.streams.map(async ({ style, iter }) => {
        let final = '';
        let seq = 0;
        try {
          for await (const text of iter) {
            if (closed || signal.aborted) return;
            if (!text) continue;
            seq++;
            final += text;
            enqueue(encodeSSEFrame({ event: 'delta', data: { style, text, seq } }));
          }
          enqueue(encodeSSEFrame({ event: 'done', data: { style, finalText: final } }));
        } catch (err) {
          const code = classifyError(err);
          enqueue(
            encodeSSEFrame({
              event: 'error',
              data: { style, code, message: (err as Error).message?.slice(0, 200) },
            }),
          );
        }
      });

      await Promise.allSettled(workers);

      if (!closed && !signal.aborted) {
        enqueue(encodeSSEFrame({ event: 'end', data: { requestId: opts.requestId } }));
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
      signal.removeEventListener('abort', onAbort);
    },
    cancel() {
      // 客户端断开 → ReadableStream cancel；上游 abort 由调用方传入的 signal 控制
    },
  });
}

function classifyError(err: unknown): ErrorCode {
  const e = err as { name?: string; code?: string; status?: number };
  if (e.name === 'UpstreamError' && e.code === 'aborted') return 'upstream_error';
  if (e.name === 'UpstreamError' && e.code === 'timeout') return 'upstream_timeout';
  if (e.status && e.status >= 500) return 'upstream_error';
  if (e.status === 401 || e.status === 403) return 'unauthorized';
  return 'upstream_error';
}

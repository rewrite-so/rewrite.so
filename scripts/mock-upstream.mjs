#!/usr/bin/env node
/**
 * 本地 mock upstream：模拟 OpenAI 兼容 Chat Completions endpoint。
 *
 * 用途：在用户尚未提供真实 OPENAI_API_KEY 前，跑通端到端流程。
 *
 * 启动：
 *   node scripts/mock-upstream.mjs
 *
 * 端点：http://localhost:9999/v1/chat/completions
 *
 * 行为：根据请求 system prompt 中的 STYLE 标记返回不同风格的固定文本，
 *      逐字符流式返回，模拟真实 SSE。
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 9999);

/** 风格 → 模板（仅给 demo，无真实 LLM 输出语义） */
const TEMPLATES = {
  faithful: {
    en: 'Hi, can you tell me when the meeting is tomorrow? I need to prepare some slides before that.',
    zh: '今天天气真好，适合出去走走。',
  },
  casual: {
    en: "Hey, when's the meeting tomorrow? Gotta prep some slides first.",
    zh: '今儿天气挺好，出去溜达溜达正合适。',
  },
  formal: {
    en: 'Could you advise the time of tomorrow\'s meeting? I will need to prepare materials beforehand.',
    zh: '今日天气宜人，适合外出散步。',
  },
};

function detectStyle(systemContent) {
  const sys = systemContent.toUpperCase();
  if (sys.includes('FAITHFUL') || sys.includes('贴近原文')) return 'faithful';
  if (sys.includes('CASUAL') || sys.includes('口语')) return 'casual';
  if (sys.includes('FORMAL') || sys.includes('正式')) return 'formal';
  return 'faithful';
}

function detectLang(systemContent) {
  // system prompt 包含 `target language is "xx"`
  const m = /target language is "([a-zA-Z-]+)"/i.exec(systemContent);
  if (!m) return 'en';
  const tag = m[1].toLowerCase();
  return tag.startsWith('zh') ? 'zh' : 'en';
}

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.includes('chat/completions')) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk.toString();

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('bad json');
    return;
  }

  const sys = payload.messages?.find((m) => m.role === 'system')?.content ?? '';
  const style = detectStyle(sys);
  const lang = detectLang(sys);
  const text = TEMPLATES[style][lang];

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  let aborted = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      aborted = true;
      console.log('[mock-upstream] client aborted');
    }
  });

  // 第一帧：role
  res.write(
    `data: ${JSON.stringify({
      id: 'mock-1',
      choices: [{ delta: { role: 'assistant' }, index: 0 }],
    })}\n\n`,
  );

  // 逐字符流式
  for (const ch of text) {
    if (aborted) return;
    res.write(
      `data: ${JSON.stringify({
        id: 'mock-1',
        choices: [{ delta: { content: ch }, index: 0 }],
      })}\n\n`,
    );
    await new Promise((r) => setTimeout(r, 12));
  }

  if (aborted) return;
  res.write('data: [DONE]\n\n');
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-upstream] listening on http://127.0.0.1:${PORT}/v1/chat/completions`);
  console.log(
    `[mock-upstream] set OPENAI_BASE_URL=http://127.0.0.1:${PORT}/v1 in apps/api/.dev.vars`,
  );
});

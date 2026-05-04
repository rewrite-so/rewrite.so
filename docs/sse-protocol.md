# SSE wire protocol — `POST /v1/rewrite`

The single endpoint the entire product hangs on. It accepts one user input
and streams back **three** style variants concurrently as a single SSE
response.

## Request

```http
POST /v1/rewrite HTTP/1.1
Content-Type: application/json
Cookie: better-auth.session_token=...    (optional — anonymous OK)

{
  "text": "your input text here",
  "styles": ["faithful", "casual", "formal"],
  "lang": "en" | "zh-CN" | "auto",
  "hasSelection": false,
  "context": "optional surrounding text",
  "installId": "extension-only random uuid",
  "turnstileToken": "..."   (web /try only, anonymous calls)
}
```

- `text` — must be ≤ 4000 characters (server returns 413 otherwise).
- `styles` — initial requests send exactly the 3 fixed values: `faithful`, `casual`, `formal`; single-card regenerate may send 1 style. The product contract is "never show a fourth candidate."
- `lang` — preferred target language, or `'auto'` to let the server decide from page lang / user pref / Unicode heuristics.
- `installId` — required for unsigned extension users (so per-install quota counters work).
- `turnstileToken` — required for anonymous web `/try` calls only when `TURNSTILE_SECRET` is configured. Signed-in users and extension requests do not need it.

## Response

`text/event-stream` with the following events, in roughly this order. **Each `data:` line is one complete JSON object, never split across lines.** If a vendor token contains a literal newline, the server escapes it to `\n` before emitting.

### `event: meta` — first frame

```
event: meta
data: {"requestId":"abc-123","streams":["faithful","casual","formal"],"langDetected":"zh-CN"}
```

### `event: delta` — character-by-character, multiplexed across all 3 styles

```
event: delta
data: {"style":"faithful","text":"今天","seq":1}

event: delta
data: {"style":"casual","text":"今儿","seq":1}

event: delta
data: {"style":"formal","text":"今日","seq":1}

event: delta
data: {"style":"faithful","text":"天气","seq":2}
...
```

The 3 streams are **interleaved arbitrarily**. The client must demux by `style` and accumulate per-style.

### `event: done` — one per style as it finishes

```
event: done
data: {"style":"casual","finalText":"今儿天气真不错","tokensIn":42,"tokensOut":18}
```

### `event: error` — per-style failure (the other two streams continue)

```
event: error
data: {"style":"formal","code":"upstream_timeout"}
```

### `event: end` — once all 3 styles have either `done` or `error`

```
event: end
data: {"requestId":"abc-123"}
```

After `end`, the connection closes.

## Critical invariants

These are tested in `apps/api/src/lib/sse.test.ts`:

1. **One style failing must not abort the other two.** A single 502 from upstream for `formal` cannot stop `faithful` and `casual` from completing.
2. **Client abort must cascade to upstream.** When the browser disconnects (Esc, tab close, network drop), the Worker must abort all 3 outbound `fetch()` calls within ~100ms. Otherwise we burn tokens.
3. **One frame per JSON object.** The client splits on newline and `JSON.parse` each. Vendor tokens with literal `\n` are escaped to `\n` (string) before emitting.

## Upstream protocol

The Worker translates each candidate to a **strict OpenAI Chat Completions
SSE** request. Only `choices[0].delta.content` is consumed — no
vendor-specific extensions are tolerated. BYOK users using a
non-conformant provider are on their own.

## Why server-side multiplexing instead of 3 separate fetches?

- One TLS handshake instead of three.
- One auth check, one quota debit, one rate-limit consume.
- Coordinated abort (the Worker can cancel all 3 upstream when the client disconnects).
- A natural place to apply the "1 client request = 1 quota unit" rule.

## Client implementation reference

- Web/extension transport: `packages/core/src/transport/api-client.ts`.
- SSE parser: `packages/shared/src/sse-frame.ts`.
- Server multiplexer: `apps/api/src/lib/sse.ts`.
- Tests: `apps/api/src/lib/sse.test.ts` (5 tests covering interleaving, error isolation, and abort cascade).

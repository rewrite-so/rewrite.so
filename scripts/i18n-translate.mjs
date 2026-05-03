#!/usr/bin/env node
// LLM-assisted incremental translator for packages/shared/src/messages.
//
// Idempotent: a per-locale `messages/{locale}.cache.json` records the source
// (en) hash for every translated key. A locale's key is regenerated only if:
//   - it's missing in {locale}.json, OR
//   - the source hash differs from cache.
// This means changing one English key only retranslates that key; stable keys
// are never overwritten — so manual native-speaker edits stick.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... node scripts/i18n-translate.mjs ja
//   ANTHROPIC_API_KEY=sk-... node scripts/i18n-translate.mjs --all
//   node scripts/i18n-translate.mjs --dry-run ja  # report only, no API call
//
// Cache file: packages/shared/src/messages/{locale}.cache.json
//   { "<dot.path.key>": "<sha1 of en value>" }
//
// We don't do any clever batching — one prompt per missing key. Cheap and
// keeps prompt-injection surface tiny.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MSG_DIR = join(__dirname, '..', 'packages', 'shared', 'src', 'messages');

const SOURCE = 'en';
const TARGETS = ['zh-CN', 'ja', 'ko', 'es', 'fr', 'de'];

const ANTHROPIC_MODEL = process.env.I18N_TRANSLATION_MODEL || 'claude-sonnet-4-6';

const LOCALE_NAME = {
  'zh-CN': 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const positional = args.filter((a) => !a.startsWith('--'));

let locales;
if (all) {
  locales = TARGETS;
} else if (positional.length) {
  locales = positional;
} else {
  console.error('Usage: i18n-translate.mjs <locale> [...] | --all  [--dry-run]');
  process.exit(2);
}

for (const locale of locales) {
  if (!TARGETS.includes(locale)) {
    console.error(`Unknown target locale: ${locale}. Valid: ${TARGETS.join(', ')}`);
    process.exit(2);
  }
}

if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required (or pass --dry-run).');
  process.exit(2);
}

function sha1(s) {
  return createHash('sha1').update(s).digest('hex');
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, path));
    } else {
      out[path] = v;
    }
  }
  return out;
}

function setDeep(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function loadJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, obj) {
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
}

async function llmTranslate(value, targetLocale) {
  const targetName = LOCALE_NAME[targetLocale];
  const prompt = `Translate the following English UI string from rewrite.so (a privacy-first AI text rewriting tool) into ${targetName}.

Constraints:
- Preserve any HTML tags exactly: <kbd>, <strong>, <em>, <code>, <a>, etc. Do not translate tag names.
- Preserve any ICU placeholders exactly: {count}, {name}, {date}, etc.
- Preserve any literal product names exactly: rewrite.so, OpenAI, Anthropic, GitHub, Cloudflare, Creem, Slack, Discord, Reddit, Twitter, Apache 2.0, BYOK.
- Preserve emoji and special characters (·, →, ↗, ✓).
- Output ONLY the translation. No quotes around it. No prefix. No explanation.

English source:
${value}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string' || !text) {
    throw new Error(`Anthropic API returned empty content: ${JSON.stringify(data)}`);
  }
  return text.trim();
}

const sourceJson = loadJson(join(MSG_DIR, `${SOURCE}.json`));
const sourceFlat = flatten(sourceJson);

let totalTranslated = 0;
let totalSkipped = 0;

for (const locale of locales) {
  const targetFile = join(MSG_DIR, `${locale}.json`);
  const cacheFile = join(MSG_DIR, `${locale}.cache.json`);
  const existing = existsSync(targetFile) ? loadJson(targetFile) : {};
  const existingFlat = flatten(existing);
  const cache = existsSync(cacheFile) ? loadJson(cacheFile) : {};

  const toTranslate = [];
  for (const [key, value] of Object.entries(sourceFlat)) {
    const srcHash = sha1(String(value));
    const cachedHash = cache[key];
    const hasTranslation = key in existingFlat;
    if (hasTranslation && cachedHash === srcHash) {
      continue; // up-to-date
    }
    toTranslate.push({ key, value, hasTranslation, cachedHash, srcHash });
  }

  console.log(`\n[${locale}] ${toTranslate.length} key(s) to translate (of ${Object.keys(sourceFlat).length} total)`);

  if (dryRun) {
    for (const t of toTranslate) {
      const reason = !t.hasTranslation ? 'missing' : t.cachedHash ? 'source changed' : 'no cache';
      console.log(`  [${reason}] ${t.key}`);
    }
    totalSkipped += toTranslate.length;
    continue;
  }

  const out = JSON.parse(JSON.stringify(existing));
  const newCache = { ...cache };

  for (const t of toTranslate) {
    process.stdout.write(`  → ${t.key} ... `);
    try {
      const translated = await llmTranslate(t.value, locale);
      setDeep(out, t.key, translated);
      newCache[t.key] = t.srcHash;
      totalTranslated++;
      console.log('ok');
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
  }

  writeJson(targetFile, out);
  writeJson(cacheFile, newCache);
}

console.log(`\nDone. Translated: ${totalTranslated}; would-translate (dry-run): ${totalSkipped}`);

#!/usr/bin/env node
// 校验 packages/shared/src/messages/{locale}.json 的 key 集合一致。
// 用法：node scripts/i18n-validate.mjs
// 退出码：0 = 一致；1 = 有 locale 缺/多 key 或值不为非空字符串。
//
// 严格规则：
// - 所有 7 个 locale 的 key 集合必须完全一致（en 是 source of truth）
// - 所有值必须是非空字符串（嵌套对象只在中间，叶子不能是 null/对象/空串）
//
// CI 接入：在 PR 工作流里跑 `node scripts/i18n-validate.mjs`，非 0 退出即 fail。

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MSG_DIR = join(__dirname, '..', 'packages', 'shared', 'src', 'messages');

const SOURCE = 'en';

function flattenKeys(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenKeys(v, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

function walkValues(obj, visit, prefix = '') {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      walkValues(v, visit, path);
    } else {
      visit(path, v);
    }
  }
}

function loadCatalog(file) {
  const raw = readFileSync(join(MSG_DIR, file), 'utf8');
  return JSON.parse(raw);
}

// `*.cache.json` siblings are written by scripts/i18n-translate.mjs (sha1 of
// en values) and are intentionally a key subset — they're not locale catalogs.
const files = readdirSync(MSG_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.cache.json'));
if (!files.includes(`${SOURCE}.json`)) {
  console.error(`[i18n-validate] missing source ${SOURCE}.json in ${MSG_DIR}`);
  process.exit(1);
}

const sourceKeys = flattenKeys(loadCatalog(`${SOURCE}.json`));
let failed = false;

for (const file of files) {
  const locale = file.replace(/\.json$/, '');
  const cat = loadCatalog(file);
  const keys = flattenKeys(cat);

  if (locale !== SOURCE) {
    const missing = sourceKeys.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !sourceKeys.includes(k));
    if (missing.length) {
      console.error(`[i18n-validate] ${locale}: missing ${missing.length} key(s):`);
      for (const k of missing) console.error(`  - ${k}`);
      failed = true;
    }
    if (extra.length) {
      console.error(`[i18n-validate] ${locale}: extra ${extra.length} key(s) not in en:`);
      for (const k of extra) console.error(`  + ${k}`);
      failed = true;
    }
  }

  walkValues(cat, (path, v) => {
    if (typeof v !== 'string') {
      console.error(`[i18n-validate] ${locale}.${path}: leaf must be string, got ${typeof v}`);
      failed = true;
    } else if (v === '') {
      console.error(`[i18n-validate] ${locale}.${path}: empty string`);
      failed = true;
    }
  });
}

if (failed) {
  console.error('\n[i18n-validate] FAILED');
  process.exit(1);
}
console.log(`[i18n-validate] OK · ${files.length} locale(s) · ${sourceKeys.length} key(s)`);

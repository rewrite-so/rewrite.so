import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'rewrite.so — 双击 Shift 即时改写',
  version: pkg.version,
  description: '在任何网页输入框双击 Shift，立刻拿到 3 种风格的 AI 改写。',
  // 图标资产占位（Phase 5 替换为实际 PNG 16/32/48/128）
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'rewrite.so',
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    // 1) sentinel：仅在 rewrite.so 自家域跑，document_start 最早注入，让 web 端
    //    /try 检测到扩展存在并跳过自己的 mount，避免双 mount 撞车
    //    （双 keydown listener、双配额扣减、双浮层重叠）
    {
      matches: [
        'https://rewrite.so/*',
        'https://*.rewrite.so/*',
        'http://localhost:3000/*',
        'http://127.0.0.1:3000/*',
      ],
      js: ['src/content/sentinel.ts'],
      run_at: 'document_start',
      all_frames: false,
    },
    // 2) 主流程 inject：所有域（含 rewrite.so 自家域）都跑完整 mount。
    //    `<all_urls>` 含 rewrite.so —— 配合上面 sentinel 让 /try 端跳过自己 mount，
    //    扩展 inject 这一份成为唯一 mount 实例。
    //    历史教训：之前 exclude_matches 把 rewrite.so 排掉了，
    //    结果 /try 的 web 端跳过 mount + 扩展也不跑 → 双方都不 mount，浮窗死活不弹。
    {
      matches: ['<all_urls>'],
      js: ['src/content/inject.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  permissions: ['activeTab', 'storage'],
  host_permissions: [
    'https://api.rewrite.so/*',
    // 开发期 wrangler dev
    'http://localhost:8787/*',
    'http://127.0.0.1:8787/*',
  ],
});

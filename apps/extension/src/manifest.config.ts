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
    // 扩展不在 rewrite.so 自家域工作 —— /try 用 web 自带 mount 演示，
    // 设置类页面（/settings, /billing 等）不需要双击 Shift 改写
    {
      matches: ['<all_urls>'],
      exclude_matches: [
        'https://rewrite.so/*',
        'https://*.rewrite.so/*',
        'http://localhost:3000/*',
        'http://127.0.0.1:3000/*',
      ],
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

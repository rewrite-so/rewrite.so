import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

declare const process: { env?: { NODE_ENV?: string } };

const isProduction = process.env?.NODE_ENV === 'production';

// 开发期 wrangler dev API endpoint，生产包不带（Chrome 商店最小权限审查）。
const devHostPermissions = ['http://localhost:8787/*', 'http://127.0.0.1:8787/*'];

export default defineManifest({
  manifest_version: 3,
  name: 'rewrite.so — Write freely. Send confidently.',
  version: pkg.version,
  description:
    'Write freely. Send confidently. Three AI rewrites — faithful, casual, formal — in any supported text field.',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'rewrite.so',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    // 扩展不在 rewrite.so 自家域工作 —— /try 用 web 自带 mount 演示，
    // 设置类页面（/settings, /billing 等）不需要双击 Shift 改写。
    // localhost:3000 永远 exclude（不仅 dev）：prod 用户在本地跑 rewrite.so
    // dev server 时也不应有双 mount 冲突；exclude_matches 不需要 host_permissions
    // 也不影响 Chrome 商店审查。
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
  permissions: ['storage'],
  host_permissions: [
    'https://api.rewrite.so/*',
    // 开发期 wrangler dev。生产包不带 localhost host_permissions，满足商店最小权限审查。
    ...(isProduction ? [] : devHostPermissions),
  ],
});

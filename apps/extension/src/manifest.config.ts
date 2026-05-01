import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'rewrite.so — 双击 Shift 即时改写',
  version: pkg.version,
  description: '在任何网页输入框双击 Shift，立刻拿到 3 种风格的 AI 改写。',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: 'icons/icon-32.png',
    default_title: 'rewrite.so',
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  permissions: ['activeTab', 'storage'],
  host_permissions: ['https://api.rewrite.so/*'],
});

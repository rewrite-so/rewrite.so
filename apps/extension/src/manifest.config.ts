import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

declare const process: { env?: { NODE_ENV?: string; EXT_STORE_BUILD?: string } };

const isProduction = process.env?.NODE_ENV === 'production';
// 任何走 vite build 的扩展构建（pnpm build / pnpm package / CI）默认注入 dev key，
// 让本地 unpacked 安装拿到稳定 ID 用于联调/测试。store 上架必须显式置 EXT_STORE_BUILD=1
// 跳过 key 注入，让 Chrome Web Store 沿用 publisher key（上架 ID 不变）。release workflow
// `.github/workflows/release-extension.yml` 已配置该 env；手动上架才需要本地显式 export。
const isStoreBuild = process.env?.EXT_STORE_BUILD === '1';

// 开发期 wrangler dev API endpoint，生产包不带（Chrome 商店最小权限审查）。
const devHostPermissions = ['http://localhost:8787/*', 'http://127.0.0.1:8787/*'];

// dev public key（DER, base64）。对应 ID: nfjhbfpolpfddniebgjnfpmndpcpaadg
// 私钥见 apps/extension/.dev-keys/dev.pem（不入仓库；丢失需重新生成 key + 更新这里 +
// 更新 wrangler.toml 的 EXTENSION_ALLOWED_ORIGINS）。
const DEV_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoDF7P+J2Nz5oBuRzHO6MUGwYkg1EQ4GmuCzgyOQ9LN9SOF4lONdgCSB54CMlP2wI8iiglzXvZoy0SBtm5TudxncVxbtUpcD68hXAba43TELKFiv1+EwuaGW0hGJJddUBZkaPx2AXQtsfa/LCaI/fWPAkwQtjw26gcfM0kZiq5MoC+QP5Sy/G/1+eovuGNz0Gs3iiB/eodQUihkmSH+9AitO5vSAPbCJPjv+pHIbVLbkv8a4y8Vbykh0A+YryQG3IG5Z04cKdkOOOx0WBrN0jU6w5oOyIIqFxcDbYq3s8TsB3JhL/ltkJtfT6V2vZU543msg+ZAvgGZ0Nre/IUQ8IOwIDAQAB';

export default defineManifest({
  manifest_version: 3,
  // Chrome 102 是 `world: 'MAIN'` content_script 字段的最低支持版本（2022/6）。
  // 低于此版本会静默忽略 main-world entry → Draft.js (X/Twitter) 适配失效
  // (requestDraftReplace 永远 timeout)。Chrome Web Store 会按此过滤老版本。
  minimum_chrome_version: '102',
  ...(isStoreBuild ? {} : { key: DEV_PUBLIC_KEY }),
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
    // Main-world helper：跑在页面 JS context（isolated world 之外），用于
    // 访问 React fiber expando 属性（__reactFiber$xxx）。**只**处理 Draft.js
    // 编辑器替换（X/Twitter / 老 Medium），监听 CustomEvent 与 inject.ts 通信。
    // 详见 apps/extension/src/content/main-world.ts 头注释。
    // exclude_matches 与上面 inject.ts 完全一致（同样不在 rewrite.so 自家域跑）。
    {
      matches: ['<all_urls>'],
      exclude_matches: [
        'https://rewrite.so/*',
        'https://*.rewrite.so/*',
        'http://localhost:3000/*',
        'http://127.0.0.1:3000/*',
      ],
      js: ['src/content/main-world.ts'],
      world: 'MAIN',
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

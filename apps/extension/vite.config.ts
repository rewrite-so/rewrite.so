import path from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import manifest from './src/manifest.config.ts';

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  resolve: {
    alias: {
      // popup/options 用 React API 时 alias 到 preact/compat（content script 不引框架）
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react/jsx-runtime': 'preact/jsx-runtime',
      // workspace 包源码直链（CRXJS 不预构建）
      '@rewrite/core': path.resolve(__dirname, '../../packages/core/src'),
      '@rewrite/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  optimizeDeps: {
    // 关键：让 CRXJS 看到 workspace 包源码而非预构建产物
    exclude: ['@rewrite/core', '@rewrite/shared'],
  },
  build: {
    target: 'chrome120',
    // 'hidden' 仍生成 .map 文件，但不在 JS 末尾加 `//# sourceMappingURL=` 注释。
    // CRXJS 用 IIFE 包装单行 content script 时，sourceMappingURL 注释会和 IIFE
    // 闭合 `})()` 挤到同一行 —— `//` 把闭合也注释掉，引发 "Unexpected end of input"。
    // 'hidden' 避开这个 bug。开发时如需调试可临时改回 true。
    sourcemap: 'hidden',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});

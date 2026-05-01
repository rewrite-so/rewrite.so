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
    sourcemap: true,
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});

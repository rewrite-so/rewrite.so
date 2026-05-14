import { defineConfig } from 'vitest/config';

// 与 packages/core 一致：happy-dom 环境，让 main-world.ts 等含 window/document
// 访问的 content-script 模块能在 unit test 中被 import + 测内部函数。
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
});

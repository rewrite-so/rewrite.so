import { defineConfig } from 'vitest/config';

// web app 当前没有 React 组件级测试基础设施（不引入 RTL/jsdom），
// 只覆盖纯函数 / 工具模块。组件交互依赖手动验证或未来引入 RTL 时统一加。
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
});

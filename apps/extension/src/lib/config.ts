/**
 * 扩展全局配置。dev / prod 通过 vite 环境变量切换。
 *
 * background SW、popup、options 都会用到这里的值；不要在 content script
 * 里直接用（content script 的 fetch 必须经 background SW 代理）。
 */

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787';

/** Web 前端地址，用于跳转登录 / 设置等。dev: localhost:3000, prod: rewrite.so */
export const WEB_BASE =
  (import.meta.env.VITE_WEB_BASE as string | undefined) ?? 'http://localhost:3000';

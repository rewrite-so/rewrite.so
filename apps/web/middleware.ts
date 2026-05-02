import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing.ts';

export default createMiddleware(routing);

export const config = {
  // 排除 API 代理（/v1, /api/auth）、Next 内部路径、含点号的静态资源
  matcher: ['/((?!_next|_vercel|api|v1|.*\\..*).*)'],
};

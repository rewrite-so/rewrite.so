/** @type {import('next').NextConfig} */
const apiBase = process.env.API_BASE_URL ?? 'http://localhost:8787';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // 把 API 调用 same-origin 代理到 wrangler/Workers，
  // 这样 better-auth 的 session cookie 是 web origin 的，无需跨域。
  rewrites: async () => [
    { source: '/api/auth/:path*', destination: `${apiBase}/api/auth/:path*` },
    { source: '/v1/:path*', destination: `${apiBase}/v1/:path*` },
  ],
};

export default nextConfig;

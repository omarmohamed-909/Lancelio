import type { NextConfig } from 'next';

// Rewrites keep the browser session on the frontend origin. This value is
// server-only; the browser uses NEXT_PUBLIC_API_URL=/api/v1 in production.
const upstream = process.env.API_UPSTREAM_ORIGIN;
if (upstream) {
  const url = new URL(upstream);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.origin !== upstream ||
    url.username ||
    url.password
  )
    throw new Error('API_UPSTREAM_ORIGIN must be a canonical HTTPS origin');
}

const config: NextConfig = {
  // Browser checks can run beside the user's development server.
  distDir:
    process.env.E2E_ISOLATED_BUILD === '1' ? '../../.cache/next-e2e' : '.next',
  devIndicators: false,
  poweredByHeader: false,
  rewrites: () =>
    upstream
      ? [{ source: '/api/v1/:path*', destination: `${upstream}/api/v1/:path*` }]
      : [],
  headers: () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
      ],
    },
    {
      source: '/share/:path*',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      ],
    },
  ],
};
export default config;

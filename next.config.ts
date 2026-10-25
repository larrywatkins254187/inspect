import type { NextConfig } from 'next';

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com",
      "font-src 'self'",
      "connect-src 'self' https://challenges.cloudflare.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
      'frame-src https://challenges.cloudflare.com',
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];
const privateHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'no-store' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Always emit metadata in <head> (not streamed), for every user agent.
  htmlLimitedBots: /.*/,
  serverExternalPackages: ['better-sqlite3'],
  images: {
    formats: ['image/webp'],
    qualities: [80],
    dangerouslyAllowSVG: false,
    remotePatterns: [],
    localPatterns: [{ pathname: '/asset-file/**', search: '' }],
    minimumCacheTTL: 86400,
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/admin/:path*', headers: privateHeaders },
      { source: '/admin', headers: privateHeaders },
      { source: '/preview/:path*', headers: privateHeaders },
      { source: '/preview', headers: privateHeaders },
      { source: '/api/:path*', headers: privateHeaders },
      { source: '/health', headers: privateHeaders },
      { source: '/asset-file/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

export default nextConfig;

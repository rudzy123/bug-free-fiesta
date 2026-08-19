import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

const SIGNING_CSP = [
  "default-src 'self'",
  isProduction
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "frame-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const signingHeaders = [
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Content-Security-Policy', value: SIGNING_CSP },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@esign/config', '@esign/contracts'],
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [
      { source: '/signing', headers: signingHeaders },
      { source: '/signing/:path*', headers: signingHeaders },
    ];
  },
};

export default nextConfig;

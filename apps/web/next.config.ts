import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@esign/config', '@esign/contracts'],
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;

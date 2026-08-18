import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@esign/config', '@esign/contracts'],
};

export default nextConfig;

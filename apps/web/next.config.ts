import type { NextConfig } from 'next';
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@marketpilot/contracts'],
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default nextConfig;

import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.PLAYWRIGHT_TEST==='1' ? '.next-test' : '.next',
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
  async headers() { return [{ source: '/(.*)', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'same-origin' }
  ] }]; }
};
export default config;

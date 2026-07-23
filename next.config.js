/** @type {import('next').NextConfig} */
const isCapacitorExport = process.env.CAPACITOR_EXPORT === 'true'

const nextConfig = {
  ...(isCapacitorExport ? { output: 'export' } : {}),
  experimental: {
    serverActions: {
      allowedOrigins: ["vamoverse.app", "localhost:3000", "127.0.0.1:3000"],
    },
  },
  typescript: {
    // Fail build on TS errors for prod safety - do not set ignoreBuildErrors true in production
    ignoreBuildErrors: false,
  },
  eslint: {
    // Fail build on lint errors for prod safety
    ignoreDuringBuilds: false,
  },
  images: {
    unoptimized: process.env.CAPACITOR_EXPORT === 'true',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
};

module.exports = nextConfig;

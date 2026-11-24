/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Lets the iOS end-to-end run (scripts/e2e-ios) start its own dev server next to yours.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Dev server only: the iOS app loads it from 127.0.0.1 (simulator) or the Mac's LAN
  // address (phones, see scripts/ios.sh); without this, /_next assets get 403 and the page never hydrates.
  allowedDevOrigins: [
    '127.0.0.1',
    '*.local',
    '10.*.*.*',
    '192.168.*.*',
    ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
  ],
  typescript: {
    // Fail build on TS errors for prod safety - do not set ignoreBuildErrors true in production
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: false,
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
              // React's development build uses eval for debugging; never allowed in production.
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
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

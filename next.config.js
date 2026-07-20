/** @type {import('next').NextConfig} */
const isCapacitorExport = process.env.CAPACITOR_EXPORT === 'true'

const nextConfig = {
  // For Capacitor static export (optional, requires generateStaticParams for dynamic routes)
  // Use CAPACITOR_EXPORT=true for static export, otherwise keep server mode for livereload
  ...(isCapacitorExport ? { output: 'export' } : {}),
  experimental: {
    serverActions: {
      allowedOrigins: ["*"]
    }
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true, // Required for Capacitor
  },
};

module.exports = nextConfig;

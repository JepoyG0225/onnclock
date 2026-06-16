import type { NextConfig } from "next";

process.env.TZ = process.env.TZ || 'Asia/Manila'

const nextConfig: NextConfig = {
  compress: true,
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', '@react-pdf/renderer'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
  // Force /sw.js (and the web manifest) to never be browser-cached.
  // Without this, an old SW file can linger in the browser's HTTP
  // cache for up to 24h and update checks (registration.update()) just
  // return the stale copy — users keep seeing the old build.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ]
  },
};

export default nextConfig;

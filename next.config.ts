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
};

export default nextConfig;

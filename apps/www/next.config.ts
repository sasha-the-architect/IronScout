import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow dev requests from local HTTPS domains (via Caddy)
  allowedDevOrigins: [
    'https://www.local.ironscout.ai',
  ],
  // Static export for maximum performance
  output: 'export',
  
  // Trailing slashes for cleaner URLs
  trailingSlash: true,
  
  // Image optimization disabled for static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow dev requests from local HTTPS domains (via Caddy)
  allowedDevOrigins: [
    'https://admin.local.ironscout.ai',
    'https://api.local.ironscout.ai',
  ],
  reactStrictMode: true,
  transpilePackages: ['@ironscout/db'],
  async rewrites() {
    return [
      {
        // Proxy /api/search/* to the API server
        source: '/api/search/:path*',
        destination: `${process.env.API_URL || 'http://localhost:8000'}/api/search/:path*`,
      },
    ]
  },
}

module.exports = nextConfig

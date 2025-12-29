/** @type {import('next').NextConfig} */
const nextConfig = {
  // Externalize native Node.js modules that can't be bundled by Turbopack
  serverExternalPackages: ['ssh2', 'cpu-features'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig

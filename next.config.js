/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Increase body size limit for server actions (default is 1MB)
  // Allow up to 50MB for image uploads (they get compressed server-side)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Deploy 2: static legacy paths → canonical `/human` and `/space` (dynamic `/portfolio/[slug]` still handled in route handlers)
  async redirects() {
    return [
      { source: '/portfolio', destination: '/space', permanent: true },
      { source: '/portfolio/create', destination: '/space/create', permanent: true },
    ]
  },
}

module.exports = nextConfig


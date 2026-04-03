import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow importing from the agent package at the monorepo root
  transpilePackages: [],
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
}

export default nextConfig

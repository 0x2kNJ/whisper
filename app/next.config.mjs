/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk', '@unlink-xyz/sdk', '@zk-kit/eddsa-poseidon', 'tweetnacl', 'dotenv'],
    outputFileTracingIncludes: {
      '/api/agent': ['./node_modules/@zk-kit/**/*', './node_modules/@unlink-xyz/**/*', './node_modules/blakejs/**/*', './node_modules/tweetnacl/**/*', './node_modules/tweetnacl-util/**/*'],
    },
  },
}

export default nextConfig

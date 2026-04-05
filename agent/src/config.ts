import dotenv from 'dotenv'
import { resolve } from 'path'
// Load .env from project root (two levels up from agent/src/)
dotenv.config({ path: resolve(process.cwd(), '.env'), override: true })
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })
import type { ChainConfig } from './types.js'

export const UNISWAP_API_BASE = 'https://trade-api.gateway.uniswap.org/v1'
export const UNLINK_API_BASE = 'https://staging-api.unlink.xyz'

export const baseSepolia: ChainConfig = {
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || '',
  name: 'Base Sepolia',
  tokens: {
    USDC: {
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      symbol: 'USDC',
      decimals: 6,
    },
    WETH: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      decimals: 18,
    },
  },
}

export const arcTestnet: ChainConfig = {
  chainId: 5042002,
  rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
  name: 'Arc Testnet',
  tokens: {
    USDC: {
      address: '0x3600000000000000000000000000000000000000',
      symbol: 'USDC',
      decimals: 6,
    },
  },
}

export const ethereumSepolia = {
  chainId: 11155111,
  rpcUrl: process.env.ETH_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
  name: 'Ethereum Sepolia',
}

export const UNLINK_POOL = '0x647f9b99af97e4b79DD9Dd6de3b583236352f482'

// CCTP V2 — Cross-Chain Transfer Protocol
export const CCTP_TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' // Base Sepolia TokenMessengerV2
export const CCTP_ARC_DOMAIN = 26 // Arc Testnet destination domain (Circle-issued)

// Unlink adapter — executes calls on behalf of the pool. Discovered on-chain from execute() tx traces.
export const UNLINK_ADAPTER = '0x41BF8f07BC4644055db5BA95c422AAC1Be810Be3'

// App base URL — used for absolute verify links in chat
export const APP_BASE_URL = process.env.APP_BASE_URL || 'https://app-gamma-one-12.vercel.app'

export function getEnvOrThrow(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}
